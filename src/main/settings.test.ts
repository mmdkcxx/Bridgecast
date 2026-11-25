import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import { join } from 'path'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings'
import { mergeAudio, sanitizeAudio, sanitizeSettings } from '../shared/settings'
import { DEFAULT_NDI } from '../shared/omt'

let dir: string
let file: string

beforeEach(() => {
  dir = fs.mkdtempSync(join(os.tmpdir(), 'ppt-settings-'))
  file = join(dir, 'settings.json')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('loadSettings / saveSettings', () => {
  it('defaults update settings for older settings objects', () => {
    expect(sanitizeSettings({}).updates).toEqual({ skippedVersion: null })
  })

  it('returns the defaults when the file does not exist', () => {
    expect(loadSettings(file)).toEqual({
      hdmi: { enabled: false, displayId: null },
      autoAdvance: false,
      audio: { deviceId: null, muted: false, masterVolume: 100, route: 'local' as const },
      canvas: { width: 1920, height: 1080 },
      omt: { enabled: false, name: 'Bridgecast', fps: 30 },
      ndi: { enabled: false, name: 'Bridgecast' },
      sendContentOnly: true,
      pptImportFormat: 'odp',
      webChrome: false,
      clickerBackground: false,
      clickerKeys: 'page' as const,
      updates: { skippedVersion: null }
    })
    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS)
  })

  it('save then load returns the same values', () => {
    const s = {
      hdmi: { enabled: true, displayId: 2528732444 },
      autoAdvance: true,
      audio: { deviceId: null, muted: false, masterVolume: 100, route: 'local' as const },
      canvas: { width: 1920, height: 1080 },
      omt: { enabled: true, name: 'Aula', fps: 60 as const },
      ndi: { enabled: true, name: 'Sala NDI' },
      sendContentOnly: false,
      pptImportFormat: 'original' as const,
      webChrome: true,
      clickerBackground: true,
      clickerKeys: 'page' as const,
      updates: { skippedVersion: null }
    }
    saveSettings(file, s)
    expect(loadSettings(file)).toEqual(s)
  })

  it('returns the defaults without throwing when the JSON is corrupt', () => {
    fs.writeFileSync(file, '{"hdmi": {"enabled": tr')
    expect(() => loadSettings(file)).not.toThrow()
    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS)
  })

  it('returns the defaults when the JSON is valid but not an object', () => {
    fs.writeFileSync(file, 'null')
    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS)
    fs.writeFileSync(file, '[1,2]')
    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS)
  })

  it('writes atomically (no temp files left behind) and creates the folder', () => {
    const nested = join(dir, 'a', 'settings.json')
    saveSettings(nested, DEFAULT_SETTINGS)
    expect(fs.readdirSync(join(dir, 'a'))).toEqual(['settings.json'])
    saveSettings(nested, DEFAULT_SETTINGS)
    expect(fs.readdirSync(join(dir, 'a'))).toEqual(['settings.json'])
  })

  it('does not share the defaults object with callers', () => {
    const a = loadSettings(file)
    a.hdmi.enabled = true
    expect(loadSettings(file).hdmi.enabled).toBe(false)
  })
})

describe('hdmi settings', () => {
  it('an old settings file with ndi and without hdmi loads with the hdmi defaults and keeps ndi enabled/name', () => {
    const ndi = { enabled: false, name: 'Aula', width: 1920, height: 1080, fps: 60 }
    fs.writeFileSync(file, JSON.stringify({ ndi }))
    expect(loadSettings(file)).toEqual({
      hdmi: { enabled: false, displayId: null },
      autoAdvance: false,
      audio: { deviceId: null, muted: false, masterVolume: 100, route: 'local' as const },
      canvas: { width: 1920, height: 1080 },
      omt: { enabled: false, name: 'Bridgecast', fps: 30 },
      ndi: { enabled: false, name: 'Aula' },
      sendContentOnly: true,
      pptImportFormat: 'odp',
      webChrome: false,
      clickerBackground: false,
      clickerKeys: 'page' as const,
      updates: { skippedVersion: null }
    })
  })

  it('an old settings file keeps its hdmi values and only the ndi enabled/name', () => {
    const ndi = { enabled: true, name: 'Bridgecast', width: 1920, height: 1080, fps: 30 }
    fs.writeFileSync(file, JSON.stringify({ ndi, hdmi: { enabled: true, displayId: 7 } }))
    expect(loadSettings(file)).toEqual({
      hdmi: { enabled: true, displayId: 7 },
      autoAdvance: false,
      audio: { deviceId: null, muted: false, masterVolume: 100, route: 'local' as const },
      canvas: { width: 1920, height: 1080 },
      omt: { enabled: false, name: 'Bridgecast', fps: 30 },
      ndi: { enabled: true, name: 'Bridgecast' },
      sendContentOnly: true,
      pptImportFormat: 'odp',
      webChrome: false,
      clickerBackground: false,
      clickerKeys: 'page' as const,
      updates: { skippedVersion: null }
    })
  })

  it('a displayId that is not an integer becomes null', () => {
    for (const displayId of [2.5, '2', -0.1, NaN, null, true, {}]) {
      fs.writeFileSync(file, JSON.stringify({ hdmi: { enabled: true, displayId } }))
      expect(loadSettings(file).hdmi).toEqual({ enabled: true, displayId: null })
    }
  })

  it('an invalid enabled flag falls back to off', () => {
    expect(sanitizeSettings({ hdmi: { enabled: 1, displayId: 5 } }).hdmi).toEqual({
      enabled: false,
      displayId: 5
    })
    expect(sanitizeSettings({ hdmi: 'on' }).hdmi).toEqual({ enabled: false, displayId: null })
  })

  it('autoAdvance is a boolean, off when missing or invalid', () => {
    expect(sanitizeSettings({ autoAdvance: true }).autoAdvance).toBe(true)
    expect(sanitizeSettings({ autoAdvance: 'ya' }).autoAdvance).toBe(false)
    expect(sanitizeSettings({}).autoAdvance).toBe(false)
  })

  it('drops unknown fields', () => {
    expect(sanitizeSettings({ hdmi: { enabled: false, displayId: null, x: 1 }, other: 2 })).toEqual(
      DEFAULT_SETTINGS
    )
  })
})

describe('audio settings', () => {
  it('defaults: no saved device, not muted', () => {
    expect(DEFAULT_SETTINGS.audio).toEqual({
      deviceId: null,
      muted: false,
      masterVolume: 100,
      route: 'local' as const
    })
    expect(sanitizeSettings({}).audio).toEqual({
      deviceId: null,
      muted: false,
      masterVolume: 100,
      route: 'local' as const
    })
  })

  it('missing or wrong-typed audio falls back to the defaults', () => {
    for (const audio of [undefined, null, 'loud', 7, [], { deviceId: 5, muted: 'yes' }]) {
      expect(sanitizeAudio(audio)).toEqual({
        deviceId: null,
        muted: false,
        masterVolume: 100,
        route: 'local' as const
      })
    }
  })

  it('keeps a valid device id and muted flag', () => {
    expect(sanitizeAudio({ deviceId: 'abc123', muted: true })).toEqual({
      deviceId: 'abc123',
      muted: true,
      masterVolume: 100,
      route: 'local'
    })
    expect(sanitizeSettings({ audio: { deviceId: 'abc123', muted: true } }).audio).toEqual({
      deviceId: 'abc123',
      muted: true,
      masterVolume: 100,
      route: 'local'
    })
  })

  it('an empty or too long device id becomes null (512 characters is the limit)', () => {
    expect(sanitizeAudio({ deviceId: '', muted: true })).toEqual({
      deviceId: null,
      muted: true,
      masterVolume: 100,
      route: 'local'
    })
    expect(sanitizeAudio({ deviceId: 'x'.repeat(512) }).deviceId).toBe('x'.repeat(512))
    expect(sanitizeAudio({ deviceId: 'x'.repeat(513) }).deviceId).toBeNull()
  })

  it('drops unknown audio fields', () => {
    expect(sanitizeAudio({ deviceId: null, muted: false, volume: 3 })).toEqual({
      deviceId: null,
      muted: false,
      masterVolume: 100,
      route: 'local'
    })
  })

  it('save then load keeps audio', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      audio: { deviceId: 'hdmi-1', muted: true, masterVolume: 100, route: 'local' as const }
    }
    saveSettings(file, s)
    expect(loadSettings(file).audio).toEqual({
      deviceId: 'hdmi-1',
      muted: true,
      masterVolume: 100,
      route: 'local'
    })
  })
})

describe('canvas setting', () => {
  it('a settings file without canvas loads the 1920×1080 default', () => {
    fs.writeFileSync(file, JSON.stringify({ hdmi: { enabled: true, displayId: 3 } }))
    expect(loadSettings(file).canvas).toEqual({ width: 1920, height: 1080 })
  })

  it('an invalid canvas falls back to the default', () => {
    fs.writeFileSync(file, JSON.stringify({ canvas: { width: 10, height: 10 } }))
    expect(loadSettings(file).canvas).toEqual({ width: 1920, height: 1080 })
  })

  it('keeps a valid canvas through save then load', () => {
    fs.writeFileSync(file, JSON.stringify({ canvas: { width: 3840, height: 1080 } }))
    expect(loadSettings(file).canvas).toEqual({ width: 3840, height: 1080 })
    saveSettings(file, { ...DEFAULT_SETTINGS, canvas: { width: 3840, height: 1080 } })
    expect(loadSettings(file).canvas).toEqual({ width: 3840, height: 1080 })
  })

  it('does not share the default canvas object with callers', () => {
    const a = loadSettings(file)
    a.canvas.width = 640
    expect(loadSettings(file).canvas.width).toBe(1920)
  })
})

describe('master volume', () => {
  it('audio without masterVolume loads at 100', () => {
    fs.writeFileSync(file, JSON.stringify({ audio: { deviceId: 'hdmi-1', muted: true } }))
    expect(loadSettings(file).audio).toEqual({
      deviceId: 'hdmi-1',
      muted: true,
      masterVolume: 100,
      route: 'local' as const
    })
  })

  it('an out-of-range or invalid masterVolume becomes 100', () => {
    expect(sanitizeAudio({ masterVolume: 250 }).masterVolume).toBe(100)
    expect(sanitizeAudio({ masterVolume: 'loud' }).masterVolume).toBe(100)
    expect(sanitizeAudio({ masterVolume: NaN }).masterVolume).toBe(100)
  })

  it('keeps a valid masterVolume through save then load', () => {
    expect(sanitizeAudio({ masterVolume: 30 }).masterVolume).toBe(30)
    saveSettings(file, {
      ...DEFAULT_SETTINGS,
      audio: { deviceId: null, muted: false, masterVolume: 30, route: 'local' }
    })
    expect(loadSettings(file).audio.masterVolume).toBe(30)
  })
})

describe('audio route', () => {
  it('keeps local, omt and both; anything else becomes local', () => {
    for (const route of ['local', 'omt', 'both']) {
      expect(sanitizeAudio({ route }).route).toBe(route)
    }
    for (const route of ['hdmi', 5, null, undefined]) {
      expect(sanitizeAudio({ route }).route).toBe('local')
    }
  })
})

describe('omt setting', () => {
  it('a settings file without omt loads the defaults', () => {
    fs.writeFileSync(file, JSON.stringify({ hdmi: { enabled: true, displayId: 3 } }))
    expect(loadSettings(file).omt).toEqual({ enabled: false, name: 'Bridgecast', fps: 30 })
  })

  it('sanitizes invalid values and survives save then load', () => {
    expect(sanitizeSettings({ omt: { enabled: true, name: '  ', fps: 45 } }).omt).toEqual({
      enabled: true,
      name: 'Bridgecast',
      fps: 30
    })
    saveSettings(file, { ...DEFAULT_SETTINGS, omt: { enabled: true, name: 'Sala', fps: 60 } })
    expect(loadSettings(file).omt).toEqual({ enabled: true, name: 'Sala', fps: 60 })
  })

  it('does not share the default omt object with callers', () => {
    loadSettings(file).omt.name = 'X'
    expect(loadSettings(file).omt.name).toBe('Bridgecast')
  })
})

describe('ndi setting', () => {
  it('a settings file without ndi loads the defaults', () => {
    fs.writeFileSync(file, JSON.stringify({ omt: { enabled: true } }))
    expect(loadSettings(file).ndi).toEqual(DEFAULT_NDI)
    expect(loadSettings(file).ndi).toEqual({ enabled: false, name: 'Bridgecast' })
  })

  it('does not share the default ndi object with callers', () => {
    loadSettings(file).ndi.name = 'X'
    expect(loadSettings(file).ndi.name).toBe('Bridgecast')
  })

  it('sanitizes the name when loading', () => {
    expect(sanitizeSettings({ ndi: { enabled: true, name: '  ' } }).ndi).toEqual({
      enabled: true,
      name: 'Bridgecast'
    })
  })

  it('defaults the Linux import format to odp and sanitizes bad values', () => {
    expect(DEFAULT_SETTINGS.pptImportFormat).toBe('odp')
    fs.writeFileSync(file, JSON.stringify({ pptImportFormat: 'docx' }))
    expect(loadSettings(file).pptImportFormat).toBe('odp')
    fs.writeFileSync(file, JSON.stringify({ pptImportFormat: 'original' }))
    expect(loadSettings(file).pptImportFormat).toBe('original')
  })

  it('webChrome defaults to off and accepts only booleans', () => {
    expect(DEFAULT_SETTINGS.webChrome).toBe(false)
    fs.writeFileSync(file, JSON.stringify({ webChrome: 'yes' }))
    expect(loadSettings(file).webChrome).toBe(false)
    fs.writeFileSync(file, JSON.stringify({ webChrome: true }))
    expect(loadSettings(file).webChrome).toBe(true)
  })
})

describe('send content only setting', () => {
  it('defaults to on, and keeps an explicit false through save then load', () => {
    expect(DEFAULT_SETTINGS.sendContentOnly).toBe(true)
    expect(loadSettings(file).sendContentOnly).toBe(true)
    saveSettings(file, { ...DEFAULT_SETTINGS, sendContentOnly: false })
    expect(loadSettings(file).sendContentOnly).toBe(false)
  })

  it('a non-boolean value falls back to true', () => {
    for (const sendContentOnly of ['no', 0, 1, null, undefined, {}, []]) {
      expect(sanitizeSettings({ sendContentOnly }).sendContentOnly).toBe(true)
    }
  })
})

describe('mergeAudio', () => {
  const saved = { deviceId: 'dev', muted: false, masterVolume: 60, route: 'both' as const }

  it('changes only the keys present', () => {
    expect(mergeAudio(saved, { muted: true })).toEqual({ ...saved, muted: true })
  })
  it('clamps masterVolume like sanitizeAudio', () => {
    expect(mergeAudio(saved, { masterVolume: 140 }).masterVolume).toBe(100)
  })
  it('keeps the saved value for an invalid one', () => {
    expect(mergeAudio(saved, { route: 'bogus' }).route).toBe('both')
    expect(mergeAudio(saved, { muted: 'yes' }).muted).toBe(false)
    expect(mergeAudio(saved, { masterVolume: 'loud' }).masterVolume).toBe(60)
  })
  it('sets deviceId to null for an empty string', () => {
    expect(mergeAudio(saved, { deviceId: '' }).deviceId).toBeNull()
  })

  it('sets deviceId to null for an explicit null (Default device)', () => {
    expect(mergeAudio({ ...saved, deviceId: 'abc' }, { deviceId: null }).deviceId).toBeNull()
  })
  it('returns the saved settings for a non-object patch', () => {
    for (const p of [null, [], 'x', 5]) expect(mergeAudio(saved, p)).toEqual(saved)
  })
  it('ignores unknown keys', () => {
    expect(mergeAudio(saved, { foo: 1, muted: true })).toEqual({ ...saved, muted: true })
  })
})

describe('clicker in the background setting', () => {
  it('is off when missing or not a boolean, and kept when true', () => {
    expect(loadSettings(file).clickerBackground).toBe(false)
    fs.writeFileSync(file, '{"clickerBackground": true}')
    expect(loadSettings(file).clickerBackground).toBe(true)
    fs.writeFileSync(file, '{"clickerBackground": "yes"}')
    expect(loadSettings(file).clickerBackground).toBe(false)
  })

  it('uses PageDown/PageUp unless the arrow keys were chosen', () => {
    expect(loadSettings(file).clickerKeys).toBe('page')
    fs.writeFileSync(file, '{"clickerKeys": "arrows"}')
    expect(loadSettings(file).clickerKeys).toBe('arrows')
    fs.writeFileSync(file, '{"clickerKeys": "space"}')
    expect(loadSettings(file).clickerKeys).toBe('page')
  })
})
