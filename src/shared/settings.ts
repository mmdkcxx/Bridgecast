import { sanitizeVolume } from './audio-levels'
import { DEFAULT_CANVAS, sanitizeCanvas, type Canvas } from './canvas'
import { sanitizeUpdates, type UpdateSettings } from './update'
import {
  sanitizeNdi,
  sanitizeOmt,
  type AudioRoute,
  type NdiSettings,
  type OmtSettings
} from './omt'

/**
 * Program fullscreen on a second display (HDMI, Windows "Extend"). `displayId`
 * is Electron's `Display.id` of the chosen screen; null = not chosen yet.
 */
export interface HdmiSettings {
  enabled: boolean
  displayId: number | null
}

/**
 * Sound of the HDMI output window (video slides and every other output sound).
 * `deviceId` is a `MediaDeviceInfo.deviceId` of an audio output; null = the
 * Windows default. `masterVolume` (0–100) applies to every output sound, on top
 * of each deck's own volume. `route` picks where the sound goes (this PC, OMT, both).
 */
export interface AudioSettings {
  deviceId: string | null
  muted: boolean
  masterVolume: number
  route: AudioRoute
}

/**
 * Linux only: what happens to a PowerPoint file (.pptx/.ppt) when it is imported. `odp` converts
 * it to a LibreOffice presentation (.odp) that becomes the deck's working copy; `original` keeps
 * the PowerPoint file as imported. The imported file itself is always stored unchanged.
 */
export type PptImportFormat = 'odp' | 'original'

export const DEFAULT_PPT_IMPORT_FORMAT: PptImportFormat = 'odp'

export function sanitizePptImportFormat(raw: unknown): PptImportFormat {
  return raw === 'original' || raw === 'odp' ? raw : DEFAULT_PPT_IMPORT_FORMAT
}

/**
 * NDI and OMT send only the slide's own rectangle (no black bars of a Fit deck). On by default;
 * off sends the whole Canvas, for receivers that cannot handle a size change.
 */
export const DEFAULT_SEND_CONTENT_ONLY = true

export function sanitizeSendContentOnly(raw: unknown): boolean {
  return typeof raw === 'boolean' ? raw : DEFAULT_SEND_CONTENT_ONLY
}

/**
 * Linux: host web decks in the PC's own Chrome instead of the built-in browser (so Google
 * sign-in works). Off by default; read once at start, so a change applies after a restart.
 */
export const DEFAULT_WEB_CHROME = false

export function sanitizeWebChrome(raw: unknown): boolean {
  return typeof raw === 'boolean' ? raw : DEFAULT_WEB_CHROME
}

/**
 * PageDown/PageUp run Next/Prev while no Bridgecast window has focus (a speaker's clicker keeps
 * working while the operator uses another app). Off by default; applies at once.
 */
export const DEFAULT_CLICKER_BACKGROUND = false

export function sanitizeClickerBackground(raw: unknown): boolean {
  return typeof raw === 'boolean' ? raw : DEFAULT_CLICKER_BACKGROUND
}

export interface Settings {
  hdmi: HdmiSettings
  /** Next/Prev may leave the live deck (see ProgramState.autoAdvance). Default off. */
  autoAdvance: boolean
  audio: AudioSettings
  /** Machine default output size; an event may override it (see resolveCanvas). */
  canvas: Canvas
  /** OMT network output. */
  omt: OmtSettings
  /** NDI network output. */
  ndi: NdiSettings
  /** OMT and NDI send only the slide without Fit bars (see DEFAULT_SEND_CONTENT_ONLY). */
  sendContentOnly: boolean
  /** Linux: convert imported PowerPoint files to .odp (default) or keep them as imported. */
  pptImportFormat: PptImportFormat
  /** Linux: web decks run in the PC's Chrome (see DEFAULT_WEB_CHROME). */
  webChrome: boolean
  /** Clicker keys work while Bridgecast is in the background (see DEFAULT_CLICKER_BACKGROUND). */
  clickerBackground: boolean
  updates: UpdateSettings
}

export const DEFAULT_HDMI: Readonly<HdmiSettings> = Object.freeze({
  enabled: false,
  displayId: null
})

export const DEFAULT_AUDIO: Readonly<AudioSettings> = Object.freeze({
  deviceId: null,
  muted: false,
  masterVolume: 100,
  route: 'local'
})

const AUDIO_ROUTES: readonly AudioRoute[] = ['local', 'omt', 'both']

/** Longest device id kept (real ids are about 64 characters). */
const MAX_DEVICE_ID = 512

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Any parsed JSON → valid HdmiSettings (a non-integer displayId becomes null). */
export function sanitizeHdmi(raw: unknown): HdmiSettings {
  const h = isObject(raw) ? raw : {}
  return {
    enabled: typeof h.enabled === 'boolean' ? h.enabled : DEFAULT_HDMI.enabled,
    displayId: Number.isSafeInteger(h.displayId) ? (h.displayId as number) : null
  }
}

/** Any parsed JSON → valid AudioSettings (an empty or over-long deviceId becomes null, masterVolume is 0–100, an unknown route is 'local'). */
export function sanitizeAudio(raw: unknown): AudioSettings {
  const a = isObject(raw) ? raw : {}
  return {
    deviceId:
      typeof a.deviceId === 'string' && a.deviceId.length > 0 && a.deviceId.length <= MAX_DEVICE_ID
        ? a.deviceId
        : DEFAULT_AUDIO.deviceId,
    muted: typeof a.muted === 'boolean' ? a.muted : DEFAULT_AUDIO.muted,
    masterVolume: sanitizeVolume(a.masterVolume, DEFAULT_AUDIO.masterVolume),
    route: AUDIO_ROUTES.includes(a.route as AudioRoute)
      ? (a.route as AudioRoute)
      : DEFAULT_AUDIO.route
  }
}

/**
 * Saved audio plus a partial patch: only known keys present in `patch` are
 * taken, each through `sanitizeAudio`; an invalid value keeps the saved one.
 */
export function mergeAudio(saved: AudioSettings, patch: unknown): AudioSettings {
  if (!isObject(patch)) return saved
  const clean = sanitizeAudio(patch)
  const out: AudioSettings = { ...saved }
  if (
    'deviceId' in patch &&
    (patch.deviceId === '' || patch.deviceId === null || clean.deviceId !== null)
  ) {
    out.deviceId = clean.deviceId
  }
  if (typeof patch.muted === 'boolean') out.muted = clean.muted
  if (Number.isFinite(patch.masterVolume)) out.masterVolume = clean.masterVolume
  if (AUDIO_ROUTES.includes(patch.route as AudioRoute)) out.route = clean.route
  return out
}

/**
 * Any parsed JSON → valid Settings; each invalid field falls back to its
 * default. Unknown keys are dropped.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const r = isObject(raw) ? raw : {}
  return {
    hdmi: sanitizeHdmi(r.hdmi),
    autoAdvance: typeof r.autoAdvance === 'boolean' ? r.autoAdvance : false,
    audio: sanitizeAudio(r.audio),
    canvas: sanitizeCanvas(r.canvas) ?? { ...DEFAULT_CANVAS },
    omt: sanitizeOmt(r.omt),
    ndi: sanitizeNdi(r.ndi),
    sendContentOnly: sanitizeSendContentOnly(r.sendContentOnly),
    pptImportFormat: sanitizePptImportFormat(r.pptImportFormat),
    webChrome: sanitizeWebChrome(r.webChrome),
    clickerBackground: sanitizeClickerBackground(r.clickerBackground),
    updates: sanitizeUpdates(r.updates)
  }
}
