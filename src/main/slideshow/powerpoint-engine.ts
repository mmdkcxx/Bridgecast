import { execFile, spawn as nodeSpawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { Canvas } from '../../shared/canvas'
import { isCropRect } from '../../shared/crop'
import { BridgeClient, BridgeError, type BridgeEvent } from './bridge-protocol'
import type { EngineError, EnginePosition, EngineSession, SlideShowEngine } from './engine'

export const HELPER_START_FAILED =
  'The slide show helper could not start. Reinstall Bridgecast. Showing still slides.'

/** macOS refused the window and sound capture (Screen & System Audio Recording). */
export const SCREEN_RECORDING_NEEDED =
  'Allow Bridgecast in System Settings > Privacy & Security > Screen & System Audio Recording, then reopen Bridgecast. Showing still slides.'

/** The part of a child process the engine uses (a fake in tests). */
export interface BridgeChild {
  stdin: { write(chunk: string): unknown; end(): unknown }
  stdout: { on(ev: 'data', cb: (chunk: Buffer | string) => void): unknown }
  stderr?: { on(ev: 'data', cb: (chunk: Buffer | string) => void): unknown }
  on(ev: 'exit', cb: (code: number | null) => void): unknown
  on(ev: 'error', cb: (err: Error) => void): unknown
  kill(): unknown
}
type SpawnFn = (exe: string) => BridgeChild

/** Shown when the sound of PowerPoint cannot be routed or its level changed by the app. */
export const DEFAULT_DEVICE_SOUND = "PowerPoint sound plays on this PC's default device only."

const defaultSpawn: SpawnFn = (exe) =>
  nodeSpawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }) as BridgeChild

/** `ppt-bridge.exe --restore-audio`: puts PowerPoint's session volume/mute back after an abnormal exit. */
const defaultRestoreAudio = (exe: string): Promise<void> =>
  new Promise((resolve) => {
    try {
      execFile(exe, ['--restore-audio'], { timeout: 5000, windowsHide: true }, () => resolve())
    } catch {
      resolve()
    }
  })

/**
 * Where the helper is: `resources/ppt-bridge/ppt-bridge.exe` packaged and the build output in dev
 * on Windows, `mac-ppt-bridge` on macOS.
 */
export function bridgeExePath(opts: {
  platform?: NodeJS.Platform
  packaged: boolean
  resourcesPath: string
  appPath: string
}): string {
  if ((opts.platform ?? 'win32') === 'darwin') {
    return opts.packaged
      ? path.join(opts.resourcesPath, 'mac-ppt-bridge', 'mac-ppt-bridge')
      : path.join(opts.appPath, 'native', 'mac-ppt-bridge', 'dist', 'mac-ppt-bridge')
  }
  return opts.packaged
    ? path.join(opts.resourcesPath, 'ppt-bridge', 'ppt-bridge.exe')
    : path.join(opts.appPath, 'native', 'ppt-bridge', 'bin', 'Release', 'net48', 'ppt-bridge.exe')
}

interface PowerPointEngineOptions {
  exe: string
  spawn?: SpawnFn
  exists?: (file: string) => boolean
  /** Screen DPI (96 = 100 %) used to turn Canvas pixels into points. */
  dpi?: () => number
  /** macOS: folder the helper copies each deck into before PowerPoint opens it (PowerPoint's sandbox asks once per folder). */
  workDir?: string
  /** Called when the helper cannot start. */
  onStartFailure?: (message: string) => void
  /** Runs the one-shot `--restore-audio` of the helper (at engine start, after an abnormal exit). */
  restoreAudio?: (exe: string) => Promise<void>
  /** How long shutdown waits for the helper to exit before killing it. */
  shutdownMs?: number
  /** The sound route changed: a session opened, the helper stopped, or a foreign PowerPoint refused a level. */
  onAudio?: (a: {
    mode: 'pipe' | 'fallback' | 'device' | 'none'
    pipe: string | null
    note: string | null
  }) => void
}

const OPEN_MS = 60_000
const MOVE_MS = 5_000
const PING_MS = 3_000
const EDIT_MS = 30_000

interface Live {
  child: BridgeChild
  client: BridgeClient
  /** `shutdown()` asked for this exit: no `exited` event. */
  stopping: boolean
  exited: boolean
  /** The helper has written something: a later `error` is a broken pipe, not a failed start. */
  heard: boolean
}

/**
 * Slide shows in the real PowerPoint, driven by ppt-bridge.exe over JSON lines
 * (see `native/ppt-bridge/README.md`). The helper starts with the first `open`
 * and again after a `shutdown`. It only closes what it opened itself; a
 * PowerPoint of the operator is never killed.
 */
export class PowerPointEngine implements SlideShowEngine {
  private posCbs: ((p: EnginePosition) => void)[] = []
  private errCbs: ((e: EngineError) => void)[] = []
  private exitCbs: (() => void)[] = []
  private live: Live | null = null
  private startError: string | null = null
  /** Named pipe of the PowerPoint audio (48 kHz stereo float), when the loopback capture works. */
  audioPipe: string | null = null
  /** `pipe`: loopback capture; `fallback`: use setVolume; `none`: no session yet. */
  audioMode: 'pipe' | 'fallback' | 'device' | 'none' = 'none'
  private volume = 1
  private restoredAtStart = false
  /** Why the app cannot control the PowerPoint sound (copy for the operator), or null. */
  audioNote: string | null = null

  constructor(private opts: PowerPointEngineOptions) {}

  on(ev: 'position', cb: (p: EnginePosition) => void): void
  on(ev: 'error', cb: (e: EngineError) => void): void
  on(ev: 'exited', cb: () => void): void
  on(ev: 'position' | 'error' | 'exited', cb: never): void {
    if (ev === 'position') this.posCbs.push(cb)
    else if (ev === 'error') this.errCbs.push(cb)
    else this.exitCbs.push(cb)
  }

  /** The helper is running (started and not exited). */
  get running(): boolean {
    return !!this.live && !this.live.exited
  }

  /** Last start failure message for the operator UI; null when the helper started. */
  get helperError(): string | null {
    return this.startError
  }

  private start(): Live {
    if (this.live && !this.live.exited) return this.live
    const exists = this.opts.exists ?? fs.existsSync
    if (!exists(this.opts.exe)) this.failStart(`slide show helper not found at ${this.opts.exe}`)
    if (!this.restoredAtStart) {
      this.restoredAtStart = true
      this.runRestoreAudio()
    }
    let child: BridgeChild
    try {
      child = (this.opts.spawn ?? defaultSpawn)(this.opts.exe)
    } catch (e) {
      return this.failStart(e instanceof Error ? e.message : String(e))
    }
    const client = new BridgeClient((line) => {
      child.stdin.write(line)
    })
    const live: Live = {
      child,
      client,
      stopping: false,
      exited: false,
      heard: false
    }
    const out = new StringDecoder('utf8')
    child.stdout.on('data', (c) => {
      live.heard = true
      client.feed(typeof c === 'string' ? c : out.write(c))
    })
    const err = new StringDecoder('utf8')
    child.stderr?.on('data', (c) => {
      live.heard = true
      const text = (typeof c === 'string' ? c : err.write(c)).trim()
      if (text) console.warn('[ppt-bridge]', text)
    })
    client.onEvent((e) => this.onBridgeEvent(live, e))
    child.on('error', (e) => {
      if (live.exited) return
      console.error('[ppt-bridge] helper error:', e.message)
      this.gone(live, !live.heard, e.message)
    })
    child.on('exit', (code) => {
      if (live.exited) return
      if (!live.stopping) console.error('[ppt-bridge] helper exited, code', code)
      this.gone(live, !live.heard && !live.stopping, `exit code ${code}`)
    })
    this.live = live
    return live
  }

  private failStart(reason: string): never {
    console.error('[ppt-bridge] start failed:', reason)
    this.startError = HELPER_START_FAILED
    this.opts.onStartFailure?.(HELPER_START_FAILED)
    throw new BridgeError('start', HELPER_START_FAILED)
  }

  /** The helper is gone (exit, spawn error, or its own `exited` event). */
  private gone(live: Live, startFailure: boolean, reason?: string): void {
    if (live.exited) return
    live.exited = true
    live.client.failAll(
      startFailure ? 'start' : 'exited',
      startFailure ? HELPER_START_FAILED : 'The slide show helper stopped. Showing still slides.'
    )
    if (this.live === live) this.live = null
    this.audioPipe = null
    this.audioMode = 'none'
    this.reportAudio()
    if (startFailure) {
      console.error('[ppt-bridge] start failed:', reason)
      this.startError = HELPER_START_FAILED
      this.opts.onStartFailure?.(HELPER_START_FAILED)
      return
    }
    if (!live.stopping) {
      this.runRestoreAudio() // abnormal end: the helper could not put the sound settings back
      for (const cb of this.exitCbs) cb()
    }
  }

  private runRestoreAudio(): void {
    const run = this.opts.restoreAudio ?? defaultRestoreAudio
    run(this.opts.exe).catch(() => {})
  }

  private onBridgeEvent(live: Live, e: BridgeEvent): void {
    if (e.event === 'exited') {
      this.gone(live, false)
      return
    }
    if (e.event === 'position') {
      const { deckId, index, step, clicks } = e as Record<string, unknown>
      if (
        typeof deckId === 'string' &&
        Number.isInteger(index) &&
        Number.isInteger(step) &&
        Number.isInteger(clicks)
      ) {
        const p: EnginePosition = {
          deckId,
          index: index as number,
          step: step as number,
          clicks: clicks as number
        }
        for (const cb of this.posCbs) cb(p)
      }
      return
    }
    if (e.event === 'error') {
      const err: EngineError = {
        message: typeof e.message === 'string' ? e.message : 'The slide show reported an error.',
        ...(typeof e.deckId === 'string' ? { deckId: e.deckId } : {})
      }
      for (const cb of this.errCbs) cb(err)
    }
  }

  async open(deckId: string, file: string, canvas: Canvas): Promise<EngineSession> {
    const live = this.start()
    let res: Record<string, unknown>
    try {
      res = await live.client.request(
        'open',
        {
          deckId,
          file,
          width: canvas.width,
          height: canvas.height,
          dpi: this.opts.dpi?.() ?? 96,
          x: 0,
          y: 0,
          behind: true,
          ...(this.opts.workDir ? { workDir: this.opts.workDir } : {})
        },
        OPEN_MS
      )
    } catch (e) {
      if (e instanceof BridgeError && e.code === 'screenrecording') {
        this.startError = SCREEN_RECORDING_NEEDED
        this.opts.onStartFailure?.(SCREEN_RECORDING_NEEDED)
      }
      throw e
    }
    const windowId = res.windowId
    if (typeof windowId !== 'string' || !windowId) {
      throw new BridgeError('protocol', 'The slide show helper did not return a window.')
    }
    this.startError = null
    this.audioMode =
      res.audio === 'pipe' || res.audio === 'fallback' || res.audio === 'device'
        ? res.audio
        : 'none'
    this.audioNote = this.audioMode === 'device' ? DEFAULT_DEVICE_SOUND : null
    this.audioPipe = typeof res.audioPipe === 'string' ? res.audioPipe : null
    this.reportAudio()
    if (this.audioMode === 'fallback') void this.setVolume(this.volume).catch(() => {})
    const call = async (cmd: 'next' | 'prev' | 'goto' | 'close', args: object): Promise<void> => {
      if (this.live !== live || live.exited) {
        throw new BridgeError('exited', 'The slide show helper stopped.')
      }
      await live.client.request(cmd, { deckId, ...args }, MOVE_MS)
    }
    return {
      deckId,
      windowId,
      ...(isCropRect(res.crop) ? { crop: res.crop } : {}),
      next: () => call('next', {}),
      prev: () => call('prev', {}),
      goto: (index) => call('goto', { index }),
      close: () => call('close', {})
    }
  }

  /** Liveness check; an unanswered ping makes the manager fall back. Resolves at once when nothing runs. */
  async ping(): Promise<void> {
    const live = this.live
    if (!live || live.exited) return
    await live.client.request('ping', {}, PING_MS)
  }

  /** Deck level x master (0..1) for the audio fallback; with the loopback capture the bridge ignores it. */
  async setVolume(volume: number): Promise<void> {
    this.volume = Math.max(0, Math.min(1, volume))
    const live = this.live
    if (!live || live.exited) return
    try {
      await live.client.request('setVolume', { volume: this.volume }, MOVE_MS)
    } catch (e) {
      // The operator's own PowerPoint: its volume is not changed, the sound stays on the default device.
      if (e instanceof BridgeError && e.code === 'foreignapp') {
        this.audioNote = DEFAULT_DEVICE_SOUND
        this.reportAudio()
      } else throw e
    }
  }

  private reportAudio(): void {
    this.opts.onAudio?.({ mode: this.audioMode, pipe: this.audioPipe, note: this.audioNote })
  }

  /** Opens the deck's working copy (`edit.pptx`) in a normal PowerPoint window. */
  async edit(file: string): Promise<void> {
    const live = this.start()
    await live.client.request('edit', { file }, EDIT_MS)
  }

  /**
   * Ends the helper: closing its stdin makes it close its slide shows and quit a PowerPoint
   * it started itself (when nothing else is open in it). After the wait only the helper process
   * is killed. No POWERPNT.EXE is ever killed by the app.
   */
  async shutdown(): Promise<void> {
    const live = this.live
    this.live = null
    this.audioPipe = null
    this.audioMode = 'none'
    this.audioNote = null
    this.reportAudio()
    if (!live || live.exited) return
    live.stopping = true
    live.client.failAll('exited', 'The slide show helper is shutting down.')
    await new Promise<void>((resolve) => {
      let done = false
      const timer = setTimeout(() => {
        // The helper did not end by itself: it hangs (PowerPoint stuck in a COM call). Only the helper
        // process is killed. A PowerPoint it launched stays: the operator may have opened files in it.
        try {
          live.child.kill()
        } catch {
          /* already gone */
        }
        this.runRestoreAudio()
        finish()
      }, this.opts.shutdownMs ?? 5000)
      const finish = (): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        live.exited = true
        resolve()
      }
      live.child.on('exit', finish)
      try {
        live.child.stdin.end()
      } catch {
        try {
          live.child.kill()
        } catch {
          /* already gone */
        }
        finish()
      }
    })
  }
}
