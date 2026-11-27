import type { Canvas } from '../../shared/canvas'
import type { CropRect } from '../../shared/crop'
import { playbackOf } from '../../shared/playback'
import type { ProgramState } from '../../shared/program'
import type { DeckMeta } from '../../shared/types'
import type { AppState } from '../state'
import type { EngineSession, SlideShowEngine } from './engine'
import { stepOnce, walkSteps } from './walk'

const HEARTBEAT_MS = 1000
const HANG_MS = 3000
const RETRY_MS = 3000
/** Live deck + the next native deck. */
const MAX_SESSIONS = 2
/** Farther than this in show order, the engine jumps (goto) instead of stepping. */
const MAX_WALK = 8

interface ManagerTimers {
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (h: unknown) => void
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (h: unknown) => void
  now: () => number
}

const realTimers: ManagerTimers = {
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now()
}

interface Entry {
  deckId: string
  canvas: Canvas
  session: EngineSession | null
  closing: boolean
  /** Where the engine is in this deck (after open: the first slide). */
  pos: { index: number; step: number } | null
  /**
   * A fresh session starts on its first slide. Until the first drive has brought it to the wanted
   * position its engine positions are only recorded, not dispatched, so the output never flashes slide 1.
   */
  settling: boolean
}

const sameCanvas = (a: Canvas, b: Canvas): boolean => a.width === b.width && a.height === b.height

/**
 * Keeps the native slideshow sessions (live deck + next native deck, at most 2),
 * drives the engine from state changes and reports the engine position back.
 * The engine position wins over reducer state.
 */
export class SlideShowManager {
  private entries = new Map<string, Entry>()
  /** nativeFallback was dispatched for these decks and not yet resumed. */
  private fallen = new Set<string>()
  private down = false
  /** Decks whose open failed or errored; not reopened until the retry timer fires. */
  private blocked = new Set<string>()
  private lastOk: number
  private pingInFlight = false
  private heartbeat: unknown
  private retry: unknown = null
  private chain: Promise<void> = Promise.resolve()
  private disposed = false
  /** Bumped when the engine goes down; work from an older generation is abandoned. */
  private gen = 0
  /** Decks whose file is being replaced: no session is opened for them until `resume`. */
  private held = new Set<string>()
  /** Callers of `suspend` waiting for a deck's session to be gone. */
  private goneWaiters = new Map<string, (() => void)[]>()

  constructor(
    private engine: SlideShowEngine,
    private state: AppState,
    private decks: () => DeckMeta[],
    private canvas: () => Canvas,
    /** Path of the deck's PowerPoint file. */
    private fileOf: (deckId: string) => string,
    private timers: ManagerTimers = realTimers,
    /** False when the slide show window cannot be captured (Wayland, no engine): nothing opens, takes use images. */
    private canCapture = true
  ) {
    this.lastOk = timers.now()
    engine.on('position', (p) => this.onPosition(p.deckId, p.index, p.step))
    engine.on('error', (e) => {
      if (e.deckId) this.failDeck(e.deckId)
    })
    engine.on('exited', () => this.engineDown())
    state.onChange(() => this.sync())
    this.heartbeat = timers.setInterval(() => this.tick(), HEARTBEAT_MS)
  }

  private statusCbs: (() => void)[] = []

  /** `cb` runs whenever session readiness may have changed (the caller compares). */
  onStatus(cb: () => void): void {
    this.statusCbs.push(cb)
  }

  private notifyStatus(): void {
    for (const cb of this.statusCbs) cb()
  }

  /** The deck's slideshow is open, the engine is up and no fallback is pending. */
  ready(deckId: string): boolean {
    const e = this.entries.get(deckId)
    return this.canCapture && !!e?.session && !e.closing && !this.down && !this.fallen.has(deckId)
  }

  /** The deck's slide show session is open, whether or not the deck fell back. */
  sessionOpen(deckId: string): boolean {
    const e = this.entries.get(deckId)
    return this.canCapture && !!e?.session && !e.closing && !this.down
  }

  /** The engine failed while the deck was on air and the deck has not been resumed. */
  fellBack(deckId: string): boolean {
    return this.fallen.has(deckId)
  }

  /** The operator's Resume PowerPoint: back to the slide show when its session is open. */
  resumeNative(deckId: string): void {
    if (!this.sessionOpen(deckId)) return
    this.fallen.delete(deckId)
    this.state.dispatch({ type: 'resumeNative', deckId })
    this.sync()
  }

  windowId(deckId: string): string | null {
    const e = this.entries.get(deckId)
    return e?.session && !e.closing ? e.session.windowId : null
  }

  /** The slide's part of the captured window (macOS), null = the whole window. */
  crop(deckId: string): CropRect | null {
    const e = this.entries.get(deckId)
    return e?.session && !e.closing ? (e.session.crop ?? null) : null
  }

  /** Opens the deck's working copy for editing in a normal window. */
  async edit(file: string): Promise<void> {
    await this.engine.edit(file)
  }

  /**
   * Closes the deck's session and keeps it closed (its files are about to be replaced).
   * A deck on air falls back to images meanwhile; `resume` brings the slide show back.
   */
  async suspend(deckId: string): Promise<void> {
    this.held.add(deckId)
    if (this.liveNative(this.state.state, this.decks()) === deckId && !this.fallen.has(deckId)) {
      this.fallBack(deckId)
    }
    this.sync()
    if (!this.entries.has(deckId)) return
    const gone = new Promise<void>((resolve) => {
      this.goneWaiters.set(deckId, [...(this.goneWaiters.get(deckId) ?? []), resolve])
    })
    // A hung engine is left to the heartbeat; the files are replaced anyway.
    await this.withTimeout(gone).catch(() => {})
  }

  /** The deck's files are replaced (or kept): sessions may open for it again. */
  resume(deckId: string): void {
    this.held.delete(deckId)
    this.blocked.delete(deckId)
    this.sync()
  }

  private notifyGone(deckId: string): void {
    const waiters = this.goneWaiters.get(deckId)
    if (!waiters) return
    this.goneWaiters.delete(deckId)
    for (const w of waiters) w()
  }

  dispose(): void {
    this.disposed = true
    this.timers.clearInterval(this.heartbeat)
    if (this.retry !== null) this.timers.clearTimeout(this.retry)
  }

  /** Bring sessions and the engine position in line with the state. */
  sync(): void {
    if (this.disposed) return
    const s = this.state.state
    const decks = this.decks()
    const wanted = this.wantedDecks(s, decks)
    const live = this.liveNative(s, decks)
    const canvas = this.canvas()

    // A fallback only lasts while its deck is on air.
    for (const id of [...this.fallen]) if (id !== live) this.fallen.delete(id)

    for (const e of this.entries.values()) {
      const keep = wanted.includes(e.deckId) && !this.held.has(e.deckId)
      const stale = e.deckId !== live && !sameCanvas(e.canvas, canvas)
      if (!e.closing && (!keep || stale)) this.closeEntry(e)
    }
    if (!this.down && this.canCapture) {
      for (const id of wanted) {
        if (this.entries.has(id) || this.blocked.has(id) || this.held.has(id)) continue
        if (this.entries.size >= MAX_SESSIONS) break // wait for a close to finish
        this.openEntry(id, canvas)
      }
    }
    if (live) this.drive(live)
    this.notifyStatus()
  }

  private liveNative(s: ProgramState, decks: DeckMeta[]): string | null {
    const id = s.shown?.deckId
    const d = id ? decks.find((x) => x.id === id) : undefined
    return d && playbackOf(d) === 'native' ? d.id : null
  }

  private wantedDecks(s: ProgramState, decks: DeckMeta[]): string[] {
    const isNative = (d: DeckMeta): boolean => playbackOf(d) === 'native'
    const anchor = this.liveNative(s, decks) ?? s.deckId ?? null
    const out: string[] = []
    const at = decks.findIndex((d) => d.id === anchor)
    if (at < 0) return out
    if (isNative(decks[at])) out.push(decks[at].id)
    const next = decks.slice(at + 1).find(isNative)
    if (next) out.push(next.id)
    return out.slice(0, MAX_SESSIONS)
  }

  private openEntry(deckId: string, canvas: Canvas): void {
    const e: Entry = {
      deckId,
      canvas: { ...canvas },
      session: null,
      closing: false,
      pos: null,
      settling: true
    }
    this.entries.set(deckId, e)
    this.engine.open(deckId, this.fileOf(deckId), canvas).then(
      (session) => {
        if (this.entries.get(deckId) !== e) {
          void session.close().catch(() => {}) // engine restarted meanwhile
          return
        }
        e.session = session
        e.pos = { index: 0, step: 0 }
        if (e.closing) return this.finishClose(e)
        this.afterOpen(deckId)
      },
      () => {
        if (this.entries.get(deckId) !== e) return
        this.entries.delete(deckId)
        this.notifyGone(deckId)
        this.blocked.add(deckId)
        if (this.liveNative(this.state.state, this.decks()) === deckId) this.fallBack(deckId)
        this.scheduleRetry()
        this.notifyStatus()
      }
    )
  }

  private afterOpen(deckId: string): void {
    if (this.disposed) return
    const live = this.liveNative(this.state.state, this.decks())
    const shown = this.state.state.shown
    if (live === deckId && (this.fallen.has(deckId) || shown?.playback === 'images')) {
      // Taken before the session was ready, or fell back: native again. Clear the
      // fallback first, the reducer asks `ready`.
      this.fallen.delete(deckId)
      this.state.dispatch({ type: 'resumeNative', deckId })
    }
    this.sync()
  }

  private closeEntry(e: Entry): void {
    e.closing = true
    if (e.session) this.finishClose(e)
    // else: the open is still pending; it closes the session when it resolves
  }

  private finishClose(e: Entry): void {
    const done = (): void => {
      if (this.entries.get(e.deckId) === e) {
        this.entries.delete(e.deckId)
        this.notifyGone(e.deckId)
      }
      this.sync()
    }
    e.session!.close().then(done, done)
  }

  private scheduleRetry(): void {
    if (this.retry !== null || this.disposed) return
    this.retry = this.timers.setTimeout(() => {
      this.retry = null
      this.blocked.clear()
      this.sync()
    }, RETRY_MS)
  }

  private fallBack(deckId: string): void {
    this.fallen.add(deckId)
    this.state.dispatch({ type: 'nativeFallback', deckId })
  }

  private failDeck(deckId: string): void {
    const e = this.entries.get(deckId)
    this.blocked.add(deckId)
    if (e) {
      this.entries.delete(deckId)
      this.notifyGone(deckId)
      // Do not leak the window: a retry opens a fresh session.
      if (e.session) void this.withTimeout(e.session.close()).catch(() => {})
    }
    if (this.liveNative(this.state.state, this.decks()) === deckId) this.fallBack(deckId)
    this.scheduleRetry()
    this.notifyStatus()
  }

  /** Engine hung or died: images take over, restart in the background. */
  private engineDown(): void {
    if (this.down || this.disposed) return
    this.down = true
    const gen = ++this.gen
    this.chain = Promise.resolve() // abandon moves stuck on the dead engine
    this.pingInFlight = false
    const live = this.liveNative(this.state.state, this.decks())
    const gone = [...this.entries.keys()]
    this.entries.clear()
    for (const id of gone) this.notifyGone(id)
    if (live) this.fallBack(live)
    this.notifyStatus()
    // A hung shutdown must not keep the engine down forever.
    const restart = (): void => {
      if (gen === this.gen) this.restarted()
    }
    this.withTimeout(this.engine.shutdown()).then(restart, restart)
  }

  private withTimeout<T>(p: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const h = this.timers.setTimeout(() => reject(new Error('engine call timed out')), HANG_MS)
      p.then(
        (v) => {
          this.timers.clearTimeout(h)
          resolve(v)
        },
        (err) => {
          this.timers.clearTimeout(h)
          reject(err)
        }
      )
    })
  }

  private restarted(): void {
    if (this.disposed) return
    this.down = false
    this.lastOk = this.timers.now()
    this.sync()
    if (this.entries.size === 0) this.scheduleRetry()
  }

  private tick(): void {
    const now = this.timers.now()
    if (this.down || this.entries.size === 0) {
      this.lastOk = now
      return
    }
    if (!this.pingInFlight) {
      this.pingInFlight = true
      const gen = this.gen
      this.engine
        .ping()
        .then(
          () => {
            if (gen === this.gen) this.lastOk = this.timers.now()
          },
          () => {}
        )
        .finally(() => {
          if (gen === this.gen) this.pingInFlight = false
        })
    }
    if (now - this.lastOk >= HANG_MS) this.engineDown()
  }

  private onPosition(deckId: string, index: number, step: number): void {
    if (this.disposed) return
    const e = this.entries.get(deckId)
    if (e) e.pos = { index, step }
    const shown = this.state.state.shown
    if (e?.settling) return
    if (shown?.deckId === deckId && shown.playback === 'native') {
      this.state.dispatch({ type: 'enginePosition', deckId, index, step })
    }
  }

  /** Queue the engine moves so they never overlap. */
  private drive(deckId: string): void {
    const gen = this.gen
    this.chain = this.chain
      .then(() => (gen === this.gen ? this.driveNow(deckId, gen) : undefined))
      .catch(() => {})
  }

  private async driveNow(deckId: string, gen: number, walked = false): Promise<void> {
    const s = this.state.state
    const shown = s.shown
    const e = this.entries.get(deckId)
    if (!shown || shown.deckId !== deckId || shown.playback !== 'native') return
    if (!e?.session || e.closing || !e.pos || !this.ready(deckId)) return
    const slides = this.decks().find((d) => d.id === deckId)?.slides ?? []
    const clicks = (i: number): number => slides[i]?.clicks ?? 0
    // The reducer clamps steps to SlideMeta clicks; an engine that runs more animations than the
    // deck knows about (a deck imported without click counts) must not be pulled back to the clamp.
    const cur = { index: e.pos.index, step: Math.min(e.pos.step, clicks(e.pos.index)) }
    const to = { index: shown.index, step: shown.step ?? 0 }
    if (cur.index === to.index && cur.step === to.step) {
      e.settling = false
      return
    }
    const session = e.session
    // Every engine call is bounded; a hung one is left to the heartbeat and abandoned.
    const call = (p: Promise<void>): Promise<void> => this.withTimeout(p)
    const walkSlides = slides.map((x, i) => ({ clicks: clicks(i), hidden: !!x.hidden }))
    // Next/prev pressed faster than PowerPoint follows: step there one move at a time instead
    // of jumping (a jump rebuilds the slide's animations). Only along the operator's own
    // presses: within the slide, or ending on a built step; a jump to the start of another
    // slide (thumbnail, deck navigation) still uses goto, unless it is a single move.
    const walkable = (
      from: { index: number; step: number },
      want: { index: number; step: number }
    ): number | null => {
      const n = walkSteps(walkSlides, from, want, MAX_WALK)
      if (n === null || n === 0) return n
      return from.index === want.index || want.step > 0 || Math.abs(n) === 1 ? n : null
    }
    if (!walked && walkable(cur, to) !== null) {
      // Hold the engine's in-between positions back while walking (each would replace the
      // operator's newer target); the engine position is reported once the walk ends.
      e.settling = true
      let jump = false
      try {
        // Our own count of where the engine is, so a position event arriving after the reply
        // never makes us move twice.
        let at: { index: number; step: number } | null = { index: cur.index, step: cur.step }
        for (let guard = 0; guard < MAX_WALK * 2 && at; guard++) {
          if (gen !== this.gen) return
          const live = this.state.state.shown
          if (!live || live.deckId !== deckId || live.playback !== 'native') return
          if (!e.session || e.closing || !this.ready(deckId)) return
          const n = walkable(at, { index: live.index, step: live.step ?? 0 })
          if (n === null) {
            jump = true
            break
          }
          if (n === 0) return
          const dir = n > 0 ? 1 : -1
          await call(dir > 0 ? e.session.next() : e.session.prev())
          at = stepOnce(walkSlides, at, dir)
        }
      } finally {
        if (!jump && this.entries.get(deckId) === e) {
          e.settling = false
          if (e.pos) this.onPosition(deckId, e.pos.index, e.pos.step) // the engine position wins once settled
        }
      }
      // The target left the operator's path (a jump): goto below, still settling.
      if (jump) return this.driveNow(deckId, gen, true)
      return
    }
    await call(session.goto(to.index))
    // Build the slide up to the wanted step; the engine position still wins afterwards.
    for (let i = 0; i < to.step && i < clicks(to.index); i++) {
      if (gen !== this.gen) return
      await call(session.next())
    }
    if (e.settling) {
      e.settling = false
      if (e.pos) this.onPosition(deckId, e.pos.index, e.pos.step) // the engine position wins once settled
    }
  }
}
