import type { ClickerDirection, DeckMeta, EventMeta, EventSummary, Playback } from './types'
import type { OrderItem } from './sections'
import type { Action, ProgramState } from './program'
import type { NdiSettings, NdiStatus, OmtSettings, OmtStatus } from './omt'
import type {
  AudioSettings,
  ClickerKeys,
  HdmiSettings,
  PptImportFormat,
  Settings
} from './settings'
import type { DisplayInfo } from './displays'
import type { Canvas, DeckFit } from './canvas'
import type { NewEventOptions } from './event-outputs'
import type { DeckAudio } from './audio-levels'
import type { SlideshowStatus } from './playback'
import type { UpdateStatus } from './update'
import type {
  PrepareInput,
  WebCaptureSource,
  WebCaptureWarning,
  WebChromeStatus,
  WebNavState,
  WebOutputs,
  WebStatus
} from './web'

/** Request/response channels (ipcRenderer.invoke ↔ ipcMain.handle). */
export const Invoke = {
  eventsList: 'events:list',
  eventsCreate: 'events:create',
  eventsSelect: 'events:select',
  eventsSummaries: 'events:summaries',
  eventsSetArchived: 'events:setArchived',
  decksList: 'decks:list',
  decksImport: 'decks:import',
  decksAddRendered: 'decks:addRendered',
  decksConvertPptx: 'decks:convertPptx',
  decksReorder: 'decks:reorder',
  slidesReorder: 'slides:reorder',
  decksRemove: 'decks:remove',
  decksOrphans: 'decks:orphans',
  decksRestore: 'decks:restore',
  decksRename: 'decks:rename',
  decksSetFit: 'decks:setFit',
  decksSetAudio: 'decks:setAudio',
  eventsSetCanvas: 'events:setCanvas',
  canvasSetDefault: 'canvas:setDefault',
  importSetFormat: 'import:setFormat',
  sectionsAdd: 'sections:add',
  sectionsRename: 'sections:rename',
  sectionsRemove: 'sections:remove',
  kvSet: 'kv:set',
  kvClear: 'kv:clear',
  programDispatch: 'program:dispatch',
  programGet: 'program:get',
  settingsGet: 'settings:get',
  clickerSetBackground: 'clicker:setBackground',
  clickerSetKeys: 'clicker:setKeys',
  appVersion: 'app:version',
  displaysList: 'displays:list',
  hdmiSet: 'hdmi:set',
  hdmiGetStatus: 'hdmi:getStatus',
  audioSet: 'audio:set',
  audioPatch: 'audio:patch',
  omtSet: 'omt:set',
  omtGetStatus: 'omt:getStatus',
  ndiSet: 'ndi:set',
  ndiGetStatus: 'ndi:getStatus',
  networkSetFps: 'network:setFps',
  networkSetContentOnly: 'network:setContentOnly',
  webAdd: 'web:add',
  webSetUrl: 'web:setUrl',
  webReload: 'web:reload',
  webNav: 'web:nav',
  webStop: 'web:stop',
  webHome: 'web:home',
  webSetZoom: 'web:setZoom',
  webNavStates: 'web:navStates',
  webInput: 'web:input',
  webSetInteract: 'web:setInteract',
  webSourceId: 'web:sourceId',
  webFrame: 'web:frame',
  webEnded: 'web:ended',
  webHeld: 'web:held',
  webOpenPrepare: 'web:openPrepare',
  webSignOut: 'web:signOut',
  webChromeStatus: 'web:chromeStatus',
  webChromeSet: 'web:chromeSet',
  webChromeSignIn: 'web:chromeSignIn',
  webStatuses: 'web:statuses',
  webOutputs: 'web:outputs',
  webCaptureFailed: 'web:captureFailed',
  webCaptureWarnings: 'web:captureWarnings',
  slideshowSourceId: 'slideshow:sourceId',
  slideshowNote: 'slideshow:note',
  slideshowStatus: 'slideshow:status',
  deckEdit: 'deck:edit',
  deckEditDone: 'deck:editDone',
  deckApplyNow: 'deck:applyNow',
  deckRevert: 'deck:revert',
  deckIsEdited: 'deck:isEdited',
  deckSetPlayback: 'deck:setPlayback',
  updateStatus: 'update:status',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateSkip: 'update:skip'
} as const

/**
 * Renderer → main one-way messages (ipcRenderer.send). Main only accepts them
 * from the webContents they concern (see HdmiOutput), so another window cannot
 * spoof them.
 */
export const Send = {
  /**
   * Sent once by an output window (`#/output`) when its first layer for the
   * current program state (a slide, or black) is decoded, committed and painted.
   */
  outputReady: 'output:ready',
  /** OMT output window: asks main for a fresh audio MessagePort (answered by `omt:audio-port`). */
  omtAudioPortRequest: 'omt:audio-port-request',
  /** OMT output window: its sound tap failed to load (payload 'no-sound'; anything else is ignored). */
  omtAudioWarning: 'omt:audio-warning',
  /** HDMI or OMT output window: asks main for a fresh MessagePort carrying PowerPoint's sound. */
  slideshowAudioPortRequest: 'slideshow:audio-port-request'
} as const

/** Main → renderer broadcasts (webContents.send ↔ ipcRenderer.on). */
export const Broadcast = {
  programState: 'program:state',
  importProgress: 'import:progress',
  displaysChanged: 'displays:changed',
  hdmiStatus: 'hdmi:status',
  audioSettings: 'audio:settings',
  outputSettings: 'output:settings',
  omtStatus: 'omt:status',
  ndiStatus: 'ndi:status',
  webStatus: 'web:status',
  webNavState: 'web:navState',
  webOutputs: 'web:outputs',
  webCaptureWarnings: 'web:captureWarnings',
  webChromeStatus: 'web:chromeStatus',
  slideshowNote: 'slideshow:note',
  slideshowStatus: 'slideshow:status',
  deckPending: 'deck:pending',
  deckEditError: 'deck:editError',
  updateStatus: 'update:status',
  clickerPress: 'clicker:press'
} as const

/** Main → OMT output window: carries the MessagePort the window sends program sound on. */
export const OMT_AUDIO_PORT = 'omt:audio-port'

/**
 * Main → output window (HDMI, OMT): carries the MessagePort that streams PowerPoint's
 * sound as planar 10 ms blocks `{ data: Float32Array, samples: 480 }`. The preload forwards
 * it to the page as `window.postMessage('slideshow:audio-port', '*', ports)`.
 */
export const SLIDESHOW_AUDIO_PORT = 'slideshow:audio-port'

/** A saved edit (or a revert) of a deck waits for the deck to leave air (`deck:pending`). */
export interface DeckPendingEvent {
  deckId: string
  pending: boolean
}

/** A background re-export of an edited deck failed; the previous version is still used (`deck:editError`). */
export interface DeckEditErrorEvent {
  deckId: string
  /** User-facing message with the fix. */
  message: string
}

export interface ImportProgress {
  id: string
  name: string
  percent: number
  status: 'busy' | 'done' | 'error'
  message?: string
}

/**
 * HDMI output window state: `showing` (fullscreen on its display), `hidden`
 * (its display is not connected, or it is still being prepared: `message`),
 * `off`, or `error` with a user-facing `message` that says how to fix it.
 */
export interface HdmiStatus {
  state: 'showing' | 'hidden' | 'off' | 'error'
  message?: string
}

/** Pages rendered in the renderer (pdf.js for a PDF, a canvas for an image) and handed to main to store. */
export interface RenderedDeck {
  name: string
  source: 'pdf' | 'image'
  width: number
  height: number
  pages: Uint8Array[]
  notes?: string[]
  /** Absolute path of the PDF on disk (`pathForFile`); stored as source.pdf so it can play as vector. */
  sourcePath?: string
}

/** macOS: a PowerPoint file converted to PDF in main; the renderer draws its pages (pdf.js). */
export interface ConvertedPptx {
  pdf: Uint8Array
  /** Temp PDF; pass it back as `RenderedDeck.sourcePath` so main keeps the PowerPoint file as original.*. */
  pdfPath: string
}

/** Load state of one web deck's page, broadcast as `web:status`. */
export interface WebStatusEvent {
  deckId: string
  status: WebStatus
  /** User-facing message with the fix, for `error`. */
  message?: string
  /** User-facing warning while the page works (its window is not the canvas size). */
  warning?: string
}

export interface ImportRequest {
  id: string
  path: string
}

/** A deck on disk that no event lists, with the event that owns it (null when that is gone). */
export interface OrphanDeck {
  deckId: string
  name: string
  eventId: string | null
}

export interface Session {
  eventId: string | null
  state: ProgramState
}

/** Argument tuple and result for every invoke channel. */
export interface InvokeMap {
  'app:version': { args: []; result: string }
  'events:list': { args: []; result: EventMeta[] }
  'events:create': { args: [name: string, options?: NewEventOptions]; result: EventMeta }
  'events:select': { args: [eventId: string]; result: ProgramState }
  'events:summaries': { args: []; result: EventSummary[] }
  /** Refused while that event holds the output (something on air). */
  'events:setArchived': { args: [eventId: string, archived: boolean]; result: EventMeta }
  'decks:list': { args: [eventId: string]; result: DeckMeta[] }
  'decks:import': { args: [eventId: string, files: ImportRequest[]]; result: void }
  'decks:addRendered': { args: [eventId: string, payload: RenderedDeck]; result: DeckMeta }
  'decks:convertPptx': { args: [file: string]; result: ConvertedPptx }
  'decks:reorder': { args: [eventId: string, items: OrderItem[]]; result: void }
  'slides:reorder': { args: [deckId: string, order: number[]]; result: void }
  'decks:remove': { args: [eventId: string, deckId: string]; result: void }
  /** Decks on disk that no event lists (a lost event list). `eventId` is null when its event is gone. */
  'decks:orphans': { args: []; result: OrphanDeck[] }
  /** Puts an orphaned deck back at the end of its event; false when the event no longer exists. */
  'decks:restore': { args: [deckId: string, eventId: string]; result: boolean }
  'decks:rename': { args: [eventId: string, deckId: string, name: string]; result: DeckMeta }
  /** How the deck's slides fill the canvas; takes effect on the output without replaying a live video. */
  'decks:setFit': { args: [eventId: string, deckId: string, fit: DeckFit]; result: DeckMeta }
  /** The deck's own volume and mute (0–100, sanitized in the library). */
  'decks:setAudio': { args: [eventId: string, deckId: string, audio: DeckAudio]; result: DeckMeta }
  /** Per-event canvas override; `null` goes back to the machine default. Throws if the size is invalid. */
  'events:setCanvas': { args: [eventId: string, canvas: Canvas | null]; result: EventMeta }
  /** Machine default canvas; sanitized, saved, then applied to every event without an override. */
  'canvas:setDefault': { args: [canvas: Canvas]; result: Settings }
  /** Linux: what to do with imported PowerPoint files (.odp or as imported); saved, applies to the next import. */
  'import:setFormat': { args: [format: PptImportFormat]; result: Settings }
  'sections:add': {
    args: [eventId: string, at: number | 'end']
    result: { event: EventMeta; sectionId: string }
  }
  'sections:rename': { args: [eventId: string, sectionId: string, name: string]; result: EventMeta }
  'sections:remove': { args: [eventId: string, sectionId: string]; result: EventMeta }
  /** Absolute path of an image (PNG, JPG, WebP, at most 50 MB); returns the updated event. */
  'kv:set': { args: [eventId: string, path: string]; result: EventMeta }
  'kv:clear': { args: [eventId: string]; result: EventMeta }
  'program:dispatch': { args: [action: Action]; result: ProgramState }
  'program:get': { args: []; result: Session }
  'settings:get': { args: []; result: Settings }
  /** Settings > Clicker in the background; applies at once. */
  'clicker:setBackground': { args: [on: boolean]; result: Settings }
  /** Settings > Clicker keys: PageDown/PageUp or Right/Left; applies at once. */
  'clicker:setKeys': { args: [keys: ClickerKeys]; result: Settings }
  'displays:list': { args: []; result: DisplayInfo[] }
  /** Validated in main against the connected displays; saves and applies at once. */
  'hdmi:set': { args: [hdmi: HdmiSettings]; result: Settings }
  'hdmi:getStatus': { args: []; result: HdmiStatus }
  /** Sanitized, saved, then broadcast as `audio:settings`; applies at once to the output. */
  'audio:set': { args: [audio: AudioSettings]; result: Settings }
  /** Partial update merged with the saved audio (see mergeAudio), then saved and broadcast like `audio:set`. */
  'audio:patch': { args: [patch: Partial<AudioSettings>]; result: Settings }
  /** Sanitized, saved, then applied: starts, restarts or stops the OMT sender. */
  'omt:set': { args: [omt: OmtSettings]; result: Settings }
  'omt:getStatus': { args: []; result: OmtStatus }
  /** Sanitized, saved, then applied: starts, restarts or stops the NDI target only. */
  'ndi:set': { args: [ndi: NdiSettings]; result: Settings }
  'ndi:getStatus': { args: []; result: NdiStatus }
  /** Saves `omt.fps` (30 or 60, anything else becomes 30) without touching `omt.enabled`; restarts the running targets. */
  'network:setFps': { args: [fps: 30 | 60]; result: Settings }
  /** Saves `sendContentOnly` (a non-boolean is refused); the network outputs follow it at the next program change. */
  'network:setContentOnly': { args: [on: boolean]; result: Settings }
  /**
   * Adds a web deck (URL checked with `sanitizeWebUrl`); without a name the deck
   * is named after the domain, then after the page title once it has loaded.
   */
  'web:add': { args: [eventId: string, url: string, name?: string]; result: DeckMeta }
  /** Changes a web deck's page and loads it. */
  'web:setUrl': { args: [deckId: string, url: string]; result: DeckMeta }
  'web:reload': { args: [deckId: string]; result: void }
  'web:nav': { args: [deckId: string, dir: 'back' | 'forward']; result: void }
  /** Stops the page's load. Allowed on air (it only stops a load). */
  'web:stop': { args: [deckId: string]; result: void }
  /** Loads the deck's saved address (HOLD first when the page is on air). */
  'web:home': { args: [deckId: string]; result: void }
  /** Page zoom of a web deck (one of `PAGE_ZOOMS`); refused while the deck is on air and not frozen. */
  'web:setZoom': { args: [deckId: string, zoom: number]; result: DeckMeta }
  /** Current navigation state of every open page (later changes arrive as `web:navState`). */
  'web:navStates': { args: []; result: WebNavState[] }
  /** Prepare input; false when refused (deck on air and not frozen, or not valid). */
  'web:input': { args: [deckId: string, input: PrepareInput]; result: boolean }
  /**
   * Interact on or off for a web deck. On only while the page is on air (refused otherwise);
   * off always. Main keeps the switch only while the deck is on air in the open event and its
   * window is open, so a stale renderer cannot keep it on. Operator and Prepare windows only.
   */
  'web:setInteract': { args: [deckId: string, on: boolean]; result: void }
  /** Capture id of the deck's page for the calling window (`kind`: tab capture or a helper window). */
  'web:sourceId': { args: [deckId: string]; result: WebCaptureSource }
  /** The calling window received the first captured frame of the page (ready gate). */
  'web:frame': { args: [deckId: string]; result: void }
  /** An output's capture track of the page ended (HOLD while the deck is on air). */
  'web:ended': { args: [deckId: string]; result: void }
  /** The calling window paused its stream of the page (HOLD before Reload, Back, Forward, a new URL). */
  'web:held': { args: [deckId: string]; result: void }
  'web:openPrepare': { args: [deckId: string]; result: void }
  /** Clears the web profile and reloads every page; refused while a web deck is on air. */
  'web:signOut': { args: []; result: void }
  /** Linux: Chrome for web pages (setting, detection, sign-in window). */
  'web:chromeStatus': { args: []; result: WebChromeStatus }
  /** Linux: turn Chrome for web pages on or off; it applies after a restart. */
  'web:chromeSet': { args: [on: boolean]; result: WebChromeStatus }
  /** Linux: open Chrome on the Bridgecast profile to sign in to Google (refused with the fix). */
  'web:chromeSignIn': { args: []; result: WebChromeStatus }
  /** Current load state of every open page (later changes arrive as `web:status`). */
  'web:statuses': { args: []; result: WebStatusEvent[] }
  /** Which outputs main counts for the ready gate (later changes arrive as `web:outputs`). */
  'web:outputs': { args: []; result: WebOutputs }
  /** HDMI or OMT window: capturing the live page failed (true) or works again (false). */
  'web:captureFailed': { args: [deckId: string, failed: boolean]; result: void }
  /** Current capture warnings (later changes arrive as `web:captureWarnings`). */
  'web:captureWarnings': { args: []; result: WebCaptureWarning[] }
  /**
   * Capture id (`window:<hwnd>:<n>`, the deck's PowerPoint slide show window only) for the
   * calling app window. Refused for any other window; rejects when the deck has no slide
   * show window (the caller then shows the slide's PNG). Never a screen.
   */
  'slideshow:sourceId': { args: [deckId: string]; result: string }
  /** The calling window received the first captured frame of the deck's slide show. */
  'slideshow:frame': { args: [deckId: string]; result: void }
  /** Why the app cannot control PowerPoint's sound (operator copy), or null. */
  'slideshow:note': { args: []; result: string | null }
  /** Session state of each native deck and the helper start failure, if any. */
  'slideshow:status': { args: []; result: SlideshowStatus }
  /** Opens the deck's working copy in a PowerPoint window; every save is exported again. PowerPoint decks only. */
  'deck:edit': { args: [deckId: string, confirmed?: boolean]; result: void }
  /** Stops watching the working copy and exports the last saved version now; rejects when that fails. */
  'deck:editDone': { args: [deckId: string]; result: void }
  /** Applies the saved version now even though the deck is on air (the caller confirms first). */
  'deck:applyNow': { args: [deckId: string]; result: void }
  /** Goes back to the imported file; on air it is applied when the deck leaves air. Rejects when it fails. */
  'deck:revert': { args: [deckId: string]; result: void }
  /** The deck's file differs from the imported one (Revert is available). */
  'deck:isEdited': { args: [deckId: string]; result: boolean }
  /** How the deck plays; rejects with the library's message for a mode the deck cannot use. */
  'deck:setPlayback': {
    args: [eventId: string, deckId: string, playback: Playback]
    result: DeckMeta
  }
  'update:status': { args: []; result: UpdateStatus }
  'update:check': { args: []; result: UpdateStatus }
  'update:download': { args: []; result: UpdateStatus }
  /** False while anything is on air, or before the update is downloaded. */
  'update:install': { args: []; result: boolean }
  'update:skip': { args: []; result: UpdateStatus }
}

export interface BroadcastMap {
  'program:state': ProgramState
  'import:progress': ImportProgress
  'displays:changed': DisplayInfo[]
  'hdmi:status': HdmiStatus
  'audio:settings': AudioSettings
  /** Main changed HDMI, OMT or NDI by itself (an event's saved outputs were applied). */
  'output:settings': Settings
  'omt:status': OmtStatus
  'ndi:status': NdiStatus
  'web:status': WebStatusEvent
  'web:navState': WebNavState
  'web:outputs': WebOutputs
  'web:captureWarnings': WebCaptureWarning[]
  'web:chromeStatus': WebChromeStatus
  'slideshow:note': string | null
  'slideshow:status': SlideshowStatus
  'deck:pending': DeckPendingEvent
  'deck:editError': DeckEditErrorEvent
  'update:status': UpdateStatus
  /** A clicker key pressed while no Bridgecast window has focus (operator window only). */
  'clicker:press': ClickerDirection
}

export type InvokeChannel = keyof InvokeMap

/**
 * `slide://<deckId>/<file>`, e.g. `slide://<uuid>/003.png`. Built from the
 * slide's file (SlideMeta.file / ShownSlide.file), never its index: the same
 * URL is always the same image, so a reorder can never show a stale image.
 */
export function slideUrl(deckId: string, file: string): string {
  return `slide://${deckId}/${file}`
}

/**
 * `slide://<deckId>/thumbs/<n>.jpg`: small (320 px) thumbnail of slide file
 * `<n>.png`, for the strip. Follows the slide's file, so a reorder keeps the
 * right thumbnail.
 */
export function thumbUrl(deckId: string, file: string): string {
  return `slide://${deckId}/thumbs/${file.replace(/\.png$/i, '.jpg')}`
}

/**
 * `slide://kv/<eventId>/<file>`: the event's KV image (file = EventMeta.kv, a
 * new name for every upload, so a URL never shows an older image).
 */
export function kvImageUrl(eventId: string, file: string): string {
  return `slide://kv/${eventId}/${file}`
}

export interface Api {
  listEvents(): Promise<EventMeta[]>
  eventSummaries(): Promise<EventSummary[]>
  setEventArchived(eventId: string, archived: boolean): Promise<EventMeta>
  /** `options`: the event's own canvas and outputs, set in the New event dialog. */
  createEvent(name: string, options?: NewEventOptions): Promise<EventMeta>
  selectEvent(eventId: string): Promise<ProgramState>
  listDecks(eventId: string): Promise<DeckMeta[]>
  importDecks(eventId: string, files: ImportRequest[]): Promise<void>
  addRendered(eventId: string, payload: RenderedDeck): Promise<DeckMeta>
  /** macOS only: converts a PowerPoint file to PDF (Keynote, else LibreOffice). */
  convertPptx(file: string): Promise<ConvertedPptx>
  reorderDecks(eventId: string, items: OrderItem[]): Promise<void>
  addSection(eventId: string, at: number | 'end'): Promise<{ event: EventMeta; sectionId: string }>
  renameSection(eventId: string, sectionId: string, name: string): Promise<EventMeta>
  removeSection(eventId: string, sectionId: string): Promise<EventMeta>
  reorderSlides(deckId: string, order: number[]): Promise<void>
  removeDeck(eventId: string, deckId: string): Promise<void>
  /** Deck folders that no event lists; offered to the operator so they are not lost. */
  orphanDecks(): Promise<OrphanDeck[]>
  /** Puts an orphaned deck back at the end of its event; false when that event is gone. */
  restoreDeck(deckId: string, eventId: string): Promise<boolean>
  /** Display name only; validated in main (not empty, at most 120 characters). */
  renameDeck(eventId: string, deckId: string, name: string): Promise<DeckMeta>
  /** Fit, Fill or Stretch for the deck's slides on the output. */
  setDeckFit(eventId: string, deckId: string, fit: DeckFit): Promise<DeckMeta>
  /** Deck volume (0–100) and mute for its video slides. */
  setDeckAudio(eventId: string, deckId: string, audio: DeckAudio): Promise<DeckMeta>
  /** Canvas override for one event, or `null` to use the machine default. */
  setEventCanvas(eventId: string, canvas: Canvas | null): Promise<EventMeta>
  /** Machine default canvas size; validated in main. */
  setDefaultCanvas(canvas: Canvas): Promise<Settings>
  setImportFormat(format: PptImportFormat): Promise<Settings>
  /** Set the event's KV image from an absolute path (`pathForFile`); validated in main. */
  setKv(eventId: string, path: string): Promise<EventMeta>
  clearKv(eventId: string): Promise<EventMeta>
  dispatch(action: Action): Promise<ProgramState>
  getSession(): Promise<Session>
  onProgramState(cb: (s: ProgramState) => void): () => void
  onImportProgress(cb: (p: ImportProgress) => void): () => void
  getSettings(): Promise<Settings>
  setClickerBackground(on: boolean): Promise<Settings>
  setClickerKeys(keys: ClickerKeys): Promise<Settings>
  /** The app version (package.json), for the About section of Settings. */
  getAppVersion(): Promise<string>
  listDisplays(): Promise<DisplayInfo[]>
  onDisplaysChanged(cb: (d: DisplayInfo[]) => void): () => void
  /** Turns HDMI output on/off or moves it to another display (applied at once). */
  setHdmi(h: HdmiSettings): Promise<Settings>
  getHdmiStatus(): Promise<HdmiStatus>
  onHdmiStatus(cb: (s: HdmiStatus) => void): () => void
  /** Sound device and mute for video slides on the HDMI output (applied at once). */
  setAudio(a: AudioSettings): Promise<Settings>
  patchAudio(patch: Partial<AudioSettings>): Promise<Settings>
  onAudioSettings(cb: (a: AudioSettings) => void): () => void
  onOutputSettings(cb: (s: Settings) => void): () => void
  /** Output window only (HDMI): the first frame for the current program state is rendered. */
  outputReady(): void
  setOmt(o: OmtSettings): Promise<Settings>
  getOmtStatus(): Promise<OmtStatus>
  onOmtStatus(cb: (s: OmtStatus) => void): () => void
  setNdi(n: NdiSettings): Promise<Settings>
  getNdiStatus(): Promise<NdiStatus>
  onNdiStatus(cb: (s: NdiStatus) => void): () => void
  /** Frame rate of every network protocol; updates `omt.fps` and leaves `omt.enabled` alone. */
  setNetworkFps(fps: 30 | 60): Promise<Settings>
  /** Whether OMT and NDI send only the slide without Fit bars; saved at once. */
  setNetworkContentOnly(on: boolean): Promise<Settings>
  /**
   * OMT output window only. Main answers with a fresh MessagePort that the
   * preload forwards to the page as `window.postMessage('omt:audio-port', '*', ports)`
   * (the page listens for a `message` event whose data is 'omt:audio-port' and uses e.ports[0]).
   */
  requestOmtAudioPort(): void
  /** OMT output window only: its sound tap could not be loaded; main shows it as OmtStatus.warning. */
  reportOmtWarning(w: 'no-sound'): void
  addWebDeck(eventId: string, url: string, name?: string): Promise<DeckMeta>
  setWebUrl(deckId: string, url: string): Promise<DeckMeta>
  reloadWeb(deckId: string): Promise<void>
  navWeb(deckId: string, dir: 'back' | 'forward'): Promise<void>
  stopWeb(deckId: string): Promise<void>
  homeWeb(deckId: string): Promise<void>
  setWebZoom(deckId: string, zoom: number): Promise<DeckMeta>
  webNavStates(): Promise<WebNavState[]>
  onWebNavState(cb: (s: WebNavState) => void): () => void
  webInput(deckId: string, input: PrepareInput): Promise<boolean>
  /** Interact on or off for a web deck (see `web:setInteract`). */
  setWebInteract(deckId: string, on: boolean): Promise<void>
  /** Capture id and kind of a web deck's page for the calling window. */
  webSourceId(deckId: string): Promise<WebCaptureSource>
  /** Ready gate: report the first frame of the page's capture. */
  webFrame(deckId: string): Promise<void>
  /** Output only: the page's capture track ended. */
  webEnded(deckId: string): Promise<void>
  /** Output or operator monitor: the stream of the page is paused (HOLD). */
  webHeld(deckId: string): Promise<void>
  openPrepare(deckId: string): Promise<void>
  signOutWeb(): Promise<void>
  webChromeStatus(): Promise<WebChromeStatus>
  setWebChrome(on: boolean): Promise<WebChromeStatus>
  /** Opens Chrome on the Bridgecast profile; its closing arrives through `onWebChromeStatus`. */
  signInGoogle(): Promise<WebChromeStatus>
  onWebChromeStatus(cb: (s: WebChromeStatus) => void): () => void
  webStatuses(): Promise<WebStatusEvent[]>
  onWebStatus(cb: (s: WebStatusEvent) => void): () => void
  /** Which outputs are active for the ready gate (who captures pages that are not live yet). */
  webOutputs(): Promise<WebOutputs>
  onWebOutputs(cb: (o: WebOutputs) => void): () => void
  /** HDMI or OMT window: the live page cannot be captured (true) or can again (false). */
  webCaptureFailed(deckId: string, failed: boolean): Promise<void>
  webCaptureWarnings(): Promise<WebCaptureWarning[]>
  onWebCaptureWarnings(cb: (w: WebCaptureWarning[]) => void): () => void
  /** Capture id of a native deck's slide show window (see `slideshow:sourceId`). */
  slideshowSourceId(deckId: string): Promise<string>
  /** Ready gate: report the first frame of a slide show's capture. */
  /**
   * HDMI or OMT output window: asks main for a MessagePort with PowerPoint's sound; the
   * preload forwards it as `window.postMessage('slideshow:audio-port', '*', ports)`.
   */
  requestSlideshowAudioPort(): void
  /** Why PowerPoint's sound cannot be controlled by the app (copy), or null. */
  slideshowNote(): Promise<string | null>
  onSlideshowNote(cb: (note: string | null) => void): () => void
  slideshowStatus(): Promise<SlideshowStatus>
  onSlideshowStatus(cb: (s: SlideshowStatus) => void): () => void
  /** Opens the deck in a PowerPoint window for editing (PowerPoint decks). */
  editDeck(deckId: string, confirmed?: boolean): Promise<void>
  /** Done editing: export the last saved version now. */
  editDeckDone(deckId: string): Promise<void>
  /** Apply the saved version now, even though the deck is on air (confirm first). */
  applyDeckNow(deckId: string): Promise<void>
  /** Back to the imported file (confirm first: "Undo all edits and go back to the imported file?"). */
  revertDeck(deckId: string): Promise<void>
  isDeckEdited(deckId: string): Promise<boolean>
  setDeckPlayback(eventId: string, deckId: string, playback: Playback): Promise<DeckMeta>
  /** "Changes apply when this deck leaves air." while `pending` is true. */
  onDeckPending(cb: (e: DeckPendingEvent) => void): () => void
  onDeckEditError(cb: (e: DeckEditErrorEvent) => void): () => void
  /** Current update state; resolves `{ kind: 'unsupported' }` when this build cannot self-update. */
  getUpdateStatus(): Promise<UpdateStatus>
  /** Checks for an update now and returns the resulting state. */
  checkForUpdate(): Promise<UpdateStatus>
  /** Downloads the update; the result is the state after the download finished (or failed). */
  downloadUpdate(): Promise<UpdateStatus>
  /** False while anything is on air; quits and installs otherwise. */
  installUpdate(): Promise<boolean>
  /** Hides this version from future announcements. */
  skipUpdate(): Promise<UpdateStatus>
  onUpdateStatus(cb: (s: UpdateStatus) => void): () => void
  onClickerPress(cb: (d: ClickerDirection) => void): () => void
  pathForFile(file: File): string
}
