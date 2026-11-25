import type { DeckMeta, SectionMeta } from '../../shared/types'
import { playbackOf, type EngineState } from '../../shared/playback'
import type { DeckFit } from '../../shared/canvas'
import { kvOnAir, pendingTake, reduce, type Action, type ProgramState } from '../../shared/program'
import { segmentsOf } from '../../shared/sections'
import { slideUrl, type HdmiStatus } from '../../shared/ipc'
import { DEFAULT_AUDIO, type AudioSettings, type HdmiSettings } from '../../shared/settings'
import { DEFAULT_DECK_AUDIO, effectiveGain, type DeckAudio } from '../../shared/audio-levels'
import type { PrepareInput, WebCaptureWarning, WebStatus } from '../../shared/web'
import { VIDEO_EXTENSIONS_RE } from '../../shared/video-file'
import { IMAGE_EXTENSIONS_RE } from '../../shared/image-file'
import { posterWithVersion, type StreamSourceKind } from './stream'

export type NextView =
  | { kind: 'none' }
  | {
      kind: 'slide'
      deckId: string
      index: number
      file: string
      notes: string
      /** The slide is a video slide. */
      video?: true
      /** Frozen: this is the operator position, a preview only (unfreeze keeps the held slide live). */
      held?: true
    }
  | { kind: 'end'; nextDeck: string | null; auto: boolean }
  /** Auto advance stops at the end of a section; `nextSection` is the next section with slides. */
  | { kind: 'sectionEnd'; nextSection: string | null }

export function currentDeck(decks: DeckMeta[], s: ProgramState): DeckMeta | null {
  const d = decks.find((x) => x.id === s.deckId)
  return d && d.slides.length > 0 ? d : null
}

/**
 * What the "Up next" panel shows: the slide Next will put live. That is
 * the slide after the operator position, or the position itself while nothing
 * from this event is on the output (see `pendingTake`).
 */
export function nextIndex(decks: DeckMeta[], s: ProgramState): number {
  return pendingTake(s, decks) ? s.index : s.index + 1
}

export function nextView(
  decks: DeckMeta[],
  s: ProgramState,
  sections: SectionMeta[] = []
): NextView {
  const deck = currentDeck(decks, s)
  if (!deck) return { kind: 'none' }
  const here = deck.slides[s.index]
  if (s.frozen && s.shown && here) {
    return {
      kind: 'slide',
      deckId: deck.id,
      index: s.index,
      file: here.file,
      notes: here.notes,
      ...(here.video ? { video: true as const } : {}),
      held: true
    }
  }
  if (pendingTake(s, decks)) {
    const cur = deck.slides[s.index]
    return {
      kind: 'slide',
      deckId: deck.id,
      index: s.index,
      file: cur.file,
      notes: cur.notes,
      ...(cur.video ? { video: true as const } : {})
    }
  }
  // Hidden slides are skipped by Next, so they are never "up next".
  let ni = s.index + 1
  while (deck.slides[ni]?.hidden) ni++
  const nxt = deck.slides[ni]
  if (nxt) {
    return {
      kind: 'slide',
      deckId: deck.id,
      index: ni,
      file: nxt.file,
      notes: nxt.notes,
      ...(nxt.video ? { video: true as const } : {})
    }
  }
  if (sections.length > 0 && s.autoAdvance) {
    const segs = segmentsOf(decks, sections)
    const si = segs.findIndex((seg) => seg.decks.includes(deck))
    if (si >= 0) {
      const inSegment = segs[si].decks
      const later = inSegment.slice(inSegment.indexOf(deck) + 1)
      if (!later.some((d) => d.slides.length > 0)) {
        const ns = segs.slice(si + 1).find((seg) => seg.decks.some((d) => d.slides.length > 0))
        return { kind: 'sectionEnd', nextSection: ns?.section?.name ?? null }
      }
    }
  }
  const pos = decks.indexOf(deck)
  const nd = decks.slice(pos + 1).find((d) => d.slides.length > 0)
  return { kind: 'end', nextDeck: nd ? nd.name : null, auto: s.autoAdvance }
}

/** An action is possible when the reducer changes the state (it returns the same object for a no-op). */
export function canNext(decks: DeckMeta[], s: ProgramState, sections: SectionMeta[] = []): boolean {
  return reduce(s, { type: 'next' }, decks, sections) !== s
}

export function canPrev(decks: DeckMeta[], s: ProgramState, sections: SectionMeta[] = []): boolean {
  return reduce(s, { type: 'prev' }, decks, sections) !== s
}

export function canNextSection(
  decks: DeckMeta[],
  s: ProgramState,
  sections: SectionMeta[]
): boolean {
  return reduce(s, { type: 'nextSection' }, decks, sections) !== s
}

export function canPrevSection(
  decks: DeckMeta[],
  s: ProgramState,
  sections: SectionMeta[]
): boolean {
  return reduce(s, { type: 'prevSection' }, decks, sections) !== s
}

export type Tally = 'live' | 'frozen' | 'black' | 'kv' | 'idle'

export function tally(s: ProgramState): Tally {
  // KV on (pressed by the operator) is on air whatever else is going on. The
  // automatic KV while STANDBY keeps the STANDBY tally (nothing was taken yet).
  if (s.kv && kvOnAir(s)) return 'kv'
  // STANDBY goes black only when the operator turned the automatic KV off (K).
  if (!s.shown) return s.black && s.kvUrl !== null ? 'black' : 'idle'
  if (s.black) return 'black'
  if (s.frozen) return 'frozen'
  return 'live'
}

/**
 * Changing the canvas resizes what the audience sees, so it needs a confirm
 * unless nothing of the show is visible: STANDBY and BLACK show no slide.
 * Another event's canvas (not the air event) never touches the output.
 */
export function needsCanvasConfirm(s: ProgramState, eventId?: string): boolean {
  if (eventId !== undefined && eventId !== s.airEvent) return false
  const t = tally(s)
  return t !== 'idle' && t !== 'black'
}

interface KeyLike {
  key: string
  ctrlKey?: boolean
  altKey?: boolean
  metaKey?: boolean
  repeat?: boolean
  shiftKey?: boolean
  target: EventTarget | null
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as {
    tagName?: string
    isContentEditable?: boolean
    closest?: (sel: string) => unknown
  } | null
  if (!el) return false
  // Panels marked data-no-shortcuts (the output popover) own the keyboard: Space
  // there toggles a switch, it must not take the next slide live.
  if (el.closest?.('[data-no-shortcuts]')) return true
  const tag = (el.tagName ?? '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable
}

/** Keyboard shortcuts: Space/→ Next, ← Prev, F Freeze, B Black, K KV, N next section, Shift+N previous section, D next deck, Shift+D previous deck. Ignored while typing. */
export function keyToAction(e: KeyLike): Action | null {
  if (e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return null
  // A held key (or a clicker that auto-repeats) must never skip slides: every
  // action fires once per physical press.
  if (e.repeat) return null
  switch (e.key) {
    case ' ':
    case 'ArrowRight':
    case 'ArrowDown': // some clickers send Down/Up instead of PageDown/PageUp
    case 'PageDown': // presentation clickers
      return { type: 'next' }
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      return { type: 'prev' }
    case 'f':
    case 'F':
      return { type: 'toggleFreeze' }
    case 'b':
    case 'B':
    case '.': // the "blank screen" button of many clickers
      return { type: 'toggleBlack' }
    case 'k':
    case 'K':
      return { type: 'toggleKv' }
    case 'n':
    case 'N':
      // Shift decides, never the case: Caps Lock sends 'N' without Shift.
      return { type: e.shiftKey ? 'prevSection' : 'nextSection' }
    case 'd':
    case 'D':
      // Shift decides, never the case: Caps Lock sends 'D' without Shift.
      return { type: e.shiftKey ? 'prevDeck' : 'nextDeck' }
    default:
      return null
  }
}

export type FileKind = 'pptx' | 'pdf' | 'video' | 'image' | 'unsupported'

export function fileKind(name: string): FileKind {
  if (/\.pptx?$/i.test(name)) return 'pptx'
  if (/\.pdf$/i.test(name)) return 'pdf'
  if (VIDEO_EXTENSIONS_RE.test(name)) return 'video'
  if (IMAGE_EXTENSIONS_RE.test(name)) return 'image'
  return 'unsupported'
}

/** macOS: PowerPoint files are converted to PDF in main (PowerPoint, Keynote or LibreOffice) before import. */
export const isMacOS = (): boolean => /Mac OS X|Macintosh/.test(navigator.userAgent)

/** Copy for a dropped or picked item that cannot be imported (an error row). */
export const UNSUPPORTED = {
  meta: 'Unsupported',
  file: 'Only PPTX, PPT, PDF, image (PNG, JPG, WebP, GIF, BMP, AVIF), MP4, M4V, WebM, MOV, or MKV files can be imported.'
} as const

/** True when a drag carries files from outside (Explorer), not a deck or slide being reordered. */
export function hasFiles(types: ArrayLike<string> | null | undefined): boolean {
  return !!types && Array.from(types).includes('Files')
}

/**
 * Move one item from index `from` to index `to` (as in the mockup: take it
 * out, insert it at `to`). Returns a new array; invalid indices return a copy.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from === to || !(from in next) || !(to in next)) return next
  const [m] = next.splice(from, 1)
  next.splice(to, 0, m)
  return next
}

/** Order for `slides:reorder` after moving slide `from` to `to`: order[newIndex] = oldIndex. */
export function moveOrder(n: number, from: number, to: number): number[] {
  return moveItem(
    Array.from({ length: n }, (_, i) => i),
    from,
    to
  )
}

/** Status text of a busy import row: queued (0 %) or converting. */
export function importMeta(percent: number): string {
  return percent <= 0 ? 'Queued' : 'Converting'
}

/** Strip Electron's "Error invoking remote method 'x': Error: " prefix so the user sees our message. */
export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']*':\s*(?:\w*Error:\s*)?/, '')
}

/** "3 slides", "1 deck": a count with its noun, pluralised. */
export function countOf(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

export function baseName(name: string): string {
  return name.replace(/\.[^.\\/]+$/, '')
}

/**
 * What is on the Program output. A video slide carries its PNG as `poster` (its
 * last frame) and the `take` that put it live, so each window plays a take once.
 */
export type OutputMedia =
  | { kind: 'image'; url: string; fit: DeckFit }
  | { kind: 'video'; url: string; poster: string; take: number; fit: DeckFit }
  /**
   * A vector deck: page `page` (1-based) of its source.pdf drawn by pdf.js. `poster` is
   * the slide's PNG, shown while the page is not drawn and when it cannot be.
   */
  | { kind: 'pdf'; url: string; page: number; poster: string; fit: DeckFit }
  /**
   * A live capture (a web deck's page, or a native deck's slide show window). `poster`
   * is the deck's snapshot or the slide's PNG, shown when the capture fails; `paused`
   * holds the last frame (Freeze, or HOLD for a web page).
   */
  | {
      kind: 'stream'
      source: StreamSourceKind
      deckId: string
      poster: string
      paused: boolean
      take: number
    }

/**
 * What the Program output shows, for the HDMI window and the operator monitor:
 * null = black. Black on is black. KV on (with a KV) is the KV. Else the `shown`
 * slide (never the operator position), also while frozen: a video when it has
 * one, else its image. Else (STANDBY) the event's KV, or black without one.
 * The `shown` slide carries its deck's `fit` (missing = `fit`); the KV is always `fit`.
 * A web deck's page is a stream, paused while frozen or held; its poster (the
 * snapshot, rewritten under the same name) carries `posterVersion` to reload it.
 * A native deck (`shown.playback === 'native'`) is a desktop stream of its slide show
 * window with the slide's PNG as poster; once it has fallen back (`images`) it is that PNG.
 */
export function outputSource(s: ProgramState, posterVersion = 0): OutputMedia | null {
  if (s.black) return null
  if (s.kv && s.kvUrl) return { kind: 'image', url: s.kvUrl, fit: 'fit' }
  if (s.shown?.web) {
    const { deckId } = s.shown.web
    return {
      kind: 'stream',
      source: 'tab',
      deckId,
      poster: posterWithVersion(slideUrl(s.shown.deckId, s.shown.file), posterVersion),
      paused: s.frozen || s.webHold,
      take: s.take
    }
  }
  // A native deck's slide show window, captured. `images` (fallen back) uses the PNG; `vector` is a PDF page.
  if (s.shown?.playback === 'native') {
    return {
      kind: 'stream',
      source: 'desktop',
      deckId: s.shown.deckId,
      poster: posterWithVersion(slideUrl(s.shown.deckId, s.shown.file), posterVersion),
      paused: s.frozen,
      take: s.take
    }
  }
  if (s.shown) {
    const { deckId, file, video } = s.shown
    const fit = s.shown.fit ?? 'fit'
    // An edited deck's files are replaced under the same names: the version reloads them.
    const versioned = (name: string): string =>
      posterWithVersion(slideUrl(deckId, name), posterVersion)
    const poster = versioned(file)
    if (s.shown.playback === 'vector' && !video) {
      return {
        kind: 'pdf',
        url: versioned('source.pdf'),
        page: s.shown.index + 1,
        poster,
        fit
      }
    }
    return video
      ? { kind: 'video', url: versioned(video), poster, take: s.take, fit }
      : { kind: 'image', url: poster, fit }
  }
  return s.kvUrl ? { kind: 'image', url: s.kvUrl, fit: 'fit' } : null
}

/**
 * Gain (0–1) of the output's video sound: the live deck's level times the
 * master. Settings not known yet (null) count as the defaults, so only the
 * deck level applies; the output stays muted separately until they arrive.
 */
export function outputGain(s: ProgramState, audio: AudioSettings | null): number {
  return effectiveGain(s.shown?.audio ?? DEFAULT_DECK_AUDIO, audio ?? DEFAULT_AUDIO)
}

export interface HdmiBadge {
  /** ok = green (window showing), off = gray, warn = amber (display unplugged), error = red. */
  tone: 'ok' | 'off' | 'warn' | 'error'
  text: string
}

/** Header HDMI status: green only when the window is actually on the second display. */
export function hdmiBadge(status: HdmiStatus | null, hdmi: HdmiSettings): HdmiBadge {
  if (!hdmi.enabled || status?.state === 'off') return { tone: 'off', text: 'HDMI off' }
  if (status?.state === 'error') return { tone: 'error', text: 'HDMI error' }
  if (status?.state === 'showing') return { tone: 'ok', text: 'HDMI live' }
  if (status?.state === 'hidden' && !status.message) {
    return { tone: 'warn', text: 'HDMI hidden' }
  }
  return { tone: 'off', text: 'HDMI starting…' }
}

/** Status line of the HDMI section in the output popover. */
export function hdmiStatusText(status: HdmiStatus | null, hdmi: HdmiSettings): string {
  if (!hdmi.enabled || status?.state === 'off') return 'Off'
  if (!status) return 'Starting HDMI output…'
  if (status.message) return status.message
  if (status.state === 'showing') return 'Live'
  return 'Hidden, display not connected'
}

/** Role of a thumbnail in the strip (frozen: the slide still on air while Freeze holds the output). */
export type SlideRole = 'live' | 'frozen' | 'next' | 'pos'

const ROLE_TEXT: Record<SlideRole, string> = {
  live: 'live',
  frozen: 'frozen',
  next: 'next',
  pos: 'operator position'
}

/** Accessible name of a thumbnail: number plus role, so a screen reader hears what is on air. */
export function slideLabel(index: number, role: SlideRole | undefined): string {
  return role ? `Slide ${index + 1}, ${ROLE_TEXT[role]}` : `Slide ${index + 1}`
}

/**
 * Role of slide `i` of `deckId`. The slide on air (`shown`) is LIVE, or FROZEN
 * while Freeze holds it: it outranks next and the operator position.
 */
export function slideRole(
  decks: DeckMeta[],
  s: ProgramState,
  deckId: string,
  i: number
): SlideRole | undefined {
  const t = tally(s)
  if (s.shown && s.shown.deckId === deckId && s.shown.index === i) {
    if (t === 'live') return 'live'
    if (t === 'frozen') return 'frozen'
  }
  if (s.deckId === deckId) {
    if (i === nextIndex(decks, s)) return 'next'
    if (i === s.index) return 'pos'
  }
  return undefined
}

/**
 * Alt+arrow reorder: the target index for a focused item, or null when the key
 * is not a reorder key for this axis or the item is already at that end.
 */
export function reorderTarget(
  key: string,
  axis: 'vertical' | 'horizontal',
  index: number,
  count: number
): number | null {
  const [back, fwd] = axis === 'vertical' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
  const to = key === back ? index - 1 : key === fwd ? index + 1 : null
  return to !== null && to >= 0 && to < count ? to : null
}

/** Roving focus inside a menu: the index to focus for a key, or null for other keys. */
export function menuFocusTarget(key: string, current: number, count: number): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowDown':
      return (current + 1) % count
    case 'ArrowUp':
      return (current - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/**
 * Words for a deck whose sound is not the default (shown on its row, so the
 * operator sees it without opening the menu); null while it plays at full volume.
 * Muted wins over the volume, because that is what the audience hears.
 */
export function deckSoundLabel(a: DeckAudio | undefined): string | null {
  if (!a) return null
  if (a.muted) return 'Deck sound: muted'
  return a.volume === DEFAULT_DECK_AUDIO.volume ? null : `Deck sound: ${a.volume}%`
}

/** Short confirmations shown in a polite live region. */
export const SAVED = { kv: 'KV saved', order: 'Order saved' } as const

/** What the Prepare banner says: this web deck is not on air, is on air, or is on air and frozen. */
export type PrepareBanner = 'idle' | 'live' | 'frozen'

/** Live = this deck is the one shown (`shown.deckId`); another deck on air leaves this one idle. */
export function prepareBanner(s: ProgramState, deckId: string): PrepareBanner {
  if (s.shown?.deckId !== deckId) return 'idle'
  return s.frozen ? 'frozen' : 'live'
}

/** The operator monitor's banner while Interact is on (its words; the icon says it too). */
export const INTERACTING_TEXT = 'INTERACTING: your clicks reach the audience. Esc to stop.'

/** Status line words, state first. `interact` changes the not-on-air and the on-air lines. */
export function prepareBannerText(b: PrepareBanner, interact = false): string {
  switch (b) {
    case 'idle':
      return interact
        ? 'Not on air. Interact is on: clicks and typing go to the page.'
        : 'Not on air. Interact to click and type in the page.'
    case 'live':
      return interact
        ? 'On air. Interact is on: your clicks reach the audience. Press Esc to stop.'
        : 'On air. Turn on Interact to click and type in the page.'
    case 'frozen':
      return 'Frozen. The output holds the last frame. Your clicks show on air after Unfreeze.'
  }
}

type ModifierKeys = Pick<KeyboardEvent, 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>

function modifiersOf(e: ModifierKeys): string[] {
  const m: string[] = []
  if (e.shiftKey) m.push('shift')
  if (e.ctrlKey) m.push('control')
  if (e.altKey) m.push('alt')
  if (e.metaKey) m.push('meta')
  return m
}

/** Keys that do nothing on their own (a modifier alone, a dead key): not sent to the page. */
const SILENT_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'AltGraph',
  'CapsLock',
  'Dead',
  'Unidentified'
])

/**
 * One DOM event on the Prepare preview as input for the page. `rect` is the
 * preview's content rect (the stage with the canvas aspect, never the window), so
 * x and y are 0 to 1 of the page; a point outside it gives null. Wheel deltas keep
 * the DOM sign (positive = down): main flips them for Electron. Key events carry
 * the DOM `key` and the modifiers; `keypress` does not exist here, see toPrepareChar.
 */
/** A keydown or keyup as page input (the key itself; no typed character). Null for silent keys. */
export function toPrepareKey(e: KeyboardEvent): PrepareInput | null {
  if (SILENT_KEYS.has(e.key)) return null
  return {
    kind: 'key',
    type: e.type === 'keydown' ? 'keyDown' : 'keyUp',
    keyCode: e.key,
    modifiers: modifiersOf(e)
  }
}

export function toPrepareInput(
  e: MouseEvent | WheelEvent | KeyboardEvent,
  rect: DOMRect
): PrepareInput | null {
  if (e.type === 'keydown' || e.type === 'keyup') return toPrepareKey(e as KeyboardEvent)
  const m = e as MouseEvent
  if (rect.width <= 0 || rect.height <= 0) return null
  const x = (m.clientX - rect.left) / rect.width
  const y = (m.clientY - rect.top) / rect.height
  // Leaving the preview reports the last position inside it (clamped), so hover menus close.
  if (e.type === 'mouseleave') {
    return {
      kind: 'mouse',
      type: 'mouseLeave',
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      button: 'left',
      clickCount: 0
    }
  }
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  if (e.type === 'wheel') {
    const w = e as WheelEvent
    return { kind: 'wheel', x, y, deltaX: w.deltaX, deltaY: w.deltaY }
  }
  const type =
    e.type === 'mousedown'
      ? 'mouseDown'
      : e.type === 'mouseup'
        ? 'mouseUp'
        : e.type === 'mousemove'
          ? 'mouseMove'
          : null
  if (!type) return null
  const button =
    m.button === 0 ? 'left' : m.button === 1 ? 'middle' : m.button === 2 ? 'right' : null
  if (!button) return null
  const clickCount = type === 'mouseMove' ? 0 : Math.min(3, Math.max(1, Math.round(m.detail) || 1))
  return { kind: 'mouse', type, x, y, button, clickCount }
}

/**
 * The `char` event that goes with a key press that types a character (the page
 * needs keyDown and char to type). Enter types a carriage return; shortcuts with
 * Ctrl or Meta and navigation keys type nothing.
 */
export function toPrepareChar(e: KeyboardEvent): PrepareInput | null {
  if (e.ctrlKey || e.metaKey) return null
  const typed = e.key === 'Enter' ? '\r' : e.key.length === 1 ? e.key : null
  if (typed === null) return null
  return { kind: 'key', type: 'char', keyCode: typed, modifiers: modifiersOf(e) }
}

/** Up next copy while a web deck is live (not frozen): Next goes to the page. */
export const WEB_LIVE_NEXT = 'Web page: Next goes to the page. Press D to take the next deck.'
/** Up next copy when the next take is a web deck whose page is not ready. */
export const WEB_NOT_READY = 'Web page not ready'
/** HOLD warning when the page is not in error (a deliberate Reload, Back, Forward or new URL). */
export const WEB_HOLD_NAVIGATING_TEXT =
  'The output holds the last good frame while the web page changes. Resume web when the page is ready.'
/** HOLD warning: the live page lost its connection. */
export const WEB_HOLD_TEXT =
  'Web page lost its connection. The output holds the last good frame. Press K for the key visual or take the next deck.'

/**
 * Up next copy for web decks, or null for the normal view. A live web deck (not
 * frozen) says Next goes to the page. Else, when the next take puts a web deck
 * on air (the pending take of the operator deck, or the next deck after the last
 * slide with auto advance on) and its page is not `ready`: "Web page not ready".
 */
export function webUpNext(
  s: ProgramState,
  decks: DeckMeta[],
  status: Record<string, WebStatus>
): string | null {
  const current = decks.find((d) => d.id === s.deckId)
  if (!current) return null
  if (!s.frozen && current.source === 'web') {
    return pendingTake(s, decks) ? notReady(current, status) : WEB_LIVE_NEXT
  }
  if (s.frozen) return null
  const nx = nextView(decks, s)
  if (nx.kind === 'slide' && pendingTake(s, decks)) return notReady(current, status)
  if (nx.kind === 'end' && nx.auto) {
    const pos = decks.indexOf(current)
    const target = decks.slice(pos + 1).find((d) => d.slides.length > 0)
    return target ? notReady(target, status) : null
  }
  return null
}

function notReady(deck: DeckMeta, status: Record<string, WebStatus>): string | null {
  return deck.source === 'web' && status[deck.id] !== 'ready' ? WEB_NOT_READY : null
}

/** Chip on a web deck row; HOLD (the live page lost its connection) wins over the load state. */
export type WebChipKind = WebStatus | 'hold'

export function webChip(status: WebStatus | undefined, hold: boolean): WebChipKind {
  return hold ? 'hold' : (status ?? 'loading')
}

export const WEB_CHIP_TEXT: Record<WebChipKind, string> = {
  loading: 'Loading',
  ready: 'Ready',
  error: 'Error',
  hold: 'HOLD'
}

/** Resume web needs HOLD and a page that has recovered (`ready`). */
export function canResumeWeb(s: ProgramState, status: Record<string, WebStatus>): boolean {
  return s.webHold && !!s.shown?.web && status[s.shown.web.deckId] === 'ready'
}

/**
 * Capture warnings to show. While the live page is on HOLD its output already holds
 * the last good frame and the HOLD warning explains it, so the capture warning of
 * that deck (the same lost connection seen from the output) would only repeat it.
 */
export function visibleCaptureWarnings(
  warnings: WebCaptureWarning[],
  s: ProgramState
): WebCaptureWarning[] {
  if (!s.webHold) return warnings
  return warnings.filter((w) => w.deckId !== s.shown?.web?.deckId)
}

/** The deck whose row shows HOLD: the live web deck while held, also while frozen; else null. */
export function holdDeckId(s: ProgramState): string | null {
  return s.webHold ? (s.shown?.web?.deckId ?? null) : null
}

/** Clicks of the live native slide, or null when the live slide is not a native slide with steps. */
function liveSteps(s: ProgramState, decks: DeckMeta[]): { clicks: number; step: number } | null {
  const shown = s.shown
  if (!shown || shown.playback !== 'native') return null
  const clicks = decks.find((d) => d.id === shown.deckId)?.slides[shown.index]?.clicks ?? 0
  return clicks > 0 ? { clicks, step: shown.step ?? 0 } : null
}

/** "Slide 4 · step 2/3" for the live native slide with animation steps, else null. */
export function stepLabel(s: ProgramState, decks: DeckMeta[]): string | null {
  const l = liveSteps(s, decks)
  return l && s.shown ? `Slide ${s.shown.index + 1} · step ${l.step}/${l.clicks}` : null
}

/** What Next does on a live native slide that still has steps; null once they are done (or frozen). */
export function nextStepText(s: ProgramState, decks: DeckMeta[]): string | null {
  const l = liveSteps(s, decks)
  if (!l || s.frozen || l.step >= l.clicks) return null
  return `Next: step ${l.step + 1} of ${l.clicks} on this slide`
}

/** The deck's playback chip in the Decks list. `engine` matters for native decks only. */
export function playbackChip(d: DeckMeta, engine: EngineState | null): string {
  const mode = playbackOf(d)
  if (mode === 'vector') return 'Vector'
  if (mode === 'images') return 'Still images'
  if (engine === 'ready') return 'Native · Ready'
  if (engine === 'fallback') return 'Native · Fallback'
  return 'Native · Opening…'
}

export const NATIVE_NOT_READY = 'The slide show is not ready; showing still slides.'
export const nativeNotResponding = (app: 'PowerPoint' | 'LibreOffice'): string =>
  `${app} is not responding. Showing still slides. Save your other ${app} files, then press Resume ${app}.`
export const NATIVE_HELPER_FAILED =
  'The slide show helper could not start. Reinstall Bridgecast. Showing still slides.'
export const NATIVE_PENDING = 'Changes apply when this deck leaves air.'
/** Shown before Edit in LibreOffice (same text as the main process refuses without). */
export const LO_EDIT_CONFIRM =
  "LibreOffice may change animations or layout when it saves a PowerPoint file. The client's original file is not changed."
export const REVERT_CONFIRM = 'Undo all edits and go back to the imported file?'
export const APPLY_NOW_CONFIRM = 'Apply the changes now, while this deck is on air?'

export type NativeNotice = 'notReady' | 'notResponding' | 'helper'

/**
 * Why the live native deck shows still slides, or null while it plays natively. A helper that
 * could not start is told first, since nothing else can fix it.
 */
export function nativeNotice(
  s: ProgramState,
  decks: DeckMeta[],
  status: { decks: Record<string, EngineState>; helperError: string | null } | null
): NativeNotice | null {
  const shown = s.shown
  if (!shown || shown.playback !== 'images') return null
  const d = decks.find((x) => x.id === shown.deckId)
  if (!d || playbackOf(d) !== 'native') return null
  if (status?.helperError) return 'helper'
  return status?.decks[d.id] === 'fallback' ? 'notResponding' : 'notReady'
}

/** The deck's version goes up by one (its files were replaced under the same names). */
export function bumpVersion(v: Record<string, number>, deckId: string): Record<string, number> {
  return { ...v, [deckId]: (v[deckId] ?? 0) + 1 }
}

/** Sum of version maps (web snapshots and replaced deck files) per deck id. */
export function sumVersions(...maps: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of maps) for (const [id, v] of Object.entries(m)) out[id] = (out[id] ?? 0) + v
  return out
}

/**
 * Decks the operator has open in PowerPoint (Done editing shows). A save that is applied
 * (`deck:pending` false) keeps the session: the working copy is still being watched.
 */
export function editingAfter(
  editing: string[],
  event: 'start' | 'applied' | 'done' | 'revert',
  deckId: string
): string[] {
  if (event === 'start') return editing.includes(deckId) ? editing : [...editing, deckId]
  if (event === 'applied') return editing
  return editing.filter((x) => x !== deckId)
}

/** Shown when there is no event to import into. `action` finishes the sentence, e.g. 'add files'. */
export const NO_EVENT_YET = (action: string): string =>
  `No event yet. Create one with New in the header, then ${action}.`
