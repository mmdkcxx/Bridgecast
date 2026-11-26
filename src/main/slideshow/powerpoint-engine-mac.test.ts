import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PowerPointEngine,
  bridgeExePath,
  SCREEN_RECORDING_NEEDED,
  type BridgeChild
} from './powerpoint-engine'

type Msg = Record<string, unknown>

/** A scripted stand-in for the bridge helper. */
class FakeChild implements BridgeChild {
  written: Msg[] = []
  stdinEnded = false
  killed = false
  exitCbs: ((c: number | null) => void)[] = []
  errCbs: ((e: Error) => void)[] = []
  dataCbs: ((c: Buffer | string) => void)[] = []
  /** What to answer per command; return undefined for no reply. */
  reply: (m: Msg) => Msg | undefined = (m) => ({ id: m.id, ok: true })
  /** Exit when stdin closes (a healthy helper). */
  exitOnEnd = true

  stdin = {
    write: (chunk: string): boolean => {
      for (const line of chunk.split('\n').filter(Boolean)) {
        const m = JSON.parse(line) as Msg
        this.written.push(m)
        const r = this.reply(m)
        if (r) this.send(r)
      }
      return true
    },
    end: (): void => {
      this.stdinEnded = true
      if (this.exitOnEnd) this.exit(0)
    }
  }
  stdout = {
    on: (_ev: 'data', cb: (c: Buffer | string) => void): void => void this.dataCbs.push(cb)
  }
  stderr = { on: (): void => {} }
  on(ev: 'exit', cb: (code: number | null) => void): void
  on(ev: 'error', cb: (err: Error) => void): void
  on(ev: 'exit' | 'error', cb: never): void {
    if (ev === 'exit') this.exitCbs.push(cb)
    else this.errCbs.push(cb)
  }
  kill(): void {
    this.killed = true
    this.exit(null)
  }

  send(m: Msg): void {
    for (const cb of this.dataCbs) cb(JSON.stringify(m) + '\n')
  }
  sendBytes(b: Buffer): void {
    for (const cb of this.dataCbs) cb(b)
  }
  exit(code: number | null): void {
    for (const cb of this.exitCbs) cb(code)
  }
  fail(e: Error): void {
    for (const cb of this.errCbs) cb(e)
  }
}

const canvas = { width: 1920, height: 1080 }
let child: FakeChild
let spawned: string[]
let engine: PowerPointEngine
let startFailures: string[]

const openReply =
  (extra: Msg = {}) =>
  (m: Msg): Msg | undefined =>
    m.cmd === 'open'
      ? { id: m.id, ok: true, windowId: '1049870', ...extra }
      : { id: m.id, ok: true }

function make(opts: Partial<ConstructorParameters<typeof PowerPointEngine>[0]> = {}): void {
  engine = new PowerPointEngine({
    exe: 'C:\\app\\ppt-bridge.exe',
    spawn: (exe) => {
      spawned.push(exe)
      return child
    },
    exists: () => true,
    dpi: () => 144,
    onStartFailure: (m) => startFailures.push(m),
    restoreAudio: async () => {},
    shutdownMs: 1000,
    ...opts
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(process, 'kill').mockImplementation(() => true)
  child = new FakeChild()
  child.reply = openReply()
  spawned = []
  startFailures = []
  make()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('bridgeExePath on macOS', () => {
  it('uses the mac helper when packaged and in dev, and the Windows helper by default', () => {
    const packaged = bridgeExePath({
      platform: 'darwin',
      packaged: true,
      resourcesPath: '/r',
      appPath: '/a'
    })
    const dev = bridgeExePath({
      platform: 'darwin',
      packaged: false,
      resourcesPath: '/r',
      appPath: '/a'
    })
    const windows = bridgeExePath({ packaged: true, resourcesPath: '/r', appPath: '/a' })
    expect(packaged.replace(/\\/g, '/')).toBe('/r/mac-ppt-bridge/mac-ppt-bridge')
    expect(dev.replace(/\\/g, '/')).toBe('/a/native/mac-ppt-bridge/dist/mac-ppt-bridge')
    expect(windows.replace(/\\/g, '/')).toBe('/r/ppt-bridge/ppt-bridge.exe')
  })
})

describe('PowerPointEngine on macOS', () => {
  it('sends the work folder with open', async () => {
    make({ workDir: '/ud/PowerPoint export' })
    await engine.open('d1', '/lib/source.pptx', canvas)
    expect(child.written[0]).toMatchObject({
      cmd: 'open',
      workDir: '/ud/PowerPoint export'
    })

    child = new FakeChild()
    child.reply = openReply()
    make()
    await engine.open('d1', '/lib/source.pptx', canvas)
    expect('workDir' in child.written[0]).toBe(false)
  })

  it('reads the crop of the window picture', async () => {
    const crop = { x: 0.0156, y: 0.0311, width: 0.9689, height: 0.9689 }
    child.reply = openReply({ crop })
    const s = await engine.open('d1', 'f.pptx', canvas)
    expect(s.crop).toEqual(crop)
  })

  it('ignores an invalid crop', async () => {
    child.reply = openReply({ crop: { x: 0.5, y: 0, width: 0.6, height: 1 } })
    const tooWide = await engine.open('d1', 'f.pptx', canvas)
    expect(tooWide.crop).toBeUndefined()

    child.reply = openReply({ crop: 'x' })
    const notAnObject = await engine.open('d2', 'f.pptx', canvas)
    expect(notAnObject.crop).toBeUndefined()

    child.reply = openReply()
    const missing = await engine.open('d3', 'f.pptx', canvas)
    expect(missing.crop).toBeUndefined()
  })

  it('explains Screen Recording when macOS refuses the capture', async () => {
    child.reply = (m) =>
      m.cmd === 'open'
        ? { id: m.id, ok: false, code: 'screenrecording', message: 'x' }
        : { id: m.id, ok: true }
    await expect(engine.open('d1', 'f.pptx', canvas)).rejects.toThrow()
    expect(startFailures).toContain(SCREEN_RECORDING_NEEDED)
    expect(engine.helperError).toBe(SCREEN_RECORDING_NEEDED)
  })
})
