import * as fs from 'fs'
import { dirname } from 'path'
import { randomUUID } from 'crypto'
import { DEFAULT_CANVAS } from '../shared/canvas'
import { DEFAULT_NDI, DEFAULT_OMT } from '../shared/omt'
import { DEFAULT_UPDATES } from '../shared/update'
import {
  DEFAULT_AUDIO,
  DEFAULT_CLICKER_BACKGROUND,
  DEFAULT_CLICKER_KEYS,
  DEFAULT_HDMI,
  DEFAULT_PPT_IMPORT_FORMAT,
  DEFAULT_SEND_CONTENT_ONLY,
  DEFAULT_WEB_CHROME,
  sanitizeSettings,
  type Settings
} from '../shared/settings'

export type { Settings } from '../shared/settings'

/** Spec defaults: HDMI off, no auto advance to the next deck, default sound device, not muted, 1920×1080 canvas, OMT off, NDI off, sound on this PC. */
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  hdmi: DEFAULT_HDMI,
  autoAdvance: false,
  audio: DEFAULT_AUDIO,
  canvas: DEFAULT_CANVAS,
  omt: DEFAULT_OMT,
  ndi: DEFAULT_NDI,
  sendContentOnly: DEFAULT_SEND_CONTENT_ONLY,
  pptImportFormat: DEFAULT_PPT_IMPORT_FORMAT,
  webChrome: DEFAULT_WEB_CHROME,
  clickerBackground: DEFAULT_CLICKER_BACKGROUND,
  clickerKeys: DEFAULT_CLICKER_KEYS,
  updates: DEFAULT_UPDATES
})

/**
 * Reads `settings.json`. A missing, unreadable or corrupt file gives the
 * defaults (never throws: a broken file must not stop the show); invalid
 * fields fall back to their default one by one.
 */
export function loadSettings(path: string): Settings {
  let raw: unknown = null
  try {
    raw = JSON.parse(fs.readFileSync(path, 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[settings] ${path} could not be read; using default settings`)
    }
  }
  return sanitizeSettings(raw)
}

/** Writes `settings.json` atomically (temp file + rename) after sanitizing. */
export function saveSettings(path: string, s: Settings): void {
  fs.mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(sanitizeSettings(s), null, 2), 'utf8')
    fs.renameSync(tmp, path)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
}
