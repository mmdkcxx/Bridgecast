import {
  app,
  shell,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  MessageChannelMain,
  nativeImage,
  protocol,
  screen,
  session,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import * as path from 'path'
import { join } from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { Library, PPTX_RE } from './library'
import { AppState } from './state'
import { FakeEngine } from './slideshow/fake-engine'
import { SlideShowManager } from './slideshow/manager'
import type { SlideShowEngine } from './slideshow/engine'
import { PowerPointEngine, bridgeExePath, type BridgeChild } from './slideshow/powerpoint-engine'
import { SlideSound } from './slideshow/audio-pipe'
import { LibreOfficeEngine, loBridgePath } from './slideshow/libreoffice-engine'
import { PulseSink } from './slideshow/pulse-sink'
import { slideshowSourceId } from './slideshow/capture'
import { importPptx, configureImport, importEngine } from './import'
import { importPptxPowerPoint } from './import/pptx'
import { importPptxLibreOffice, installedFonts } from './import/libreoffice'
import {
  detectEngine,
  macosMajorFromDarwin,
  needsX11Relaunch,
  probeLinux,
  x11CaptureEnv,
  childEnv,
  x11RelaunchOptions,
  canSelfUpdate,
  type EngineInfo
} from './platform'
import { readFolderDeck } from './import/folder'
import { BackgroundClicker } from './background-clicker'
import { readVideoDeck } from './import/video-file'
import { grabPoster } from './import/grab-poster'
import { VIDEO_EXTENSIONS_RE } from '../shared/video-file'
import { ImportQueue } from './import-queue'
import type { DeckMeta } from '../shared/types'
import { DeckEditor } from './slideshow/editor'
import type { ImportedDeck } from './import'
import {
  VIDEO_CHUNK_BYTES,
  capRange,
  isInside,
  kvMimeType,
  parseKvUrl,
  parseRange,
  parseSlideUrl,
  parseThumbUrl
} from './slide-protocol'
import { loadSettings, saveSettings, type Settings } from './settings'
import { HdmiOutput, screenDisplays } from './display-output'
import { NetOutput } from './net-output'
import type { ScreenDisplay } from './hdmi-plan'
import { hdmiSettingsError, resolveHdmi } from '../shared/displays'
import { outputChanges, type EventOutputs } from '../shared/event-outputs'
import { permissionAllowed } from './permissions'
import {
  sanitizeNdi,
  sanitizeOmt,
  type NdiSettings,
  type NetStatus,
  type OmtSettings
} from '../shared/omt'
import {
  CANVAS_INVALID,
  contentRect,
  IMPORT_WIDTH,
  sanitizeCanvas,
  type Canvas,
  type ContentRect
} from '../shared/canvas'
import {
  mergeAudio,
  sanitizeAudio,
  sanitizePptImportFormat,
  sanitizeSettings,
  type AudioSettings,
  type ClickerKeys,
  type HdmiSettings,
  type PptImportFormat
} from '../shared/settings'
import {
  Broadcast,
  Invoke,
  SLIDESHOW_AUDIO_PORT,
  Send,
  type BroadcastMap,
  type ImportProgress,
  type ImportRequest,
  type InvokeChannel,
  type HdmiStatus,
  type InvokeMap,
  type RenderedDeck
} from '../shared/ipc'
import { isOrderItem } from '../shared/sections'
import { kvOnAir, type Action, type ProgramState } from '../shared/program'
import { canInstallNow, UNSUPPORTED_UPDATE_STATUS, type UpdateSettings } from '../shared/update'
import { UpdateManager } from './updater/manager'
import { createElectronEngine } from './updater/electron-engine'
import { createFakeEngine } from './updater/fake-engine'
import { defaultPlayback, engineStates, playbackOf, type SlideshowStatus } from '../shared/playback'
import { renderedDeckFields } from './import/rendered-fields'
import { convertPptxToPdf, macConvertDeps } from './import/mac-convert'
import { isPageZoom, sanitizeWebUrl, webDomain, type WebCaptureWarning } from '../shared/web'
import { WebHost } from './web/web-host'
import { ElectronPageBackend } from './web/electron-page-backend'
import { WebView2PageBackend } from './web/webview2-backend'
import { WebBridgeEngine, webBridgeExePath, type WebPageEngine } from './web/web-engine'
import { FakeWebEngine } from './web/fake-web-engine'
import { WebEngineSupervisor } from './web/web-engine-supervisor'
import { webView2RuntimeFound } from './web/webview2-runtime'
import { chooseWebBackend, type WebBackendChoice } from './web/backend-choice'
import {
  SHARED_PROFILE,
  detectLinuxChrome,
  linuxProfileRoot,
  webBridgeLinuxScriptPath,
  type ChromeDetection
} from './web/linux-browser'
import {
  GoogleSignIn,
  chromeStatus,
  profileInUse,
  signInRefusal,
  type SignInChild
} from './web/chrome-signin'
import type { WebChromeStatus } from '../shared/web'

import { setWebLogFile } from './web/web-log'
import type { PageBackend } from './web/page-backend'
import {
  frameSenderAllowed,
  HeldAcks,
  heldAckRoles,
  prepareInputAllowed,
  updateCaptureWarnings,
  isAppPageUrl,
  mergeDisableFeatures,
  webDeckName,
  type AppWindowRole
} from './web/host-rules'
import { openPrepareWindow, prepareDeckOf } from './web/prepare-window'
import type { NetId } from './net/sender-binding'
import { migrateUserData } from './migrate-user-data'

/** Longest the app waits for the OMT worker to stop before it quits anyway. */
const OMT_QUIT_CAP_MS = 3000
/** Upper bound for one import request (a drop of a whole folder's worth of files). */
const MAX_FILES = 200

// Linux in a Wayland session: restart on X11 (Xwayland) so the hidden web deck pages paint (see
// needsX11Relaunch). Runs before anything else starts; the second start has the flag.
if (needsX11Relaunch(process.platform, process.env, process.argv)) {
  app.relaunch(x11RelaunchOptions(process.env, process.argv))
  app.exit(0)
}

// The session's own XDG_SESSION_TYPE, read before the line below may change it.
const sessionType = process.env['XDG_SESSION_TYPE']
// Wayland session, app on X11 (after the relaunch, or `npm run dev` with the flag): tell Chromium's
// window capture the session is X11 so it lists the LibreOffice slide show window instead of
// asking the PipeWire portal (see x11CaptureEnv). Before any capture; children get it back.
const x11Capture = x11CaptureEnv(process.platform, process.env, process.argv)
if (x11Capture) Object.assign(process.env, x11Capture)

// Hidden web deck pages must keep painting on Windows when covered or minimised
// (merged with any features already disabled on the command line).
app.commandLine.appendSwitch(
  'disable-features',
  mergeDisableFeatures(
    app.commandLine.getSwitchValue('disable-features'),
    'CalculateNativeWinOcclusion'
  )
)

// Must run before `ready`: lets <img src="slide://..."> load under the CSP.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'slide',
    // corsEnabled: the output's <video crossorigin> (needed for Web Audio) is a CORS request.
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
])

/**
 * Called after an HDMI or network status change (set by registerWebIpc): which
 * outputs count for the ready gate may have changed (`web:outputs`).
 */
let outputsMaybeChanged: () => void = () => {}

/** Set once the web host exists: web deck pages and their popups never get app broadcasts. */
let isWebPage: (wc: Electron.WebContents) => boolean = () => false

function broadcast<C extends keyof BroadcastMap>(channel: C, payload: BroadcastMap[C]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && !isWebPage(w.webContents)) w.webContents.send(channel, payload)
  }
}

/** `resources/package-type` of a packaged Linux build (`deb` in a .deb install), else null. */
function readPackageType(): string | null {
  try {
    return fs.readFileSync(join(process.resourcesPath, 'package-type'), 'utf8')
  } catch {
    return null
  }
}

/** Set once the operator window exists: broadcast only to it. */
let operatorWindowRef: () => BrowserWindow | null = () => null

function broadcastToOperator<C extends keyof BroadcastMap>(
  channel: C,
  payload: BroadcastMap[C]
): void {
  const w = operatorWindowRef()
  if (!w || w.isDestroyed()) return
  if (isWebPage(w.webContents)) return
  w.webContents.send(channel, payload)
}

function handle<C extends InvokeChannel>(
  channel: C,
  fn: (...args: InvokeMap[C]['args']) => InvokeMap[C]['result'] | Promise<InvokeMap[C]['result']>
): void {
  ipcMain.handle(channel, (_e, ...args) => fn(...(args as InvokeMap[C]['args'])))
}

const NOT_APP_WINDOW = 'This window cannot control web pages.'

/**
 * True when an IPC call comes from one of the app's own windows (operator, HDMI,
 * OMT, Prepare): the app renderer page in its top frame. A web deck page has no
 * preload and cannot reach IPC; this check refuses it even if it could.
 */
function fromAppWindow(e: Pick<IpcMainInvokeEvent, 'senderFrame'>): boolean {
  const frame = e.senderFrame
  if (!frame || frame.parent !== null) return false
  return isAppPageUrl(frame.url, {
    file: join(__dirname, '../renderer/index.html'),
    dev: is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
  })
}

/** `handle` for the web:* channels: refused unless the caller is an app window. */
function appHandle<C extends InvokeChannel>(
  channel: C,
  fn: (
    e: IpcMainInvokeEvent,
    ...args: InvokeMap[C]['args']
  ) => InvokeMap[C]['result'] | Promise<InvokeMap[C]['result']>
): void {
  ipcMain.handle(channel, (e, ...args) => {
    if (!fromAppWindow(e)) throw new Error(NOT_APP_WINDOW)
    return fn(e, ...(args as InvokeMap[C]['args']))
  })
}

/** Black PNG at the canvas size: a new web deck's first snapshot until its page has loaded. */
function placeholderSnapshot(dir: string, width: number, height: number): string {
  const file = join(dir, '001.png')
  // BGRA, opaque black.
  const pixels = Buffer.alloc(width * height * 4).fill(Buffer.from([0, 0, 0, 0xff]))
  const img = nativeImage.createFromBuffer(pixels, { width, height })
  fs.writeFileSync(file, img.toPNG())
  return file
}

function assertString(v: unknown, what: string): asserts v is string {
  if (typeof v !== 'string' || !v)
    throw new Error(`${what} is not valid. Reload the app, then try again.`)
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function tempDir(): string {
  return fs.mkdtempSync(join(os.tmpdir(), 'ppt-share-import-'))
}

/**
 * Serves an MP4 with byte ranges, reading only the requested slice. Every
 * answer is a 206 of at most VIDEO_CHUNK_BYTES (also for a request without
 * Range or with an open-ended `bytes=0-`), so a large clip never sits in memory.
 */
async function videoResponse(file: string, rangeHeader: string | null): Promise<Response> {
  const headers = {
    'content-type': 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
    // The output plays video through Web Audio, which needs a CORS-clean source (silent otherwise).
    // `*` is safe: only the app's own renderer (file:// = Origin null, or http://localhost in dev)
    // loads slide:// URLs, nothing here carries credentials, and external web pages (planned
    // browser source) run in the separate `persist:web` session, which has no slide: protocol.
    'access-control-allow-origin': '*'
  }
  const { size } = await fs.promises.stat(file)
  const parsed = parseRange(rangeHeader, size)
  if (parsed === 'invalid' || (parsed === null && size === 0)) {
    return new Response(null, {
      status: 416,
      headers: { ...headers, 'content-range': `bytes */${size}` }
    })
  }
  const range = capRange(parsed ?? { start: 0, end: size - 1 }, VIDEO_CHUNK_BYTES)
  const length = range.end - range.start + 1
  const handle = await fs.promises.open(file, 'r')
  try {
    const buf = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buf, 0, length, range.start)
    return new Response(buf.subarray(0, bytesRead), {
      status: 206,
      headers: {
        ...headers,
        'content-range': `bytes ${range.start}-${range.start + bytesRead - 1}/${size}`,
        'content-length': String(bytesRead)
      }
    })
  } finally {
    await handle.close()
  }
}

function registerSlideProtocol(root: string, lib: Library): void {
  protocol.handle('slide', async (req) => {
    // Forms: slide://<deckId>/<file> (a slide), slide://<deckId>/thumbs/<n>.jpg (its thumbnail) and slide://kv/<eventId>/<file> (an event's KV).
    const kv = parseKvUrl(req.url)
    const thumb = kv ? null : parseThumbUrl(req.url)
    const parsed = kv || thumb ? null : parseSlideUrl(req.url)
    if (!kv && !thumb && !parsed) return new Response('Bad request', { status: 400 })
    try {
      const file = kv
        ? lib.kvFilePath(kv.eventId, kv.file)
        : thumb
          ? await lib.thumbFilePath(thumb.deckId, thumb.file)
          : parsed!.file.endsWith('.mp4')
            ? lib.videoFilePath(parsed!.deckId, parsed!.file)
            : lib.slideFilePath(parsed!.deckId, parsed!.file)
      if (!isInside(root, file)) return new Response('Forbidden', { status: 403 })
      if (parsed?.file.endsWith('.mp4')) return await videoResponse(file, req.headers.get('range'))
      // A thumbnail is a JPEG, or the full PNG when generation failed.
      const type = kv
        ? kvMimeType(kv.file)
        : file.endsWith('.pdf')
          ? 'application/pdf'
          : file.endsWith('.jpg')
            ? 'image/jpeg'
            : 'image/png'
      if (!type) return new Response('Bad request', { status: 400 })
      const data = await fs.promises.readFile(file)
      return new Response(data, {
        headers: { 'content-type': type, 'cache-control': 'no-store' }
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

function registerIpc(
  lib: Library,
  state: AppState,
  settings: SettingsStore,
  hdmi: HdmiOutput,
  net: NetOutput,
  web: WebHost,
  slideShow: SlideShowHost,
  syncWeb: () => void,
  operatorWindow: () => BrowserWindow | null,
  updateManager: UpdateManager | null,
  webChrome: WebChromeControl
): void {
  const progress = (p: ImportProgress): void => broadcast(Broadcast.importProgress, p)

  handle(Invoke.eventsList, () => lib.listEvents())
  handle(Invoke.eventsCreate, (name, options) => {
    assertString(name, 'Event name')
    const o = typeof options === 'object' && options !== null ? options : {}
    return lib.createEvent(name, Date.now(), { canvas: o.canvas, outputs: o.outputs })
  })
  // An event's saved outputs (New event dialog). The event that owns the output (the air event)
  // decides: when it changes, its outputs are applied to this PC's settings; a switch the
  // operator flips in the Output panel meanwhile is remembered by that event.
  const rememberOutput = (patch: Partial<EventOutputs>): void => {
    const owner = state.state.airEvent
    if (owner) lib.patchEventOutputs(owner, patch)
  }
  const applyEventOutputs = (eventId: string | null): void => {
    const wanted = eventId ? lib.listEvents().find((e) => e.id === eventId)?.outputs : undefined
    if (!wanted) return
    const cur = settings.get()
    const change = outputChanges(wanted, {
      hdmi: cur.hdmi.enabled,
      omt: cur.omt.enabled,
      ndi: cur.ndi.enabled
    })
    let changed = false
    if (change.hdmi !== undefined) {
      // The same checks as the HDMI switch: with no usable display HDMI stays as it is (the
      // header shows it off) and the event keeps its wish for the next time.
      const input = { ...cur.hdmi, enabled: change.hdmi }
      const displays = hdmi.displays()
      const operatorId = hdmi.operatorDisplayId()
      if (!hdmiSettingsError(input, displays, operatorId)) {
        hdmi.apply(settings.saveHdmi(resolveHdmi(input, displays, operatorId)).hdmi)
        changed = true
      }
    }
    if (change.omt !== undefined || change.ndi !== undefined) {
      if (change.omt !== undefined) settings.saveOmt({ ...cur.omt, enabled: change.omt })
      if (change.ndi !== undefined) settings.saveNdi({ ...cur.ndi, enabled: change.ndi })
      const saved = settings.get()
      net.apply({ omt: saved.omt, ndi: saved.ndi })
      changed = true
    }
    if (changed) broadcast(Broadcast.outputSettings, settings.get())
  }
  let outputOwner = state.state.airEvent
  handle(Invoke.eventsSelect, (eventId) => {
    assertString(eventId, 'Event ID')
    const s = state.setEvent(eventId)
    lib.touchEvent(eventId)
    syncWeb()
    return s
  })
  handle(Invoke.eventsSummaries, () => lib.eventSummaries())
  handle(Invoke.eventsSetArchived, (eventId, archived) => {
    assertString(eventId, 'Event ID')
    if (typeof archived !== 'boolean') throw new Error('Archived must be true or false.')
    const st = state.state
    if (
      archived &&
      st.airEvent === eventId &&
      (st.shown || (st.kv && kvOnAir(st)) || (st.black && st.kvUrl !== null))
    ) {
      throw new Error('This event is on air. Take a slide of another event, then archive it.')
    }
    return lib.setArchived(eventId, archived)
  })
  handle(Invoke.decksList, (eventId) => {
    assertString(eventId, 'Event ID')
    return lib.getDecks(eventId)
  })
  handle(Invoke.programDispatch, (action: Action) => {
    // Resume PowerPoint clears the manager's fallback first (the engine gate refuses it while set).
    if (action?.type === 'resumeNative') {
      slideShow.manager.resumeNative(action.deckId)
      return state.state
    }
    return state.dispatch(action)
  })
  handle(Invoke.programGet, () => ({ eventId: state.eventId, state: state.state }))

  // PPT/PPTX via PowerPoint COM through the import queue: one file at a time
  // (COM must never run in parallel); a failed file never blocks the next.
  // A folder of page-NN.png / page-NN.mp4 goes through the same queue.
  // Both the "Add files" dialog and drag and drop end up here.
  const jobEvent = new Map<string, string>()
  // Import warnings (missing fonts): reported with the finished row.
  const importWarnings = new Map<string, string>()
  // Re-exports of edited decks (Edit in PowerPoint, Revert) wait in the same queue: PowerPoint
  // runs one job at a time. Their result goes to the editor, not to the library list.
  const exportJobs = new Map<
    string,
    {
      outDir: string
      resolve: (deck: ImportedDeck) => void
      reject: (err: unknown) => void
    }
  >()
  const queue = new ImportQueue(
    async (job) => {
      const exportJob = exportJobs.get(job.id)
      if (exportJob) {
        try {
          exportJob.resolve(
            // An edit stays in the format the operator saved; Revert (original.*) converts again.
            await importPptx(job.path, exportJob.outDir, IMPORT_WIDTH, {
              keepFormat: /^edit\./i.test(path.basename(job.path))
            })
          )
        } catch (err) {
          exportJob.reject(err)
        }
        return
      }
      const eventId = jobEvent.get(job.id)
      if (!eventId) throw new Error('Target event not found. Choose an event, then import again.')
      if (isDirectory(job.path)) {
        const deck = readFolderDeck(job.path)
        progress({ id: job.id, name: job.name, percent: 90, status: 'busy' })
        lib.addDeck(eventId, { ...deck, source: 'folder' })
        state.refresh()
        return
      }
      if (VIDEO_EXTENSIONS_RE.test(job.path)) {
        const out = tempDir()
        try {
          const deck = await readVideoDeck(job.path, out, grabPoster)
          progress({ id: job.id, name: job.name, percent: 90, status: 'busy' })
          // Same source as a folder deck: playback, volume and the strip play mark are unchanged.
          lib.addDeck(eventId, { ...deck, source: 'folder' })
          state.refresh()
        } finally {
          fs.rmSync(out, { recursive: true, force: true })
        }
        return
      }
      if (!PPTX_RE.test(job.path)) {
        throw new Error(
          'This file type is not supported. Choose a PPTX, PPT, PDF, image (PNG, JPG, WebP, GIF, BMP, AVIF), MP4, M4V, WebM, MOV, or MKV file.'
        )
      }
      const out = tempDir()
      try {
        const deck = await importPptx(job.path, out, IMPORT_WIDTH)
        progress({ id: job.id, name: job.name, percent: 90, status: 'busy' })
        lib.addDeck(eventId, {
          ...deck,
          source: 'pptx',
          playback: defaultPlayback('pptx', deck.isStatic)
        })
        state.refresh()
        if (deck.warning) importWarnings.set(job.id, deck.warning)
      } finally {
        fs.rmSync(out, { recursive: true, force: true })
      }
    },
    1,
    (job, status, error) => {
      if (exportJobs.has(job.id)) {
        // Not an import row; the editor reports its own result.
        if (status !== 'busy') exportJobs.delete(job.id)
        return
      }
      if (status !== 'busy') jobEvent.delete(job.id)
      const warning = status === 'done' ? importWarnings.get(job.id) : undefined
      if (status !== 'busy') importWarnings.delete(job.id)
      progress({
        id: job.id,
        name: job.name,
        percent: status === 'busy' ? 10 : 100,
        status,
        ...(error ? { message: error.message } : {}),
        ...(warning ? { message: warning } : {})
      })
    }
  )
  if (process.env['PPT_OUTPUT_DUMP']) {
    Object.defineProperty(globalThis, '__pptImportQueue', { configurable: true, value: queue })
  }

  const slideManager = slideShow.manager
  // e2e only (PPT_OUTPUT_DUMP + PPT_ENGINE_FAKE=1): no PowerPoint to export an edited file, so
  // the "export" re-uses the deck's current slides; the new source file is the saved working copy.
  const fakeExport =
    process.env['PPT_OUTPUT_DUMP'] && process.env['PPT_ENGINE_FAKE'] === '1'
      ? async (file: string, outDir: string): Promise<ImportedDeck> => {
          // `file` is a snapshot in a temp dir: find the deck whose working copy it is.
          const bytes = fs.readFileSync(file)
          let deck: DeckMeta | undefined
          let dir = ''
          for (const ev of lib.listEvents()) {
            for (const d of lib.getDecks(ev.id)) {
              const dd = path.dirname(lib.slidePath(d.id, 0))
              const edit = path.join(dd, path.basename(file))
              if (fs.existsSync(edit) && fs.readFileSync(edit).equals(bytes)) {
                deck = d
                dir = dd
              }
            }
          }
          if (!deck) throw new Error('e2e export: no deck owns this working copy')
          fs.mkdirSync(outDir, { recursive: true })
          const slides = deck.slides.map((s) => {
            const pngPath = path.join(outDir, s.file)
            fs.copyFileSync(path.join(dir, s.file), pngPath)
            return { pngPath, notes: s.notes, clicks: s.clicks ?? 0, hidden: !!s.hidden }
          })
          return {
            name: deck.name,
            width: deck.width,
            height: deck.height,
            slides,
            pdfPath: '',
            isStatic: false,
            sourcePath: file
          }
        }
      : null
  const editor = new DeckEditor({
    library: lib,
    exportDeck: (file, outDir) =>
      fakeExport
        ? fakeExport(file, outDir)
        : new Promise<ImportedDeck>((resolve, reject) => {
            const id = randomUUID()
            exportJobs.set(id, { outDir, resolve, reject })
            queue.add({ id, name: path.basename(file), path: file })
          }),
    confirmEdit: () => slideShow.status().engine === 'libreoffice',
    openInPowerPoint: (file) => slideManager.edit(file),
    isLive: (deckId) => state.state.shown?.deckId === deckId,
    suspend: (deckId) => slideManager.suspend(deckId),
    resume: (deckId) => slideManager.resume(deckId),
    applied: () => {
      state.refresh()
    },
    onPending: (deckId, pending) => broadcast(Broadcast.deckPending, { deckId, pending }),
    onError: (deckId, message) => broadcast(Broadcast.deckEditError, { deckId, message })
  })
  // A saved edit waits while its deck is on air and is applied once it is not.
  state.onChange(() => {
    editor.leftAir().catch((err) => console.error('[editor] pending edit:', err))
  })
  app.on('before-quit', () => editor.dispose())

  // Edit in PowerPoint, Revert and the playback mode: app windows only.
  appHandle(Invoke.deckEdit, (_e, deckId, confirmed) => {
    assertString(deckId, 'Deck ID')
    return editor.edit(deckId, confirmed === true)
  })
  appHandle(Invoke.deckEditDone, (_e, deckId) => {
    assertString(deckId, 'Deck ID')
    return editor.done(deckId)
  })
  appHandle(Invoke.deckApplyNow, (_e, deckId) => {
    assertString(deckId, 'Deck ID')
    return editor.applyNow(deckId)
  })
  appHandle(Invoke.deckRevert, (_e, deckId) => {
    assertString(deckId, 'Deck ID')
    return editor.revert(deckId)
  })
  appHandle(Invoke.deckIsEdited, (_e, deckId) => {
    assertString(deckId, 'Deck ID')
    return lib.isEdited(deckId)
  })
  appHandle(Invoke.deckSetPlayback, (_e, eventId, deckId, playback) => {
    assertString(eventId, 'Event ID')
    assertString(deckId, 'Deck ID')
    const deck = lib.setPlayback(eventId, deckId, playback)
    state.refresh()
    return deck
  })

  handle(Invoke.decksImport, (eventId, files: ImportRequest[]) => {
    assertString(eventId, 'Event ID')
    lib.getDecks(eventId) // throws (user-facing message) if the event does not exist
    if (!Array.isArray(files) || files.length > MAX_FILES) {
      throw new Error('The file list is not valid. Choose the files again.')
    }
    const jobs = files.map((f) => {
      if (!f || typeof f !== 'object')
        throw new Error('The file list is not valid. Choose the files again.')
      assertString(f.id, 'Import ID')
      assertString(f.path, 'File location')
      if (!path.isAbsolute(f.path)) {
        throw new Error(
          'The file location is not valid. Drag the file in from File Explorer, or use Add files.'
        )
      }
      return { id: f.id, name: path.basename(f.path), path: f.path }
    })
    // Enqueue only; progress arrives as import:progress.
    for (const job of jobs) {
      jobEvent.set(job.id, eventId)
      queue.add(job)
    }
  })

  // macOS: PowerPoint files become a PDF in main (PowerPoint, else Keynote, else LibreOffice); the renderer draws
  // the pages. The temp PDF is remembered here with the PowerPoint file it came from, so
  // addRendered can keep that file as original.* (a renderer path is never trusted for it).
  const converted = new Map<string, { dir: string; original: string }>()
  handle(Invoke.decksConvertPptx, async (file: string) => {
    assertString(file, 'File location')
    if (process.platform !== 'darwin' || !path.isAbsolute(file) || !PPTX_RE.test(file)) {
      throw new Error('This file cannot be converted. Choose a PPTX or PPT file.')
    }
    const dir = tempDir()
    try {
      // One fixed folder for PowerPoint, so its sandbox asks to grant access only once.
      const pdfPath = await convertPptxToPdf(
        file,
        dir,
        macConvertDeps,
        join(app.getPath('userData'), 'PowerPoint export')
      )
      const pdf = new Uint8Array(await fs.promises.readFile(pdfPath))
      converted.set(pdfPath, { dir, original: file })
      return { pdf, pdfPath }
    } catch (err) {
      fs.rmSync(dir, { recursive: true, force: true })
      throw err
    }
  })

  handle(Invoke.decksAddRendered, async (eventId, payload: RenderedDeck) => {
    assertString(eventId, 'Event ID')
    const source = payload?.source === 'image' ? 'image' : payload?.source === 'pdf' ? 'pdf' : null
    if (!source) {
      throw new Error('The import result is not valid. Try importing the file again.')
    }
    const what = source === 'pdf' ? 'PDF' : 'image'
    if (!payload || !Array.isArray(payload.pages) || payload.pages.length === 0) {
      throw new Error(`The ${what} render result is empty. Try importing the ${what} again.`)
    }
    if (!payload.pages.every((p) => p instanceof Uint8Array)) {
      throw new Error(`The ${what} render result is not valid. Try importing the ${what} again.`)
    }
    const conv =
      source === 'pdf' && payload.sourcePath ? converted.get(payload.sourcePath) : undefined
    const out = tempDir()
    try {
      // Async writes keep the main process responsive.
      const slides = await Promise.all(
        payload.pages.map(async (page, i) => {
          const pngPath = join(out, `${String(i + 1).padStart(3, '0')}.png`)
          await fs.promises.writeFile(pngPath, page)
          return { pngPath, notes: String(payload.notes?.[i] ?? '') }
        })
      )
      // macOS with PowerPoint for Mac: a converted PowerPoint file plays native (source.pptx + source.pdf).
      const deck = lib.addDeck(eventId, {
        name: String(payload.name),
        width: Number(payload.width),
        height: Number(payload.height),
        slides,
        ...renderedDeckFields({
          source,
          sourcePath: payload.sourcePath,
          original: conv?.original,
          engine: importEngine()
        })
      })
      state.refresh()
      return deck
    } finally {
      fs.rmSync(out, { recursive: true, force: true })
      if (conv) {
        converted.delete(payload.sourcePath as string)
        fs.rmSync(conv.dir, { recursive: true, force: true })
      }
    }
  })

  handle(Invoke.decksReorder, (eventId, items) => {
    assertString(eventId, 'Event ID')
    if (!Array.isArray(items) || !items.every(isOrderItem)) {
      throw new Error('The deck order is not valid. Reload the app, then try again.')
    }
    state.reorder(eventId, items)
  })
  handle(Invoke.sectionsAdd, (eventId, at) => {
    assertString(eventId, 'Event ID')
    if (at !== 'end' && !Number.isInteger(at)) {
      throw new Error('The section position is not valid. Reload the app, then try again.')
    }
    const res = state.addSection(eventId, at)
    state.refresh()
    return res
  })
  handle(Invoke.sectionsRename, (eventId, sectionId, name) => {
    assertString(eventId, 'Event ID')
    assertString(sectionId, 'Section ID')
    if (typeof name !== 'string') {
      throw new Error('The section name is not valid. Reload the app, then try again.')
    }
    return state.renameSection(eventId, sectionId, name)
  })
  handle(Invoke.sectionsRemove, (eventId, sectionId) => {
    assertString(eventId, 'Event ID')
    assertString(sectionId, 'Section ID')
    const ev = state.removeSection(eventId, sectionId)
    state.refresh()
    return ev
  })
  handle(Invoke.slidesReorder, (deckId, order) => {
    assertString(deckId, 'Deck ID')
    if (!Array.isArray(order)) {
      throw new Error('The slide order is not valid. Reload the app, then try again.')
    }
    state.reorderSlides(deckId, order)
  })
  handle(Invoke.decksRename, (eventId, deckId, name) => {
    assertString(eventId, 'Event ID')
    assertString(deckId, 'Deck ID')
    if (typeof name !== 'string')
      throw new Error('The deck name is not valid. Type a name, then try again.')
    return lib.renameDeck(eventId, deckId, name)
  })
  handle(Invoke.decksSetFit, (eventId, deckId, fit) => {
    assertString(eventId, 'Event ID')
    assertString(deckId, 'Deck ID')
    const deck = lib.setDeckFit(eventId, deckId, fit)
    state.refresh()
    return deck
  })
  handle(Invoke.decksSetAudio, (eventId, deckId, audio) => {
    assertString(eventId, 'Event ID')
    assertString(deckId, 'Deck ID')
    const deck = lib.setDeckAudio(eventId, deckId, audio)
    state.refresh()
    return deck
  })
  handle(Invoke.eventsSetCanvas, (eventId, canvas) => {
    assertString(eventId, 'Event ID')
    const ev = lib.setEventCanvas(eventId, canvas)
    state.refresh()
    return ev
  })
  handle(Invoke.canvasSetDefault, (canvas) => {
    const clean = sanitizeCanvas(canvas)
    if (!clean) throw new Error(CANVAS_INVALID)
    const saved = settings.saveCanvas(clean)
    state.refresh()
    return saved
  })
  handle(Invoke.importSetFormat, (format) =>
    settings.savePptImportFormat(sanitizePptImportFormat(format))
  )
  handle(Invoke.kvSet, (eventId, file) => {
    assertString(eventId, 'Event ID')
    assertString(file, 'File location')
    if (!path.isAbsolute(file)) {
      throw new Error(
        'The file location is not valid. Choose the KV image with Select image or Replace.'
      )
    }
    return state.setKv(eventId, file)
  })
  handle(Invoke.kvClear, (eventId) => {
    assertString(eventId, 'Event ID')
    return state.clearKv(eventId)
  })
  handle(Invoke.decksRemove, (eventId, deckId) => {
    assertString(eventId, 'Event ID')
    assertString(deckId, 'Deck ID')
    try {
      state.removeDeck(eventId, deckId)
    } finally {
      // Even when deleting the folder failed part way: a deck that is gone must not keep a
      // watcher or a staged temp folder. A deck still there (wrong event) keeps its edit session.
      try {
        lib.getDeck(deckId)
      } catch {
        editor.forget(deckId)
      }
    }
    syncWeb()
  })

  // Decks whose folder survived but whose id is in no event (two copies of the app used to
  // overwrite events.json). Offered to the operator instead of being invisible forever.
  handle(Invoke.decksOrphans, () => lib.orphanDecks())

  handle(Invoke.decksRestore, (deckId, eventId) => {
    assertString(deckId, 'Deck ID')
    assertString(eventId, 'Event ID')
    const restored = lib.restoreDeck(deckId, eventId)
    if (restored) state.refresh()
    return restored
  })

  const roleOf = (wc: Electron.WebContents): AppWindowRole => {
    if (hdmi.ownsWebContents(wc)) return 'hdmi'
    if (net.ownsWebContents(wc.id)) return 'omt'
    // Any other app window is a Prepare window.
    return operatorWindow()?.webContents === wc ? 'operator' : 'prepare'
  }
  const outputsActive = (): { hdmi: boolean; omt: boolean } => ({
    hdmi: hdmi.getStatus().state === 'showing',
    omt: net.windowActive
  })
  registerWebIpc(lib, state, web, syncWeb, roleOf, outputsActive, operatorWindow)
  registerSlideshowIpc(slideShow, roleOf)

  const operatorOnly = (e: IpcMainInvokeEvent): void => {
    if (roleOf(e.sender) !== 'operator') throw new Error(NOT_APP_WINDOW)
  }
  // No manager on this build (dev, macOS): the renderer hides every update control.
  const noopStatus = UNSUPPORTED_UPDATE_STATUS
  appHandle(Invoke.updateStatus, (e) => {
    operatorOnly(e)
    return updateManager?.status ?? noopStatus
  })
  appHandle(Invoke.updateCheck, async (e) => {
    operatorOnly(e)
    await updateManager?.check()
    return updateManager?.status ?? noopStatus
  })
  appHandle(Invoke.updateDownload, async (e) => {
    operatorOnly(e)
    await updateManager?.download()
    return updateManager?.status ?? noopStatus
  })
  appHandle(Invoke.updateInstall, (e) => {
    operatorOnly(e)
    return updateManager?.install() ?? false
  })
  appHandle(Invoke.updateSkip, (e) => {
    operatorOnly(e)
    updateManager?.skip()
    return updateManager?.status ?? noopStatus
  })

  handle(Invoke.settingsGet, () => settings.get())
  appHandle(Invoke.webChromeStatus, (e) => {
    operatorOnly(e)
    return webChrome.status()
  })
  appHandle(Invoke.webChromeSet, (e, on) => {
    operatorOnly(e)
    if (typeof on !== 'boolean')
      throw new Error('Use Chrome for web pages is not valid. Reload the app, then try again.')
    return webChrome.set(on)
  })
  appHandle(Invoke.webChromeSignIn, (e) => {
    operatorOnly(e)
    return webChrome.signIn()
  })
  handle(Invoke.appVersion, () => app.getVersion())

  handle(Invoke.displaysList, () => hdmi.displays())
  handle(Invoke.hdmiGetStatus, () => hdmi.getStatus())
  handle(Invoke.hdmiSet, (input: HdmiSettings) => {
    // Checked against the screens connected right now: a stale or forged id,
    // the primary, or the display holding the operator window is refused with
    // the fix. Turning HDMI off is always accepted.
    const displays = hdmi.displays()
    const operatorId = hdmi.operatorDisplayId()
    const error = hdmiSettingsError(input, displays, operatorId)
    if (error) throw new Error(error)
    const saved = settings.saveHdmi(resolveHdmi(input, displays, operatorId))
    hdmi.apply(saved.hdmi)
    rememberOutput({ hdmi: saved.hdmi.enabled })
    return saved
  })

  handle(Invoke.audioSet, (input: AudioSettings) => {
    const saved = settings.saveAudio(sanitizeAudio(input))
    broadcast(Broadcast.audioSettings, saved.audio)
    slideShow.syncSound()
    return saved
  })

  handle(Invoke.audioPatch, (patch: Partial<AudioSettings>) => {
    // Merged with what is saved right now, so a stale window cannot undo another's change.
    const saved = settings.saveAudio(mergeAudio(settings.get().audio, patch))
    broadcast(Broadcast.audioSettings, saved.audio)
    slideShow.syncSound()
    return saved
  })

  handle(Invoke.omtGetStatus, () => net.status('omt'))
  handle(Invoke.omtSet, (input: OmtSettings) => {
    const saved = settings.saveOmt(sanitizeOmt(input))
    net.apply({ omt: saved.omt, ndi: saved.ndi })
    rememberOutput({ omt: saved.omt.enabled })
    return saved
  })
  handle(Invoke.networkSetFps, (fps: 30 | 60) => {
    const saved = settings.saveOmt({ ...settings.get().omt, fps: fps === 60 ? 60 : 30 })
    net.apply({ omt: saved.omt, ndi: saved.ndi })
    return saved
  })
  handle(Invoke.networkSetContentOnly, (on: boolean) => {
    if (typeof on !== 'boolean')
      throw new Error('Send content only is not valid. Reload the app, then try again.')
    const saved = settings.saveSendContentOnly(on)
    net.contentChanged()
    return saved
  })
  handle(Invoke.ndiGetStatus, () => net.status('ndi'))
  handle(Invoke.ndiSet, (input: NdiSettings) => {
    const saved = settings.saveNdi(sanitizeNdi(input))
    net.apply({ omt: saved.omt, ndi: saved.ndi })
    rememberOutput({ ndi: saved.ndi.enabled })
    return saved
  })

  state.onChange((s) => {
    broadcast(Broadcast.programState, s)
    // The Canvas may differ (event override, machine default): the OMT frame size follows it.
    net.canvasChanged()
    // What is on air may be a Fit slide now, or not: the sent rectangle follows it.
    net.contentChanged()
    // The output has a new owner: its saved outputs (if any) take over.
    if (s.airEvent !== outputOwner) {
      outputOwner = s.airEvent
      applyEventOutputs(outputOwner)
    }
  })
}

/** HOLD before navigating waits at most this long for the outputs to pause their stream. */
const HELD_ACK_TIMEOUT_MS = 1000

/** What Settings can ask of the Chrome web page option (Linux). */
interface WebChromeControl {
  status(): WebChromeStatus
  /** Saves the setting; it applies after a restart. */
  set(on: boolean): WebChromeStatus
  /** Opens the Google sign-in window; throws a sentence with the fix when it cannot. */
  signIn(): WebChromeStatus
}

/** Reads this PC and the saved setting, then picks the web page backend (see chooseWebBackend). */
function pickWebBackend(o: {
  packaged: boolean
  resourcesPath: string
  appPath: string
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  chromeEnabled: boolean
  chrome: ChromeDetection
}): WebBackendChoice {
  const exe = webBridgeExePath({
    packaged: o.packaged,
    resourcesPath: o.resourcesPath,
    appPath: o.appPath
  })
  const linuxScript = webBridgeLinuxScriptPath({
    packaged: o.packaged,
    resourcesPath: o.resourcesPath,
    appPath: o.appPath
  })
  return chooseWebBackend({
    platform: o.platform,
    env: o.env,
    webView2: {
      helper: o.platform === 'win32' && fs.existsSync(exe),
      runtime:
        o.platform === 'win32' &&
        webView2RuntimeFound({
          env: o.env,
          exists: fs.existsSync,
          ...(o.env['ProgramFiles(x86)'] ? { programFilesX86: o.env['ProgramFiles(x86)'] } : {}),
          ...(o.env['ProgramFiles'] ? { programFiles: o.env['ProgramFiles'] } : {}),
          ...(o.env['LOCALAPPDATA'] ? { localAppData: o.env['LOCALAPPDATA'] } : {})
        })
    },
    chrome: {
      enabled: o.chromeEnabled,
      browser: o.chrome.browser,
      problem: o.chrome.problem,
      helper: o.platform === 'linux' && fs.existsSync(linuxScript)
    }
  })
}

/**
 * The backend that hosts web deck pages, already chosen by `pickWebBackend`: WebView2 on
 * Windows, the PC's Chrome on Linux when the operator turned it on, otherwise the Electron page
 * window. `PPT_ENGINE_FAKE=1` swaps the helper for FakeWebEngine. A helper that stops three
 * times falls back to Electron through the supervisor (`onFallback`).
 */
function createWebPageBackend(o: {
  choice: WebBackendChoice
  packaged: boolean
  resourcesPath: string
  appPath: string
  userData: string
  env: NodeJS.ProcessEnv
  operatorWindow: () => BrowserWindow | null
  isLive: (deckId: string) => boolean
  /** HOLD the deck (the helper hung). */
  onHold: (deckId: string) => void
  /** The helper gave up: main switches this session to the Electron backend. */
  onFallback: (message: string) => void
  /** A one-line operator notice (e.g. WebView2 missing) shown while it lasts. */
  onNote: (message: string) => void
  devUrl?: string
}): PageBackend {
  const electron = (): PageBackend =>
    new ElectronPageBackend({
      operatorWindow: o.operatorWindow,
      isLive: o.isLive,
      ...(o.devUrl ? { devUrl: o.devUrl } : {})
    })
  const exe = webBridgeExePath({
    packaged: o.packaged,
    resourcesPath: o.resourcesPath,
    appPath: o.appPath
  })
  const choice = o.choice
  if (choice.kind === 'electron') {
    // The operator expects a helper this PC cannot run (no WebView2, Snap Chrome, ...): say why.
    if (choice.note) o.onNote(choice.note)
    return electron()
  }
  const createEngine = (): WebPageEngine => {
    if (choice.kind === 'fake') return new FakeWebEngine()
    if (choice.kind === 'chrome') {
      const script = webBridgeLinuxScriptPath({
        packaged: o.packaged,
        resourcesPath: o.resourcesPath,
        appPath: o.appPath
      })
      return new WebBridgeEngine({
        exe: script,
        userData: linuxProfileRoot(o.userData),
        args: ['--browser', choice.browser.path],
        // The helper is a Node script: Electron runs it as plain Node.
        spawn: (file, args) =>
          spawn(process.execPath, [file, ...args], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...o.env, ELECTRON_RUN_AS_NODE: '1' }
          }) as unknown as BridgeChild,
        onStartFailure: (message) => o.onNote(message)
      })
    }
    return new WebBridgeEngine({
      exe,
      userData: join(o.userData, 'web-profile'),
      onStartFailure: (message) => o.onNote(message)
    })
  }
  // The supervisor keeps one stable engine reference while replacing the process behind it.
  const supervisor = new WebEngineSupervisor({
    create: createEngine,
    onHold: o.onHold,
    onFallback: o.onFallback
  })
  const backend = new WebView2PageBackend(supervisor, {
    getSources: (types) => desktopCapturer.getSources({ types }),
    // Park the page window outside every display: Windows capture draws the mouse pointer
    // into the frame when it is inside the window, and the operator's pointer lives on the
    // operator display. Verified: frames keep arriving from a parked window.
    parkAt: (canvas) => {
      const bounds = screen.getAllDisplays().map((d) => d.bounds)
      const left = Math.min(...bounds.map((b) => b.x))
      const top = Math.min(...bounds.map((b) => b.y))
      return { x: left - canvas.width - 200, y: top }
    }
  })
  supervisor.onPagesReopened = (pages) => backend.applyReopened(pages)
  if (o.env['PPT_OUTPUT_DUMP']) {
    Object.defineProperty(globalThis, '__pptWebEngine', {
      configurable: true,
      get: () => ({ ready: supervisor.ready(), kill: () => supervisor.kill() })
    })
  }
  return backend
}

/** web:* channels; every one refuses a caller that is not an app window. */
function registerWebIpc(
  lib: Library,
  state: AppState,
  web: WebHost,
  syncWeb: () => void,
  roleOf: (wc: Electron.WebContents) => AppWindowRole,
  outputsActive: () => { hdmi: boolean; omt: boolean },
  operatorWindow: () => BrowserWindow | null
): void {
  // Ready gate and capture-ended reports only count from a window that puts the page on air.
  const onAirSender = (e: IpcMainInvokeEvent): boolean =>
    frameSenderAllowed(roleOf(e.sender), outputsActive())

  const eventOfDeck = (deckId: string): string => {
    const ev = lib.listEvents().find((e) => e.deckIds.includes(deckId))
    if (!ev) throw new Error('Deck not found. Reload the deck list, then choose a deck from it.')
    return ev.id
  }

  appHandle(Invoke.webAdd, (_e, eventId, url, name) => {
    assertString(eventId, 'Event ID')
    const clean = sanitizeWebUrl(typeof url === 'string' ? url : '')
    if ('error' in clean) throw new Error(clean.error)
    const given = typeof name === 'string' ? name.trim() : ''
    const canvas = state.state.canvas
    const dir = tempDir()
    let deck
    try {
      deck = lib.addWebDeck(eventId, {
        name: given ? webDeckName(given, clean.url) : webDomain(clean.url),
        url: clean.url,
        snapshotPath: placeholderSnapshot(dir, canvas.width, canvas.height),
        width: canvas.width,
        height: canvas.height
      })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    state.refresh()
    syncWeb()
    if (!given) web.nameFromTitle(deck.id)
    return deck
  })
  // The page on air (not frozen): HOLD first, then navigate once the outputs hold their frame.
  const acks = new HeldAcks()
  web.waitHeld = (deckId) => acks.wait(deckId, heldAckRoles(outputsActive()), HELD_ACK_TIMEOUT_MS)
  appHandle(Invoke.webHeld, (e, deckId) => {
    assertString(deckId, 'Deck ID')
    acks.ack(deckId, roleOf(e.sender))
  })
  appHandle(Invoke.webSetUrl, async (_e, deckId, url) => {
    assertString(deckId, 'Deck ID')
    const deck = lib.setWebUrl(eventOfDeck(deckId), deckId, typeof url === 'string' ? url : '')
    if (deck.web) {
      try {
        await web.navigate(deckId, deck.web.url)
      } catch {
        // No page open (deck of another event): it loads the new URL when its event opens.
      }
    }
    return deck
  })
  appHandle(Invoke.webReload, async (_e, deckId) => {
    assertString(deckId, 'Deck ID')
    await web.reload(deckId)
  })
  appHandle(Invoke.webNav, async (_e, deckId, dir) => {
    assertString(deckId, 'Deck ID')
    if (dir === 'back') await web.back(deckId)
    else if (dir === 'forward') await web.forward(deckId)
    else throw new Error('The navigation is not valid. Use Back or Forward.')
  })
  appHandle(Invoke.webStop, (_e, deckId) => {
    assertString(deckId, 'Deck ID')
    web.stop(deckId)
  })
  appHandle(Invoke.webHome, async (_e, deckId) => {
    assertString(deckId, 'Deck ID')
    await web.home(deckId)
  })
  appHandle(Invoke.webSetZoom, (_e, deckId, zoom) => {
    assertString(deckId, 'Deck ID')
    if (!isPageZoom(zoom)) throw new Error('Choose a page zoom from the list.')
    return web.setZoom(deckId, zoom)
  })
  appHandle(Invoke.webNavStates, () => web.navStates())
  appHandle(Invoke.webInput, (e, deckId, input) => {
    assertString(deckId, 'Deck ID')
    // A Prepare window drives only the deck it was opened for.
    const role = roleOf(e.sender)
    const prepareDeck = role === 'prepare' ? prepareDeckOf(e.sender) : null
    if (!prepareInputAllowed(role, deckId, prepareDeck)) return false
    return web.prepareInput(deckId, input)
  })
  appHandle(Invoke.webSetInteract, (e, deckId, on) => {
    assertString(deckId, 'Deck ID')
    if (typeof on !== 'boolean') throw new Error('Interact must be on or off.')
    // The operator and Prepare windows take input; the outputs only show the audience a picture.
    const role = roleOf(e.sender)
    if (role !== 'operator' && role !== 'prepare') throw new Error(NOT_APP_WINDOW)
    web.setInteract(deckId, on, e.sender)
  })
  appHandle(Invoke.webSourceId, (e, deckId) => {
    assertString(deckId, 'Deck ID')
    return web.sourceIdFor(deckId, e.sender)
  })
  // A report from another window (Prepare, or the operator preview while an output is on) is ignored.
  appHandle(Invoke.webFrame, (e, deckId) => {
    assertString(deckId, 'Deck ID')
    if (onAirSender(e)) web.frameSeen(deckId)
  })
  appHandle(Invoke.webEnded, (e, deckId) => {
    assertString(deckId, 'Deck ID')
    if (onAirSender(e)) web.captureEnded(deckId)
  })
  appHandle(Invoke.webOpenPrepare, (_e, deckId) => {
    assertString(deckId, 'Deck ID')
    openPrepareWindow(deckId, operatorWindow())
  })
  appHandle(Invoke.webSignOut, () => web.signOut())
  appHandle(Invoke.webStatuses, () => web.statuses())

  // Who captures pages that are not live yet: active outputs, else the operator window.
  let outputs = outputsActive()
  let warnings: WebCaptureWarning[] = []
  const setWarnings = (next: WebCaptureWarning[]): void => {
    if (JSON.stringify(next) === JSON.stringify(warnings)) return
    warnings = next
    broadcast(Broadcast.webCaptureWarnings, warnings)
  }
  outputsMaybeChanged = () => {
    const now = outputsActive()
    if (now.hdmi !== outputs.hdmi || now.omt !== outputs.omt) {
      outputs = now
      broadcast(Broadcast.webOutputs, now)
    }
    setWarnings(updateCaptureWarnings(warnings, null, '', false, now))
  }
  appHandle(Invoke.webOutputs, () => outputsActive())
  appHandle(Invoke.webCaptureFailed, (e, deckId, failed) => {
    assertString(deckId, 'Deck ID')
    const role = roleOf(e.sender)
    // Only the outputs show the page to the audience; other windows have no warning.
    if (role !== 'hdmi' && role !== 'omt') return
    // A native deck's slide show has its own warning copy.
    const deck = state.decks().find((d) => d.id === deckId)
    const kind = deck && playbackOf(deck) === 'native' ? 'slides' : 'web'
    setWarnings(
      updateCaptureWarnings(warnings, role, deckId, failed === true, outputsActive(), kind)
    )
  })
  appHandle(Invoke.webCaptureWarnings, () => warnings)
}

/** The native slide show pieces the IPC and the output windows use. */
interface SlideShowHost {
  engine: SlideShowEngine
  manager: SlideShowManager
  /** PowerPoint's sound: the audio pipe, the output windows' ports and the level fallback. */
  sound: SlideSound
  /** Hands the current program state and sound settings to `sound`. */
  syncSound(): void
  /** The bridge `import` command of the LibreOffice engine (rejects when there is none). */
  libreOfficeImport(req: Record<string, unknown>): Promise<Record<string, unknown>>
  /** Shuts the engine down and removes the sound sink. */
  stop(): Promise<void>
  /** Session state of the native decks and the helper start failure. */
  status(): SlideshowStatus
}

/** The copy shown while PowerPoint's sound cannot be routed by the app (see SlideSound). */
let slideNote: string | null = null

/**
 * slideshow:* channels. The capture id answers app windows only (never a web page), only
 * for the deck's own slide show window, and rejects otherwise (the output shows the PNG).
 * The sound port goes to the HDMI and OMT windows.
 */
function registerSlideshowIpc(
  host: SlideShowHost,
  roleOf: (wc: Electron.WebContents) => AppWindowRole
): void {
  appHandle(Invoke.slideshowSourceId, (e, deckId) => {
    assertString(deckId, 'Deck ID')
    // Prepare windows never show a slide show; the operator and outputs do.
    if (roleOf(e.sender) === 'prepare') throw new Error(NOT_APP_WINDOW)
    return slideshowSourceId(host.manager.windowId(deckId), (types) =>
      desktopCapturer.getSources({ types, thumbnailSize: { width: 0, height: 0 } })
    )
  })
  appHandle(Invoke.slideshowCrop, (e, deckId) => {
    assertString(deckId, 'Deck ID')
    // Prepare windows never show a slide show; the operator and outputs do.
    if (roleOf(e.sender) === 'prepare') throw new Error(NOT_APP_WINDOW)
    return host.manager.crop(deckId)
  })
  appHandle(Invoke.slideshowNote, () => slideNote)
  appHandle(Invoke.slideshowStatus, () => host.status())

  // Each output window asks for a fresh port (on mount, and again after a reload).
  const known = new Set<number>()
  ipcMain.on(Send.slideshowAudioPortRequest, (e: IpcMainEvent) => {
    if (!fromAppWindow(e)) return
    const role = roleOf(e.sender)
    if (role !== 'hdmi' && role !== 'omt') return
    const { port1, port2 } = new MessageChannelMain()
    const id = e.sender.id
    host.sound.fanout.add(id, port2)
    if (!known.has(id)) {
      known.add(id)
      e.sender.once('destroyed', () => {
        known.delete(id)
        host.sound.fanout.remove(id)
      })
    }
    e.sender.postMessage(SLIDESHOW_AUDIO_PORT, null, [port1])
  })
}

/** settings.json: loaded once, saved atomically on every change. */
class SettingsStore {
  private settings: Settings

  constructor(private file: string) {
    this.settings = loadSettings(file)
  }

  get(): Settings {
    return this.settings
  }

  /** Saves HDMI settings (validated by the caller). */
  saveHdmi(hdmi: HdmiSettings): Settings {
    return this.save({ ...this.settings, hdmi })
  }

  saveOmt(omt: OmtSettings): Settings {
    return this.save({ ...this.settings, omt })
  }

  saveNdi(ndi: NdiSettings): Settings {
    return this.save({ ...this.settings, ndi })
  }

  saveSendContentOnly(sendContentOnly: boolean): Settings {
    return this.save({ ...this.settings, sendContentOnly })
  }

  saveAudio(audio: AudioSettings): Settings {
    return this.save({ ...this.settings, audio })
  }

  /** Saves the machine default canvas (validated by the caller). */
  savePptImportFormat(pptImportFormat: PptImportFormat): Settings {
    return this.save({ ...this.settings, pptImportFormat })
  }

  saveCanvas(canvas: Canvas): Settings {
    return this.save({ ...this.settings, canvas })
  }

  saveWebChrome(webChrome: boolean): Settings {
    return this.save({ ...this.settings, webChrome })
  }

  saveClickerBackground(clickerBackground: boolean): Settings {
    return this.save({ ...this.settings, clickerBackground })
  }

  saveClickerKeys(clickerKeys: ClickerKeys): Settings {
    return this.save({ ...this.settings, clickerKeys })
  }

  saveAutoAdvance(autoAdvance: boolean): Settings {
    return this.save({ ...this.settings, autoAdvance })
  }

  saveUpdates(updates: UpdateSettings): Settings {
    return this.save({ ...this.settings, updates })
  }

  private save(input: Settings): Settings {
    const next = sanitizeSettings(input)
    try {
      saveSettings(this.file, next)
    } catch (err) {
      console.error('[settings] could not be saved:', err)
      throw new Error('Could not save settings. Check free disk space, then try again.')
    }
    this.settings = next
    return next
  }
}

/** HDMI output on a second display; its status and the display list are pushed to the UI. */
function createHdmiOutput(settings: SettingsStore): HdmiOutput {
  // PPT_OUTPUT_DUMP (dev/e2e only): HDMI window state on globalThis.__pptHdmi,
  // and __pptHdmiFakeDisplays(list | null) to simulate plugging and unplugging
  // a second display on a machine that has only one.
  let fakeDisplays: ScreenDisplay[] | null = null
  const hdmi = new HdmiOutput(
    settings.get().hdmi,
    (s: HdmiStatus) => {
      broadcast(Broadcast.hdmiStatus, s)
      queueMicrotask(() => outputsMaybeChanged())
    },
    (d) => broadcast(Broadcast.displaysChanged, d),
    (displayId) => {
      try {
        settings.saveHdmi({ ...settings.get().hdmi, displayId })
      } catch (err) {
        console.error('[hdmi] new display could not be saved:', err)
      }
    },
    () => fakeDisplays ?? screenDisplays()
  )
  if (process.env['PPT_OUTPUT_DUMP']) {
    Object.defineProperty(globalThis, '__pptHdmi', {
      configurable: true,
      get: () => hdmi.debug
    })
    Object.defineProperty(globalThis, '__pptHdmiFakeDisplays', {
      configurable: true,
      value: (list: ScreenDisplay[] | null) => {
        fakeDisplays = list
        hdmi.onScreen()
      }
    })
  }
  return hdmi
}

/**
 * The slide show engine: PowerPoint (ppt-bridge.exe) on Windows, the in-memory FakeEngine
 * elsewhere and with PPT_OUTPUT_DUMP + PPT_ENGINE_FAKE=1 (e2e). A helper that cannot start
 * leaves every native deck on still images (the engine rejects its opens, nothing is ready).
 */
function createSlideShow(
  lib: Library,
  state: AppState,
  settings: SettingsStore,
  info: EngineInfo
): SlideShowHost {
  const e2eFake = !!process.env['PPT_OUTPUT_DUMP'] && process.env['PPT_ENGINE_FAKE'] === '1'
  // Without a usable engine (or a session that cannot be captured) the manager never opens a
  // slide show, so the FakeEngine stands in without ever being asked.
  const fake = e2eFake || info.engine === 'none'
  const pulse = new PulseSink()
  const canCapture = e2eFake || info.canCapture
  let helperError: string | null = null
  const sound = new SlideSound({
    setVolume: (v) =>
      engine instanceof PowerPointEngine ? engine.setVolume(v) : Promise.resolve(),
    onNote: (n) => {
      slideNote = n
      broadcast(Broadcast.slideshowNote, n)
    }
  })
  const engine: SlideShowEngine = fake
    ? new FakeEngine(() => state.decks())
    : info.engine === 'libreoffice'
      ? new LibreOfficeEngine({
          script: loBridgePath({
            packaged: app.isPackaged,
            resourcesPath: process.resourcesPath,
            appPath: app.getAppPath()
          }),
          profile: join(app.getPath('userData'), 'lo-profile'),
          ensureSink: () => pulse.ensure(),
          onStartFailure: (message) => {
            helperError = message
            console.error('[slideshow]', message)
          },
          onAudio: (a) => sound.engineAudio({ mode: a.mode, pipe: null, note: a.note })
        })
      : new PowerPointEngine({
          exe: bridgeExePath({
            platform: process.platform,
            packaged: app.isPackaged,
            resourcesPath: process.resourcesPath,
            appPath: app.getAppPath()
          }),
          dpi: () => screen.getPrimaryDisplay().scaleFactor * 96,
          // macOS: PowerPoint opens decks from the folder it already has access to (import folder)
          workDir: join(app.getPath('userData'), 'PowerPoint export'),
          onStartFailure: (message) => {
            helperError = message
            console.error('[slideshow]', message)
          },
          onAudio: (a) => sound.engineAudio(a)
        })
  const manager = new SlideShowManager(
    engine,
    state,
    () => state.decks(),
    () => state.state.canvas,
    (deckId) => {
      try {
        return lib.sourceFilePath(deckId)
      } catch (err) {
        console.error('[slideshow] deck file:', (err as Error).message)
        return ''
      }
    },
    undefined,
    canCapture
  )
  if (process.env['PPT_OUTPUT_DUMP']) {
    Object.defineProperty(globalThis, '__pptEngine', {
      configurable: true,
      get: () => ({
        fake,
        helperError,
        opens: engine instanceof FakeEngine ? engine.opens : [],
        // e2e: the engine dies (FakeEngine only); the manager falls back and restarts it. The
        // restart opens the slide show again (and resumes native by itself) after `reopenMs`,
        // which leaves time to look at the fallback.
        crash: (reopenMs = 0) => {
          if (!(engine instanceof FakeEngine)) return
          engine.delayReady(reopenMs)
          engine.crash()
        },
        reopenNow: () => (engine instanceof FakeEngine ? engine.delayReady(0) : undefined)
      })
    })
  }
  const syncSound = (): void => sound.program(state.state, settings.get().audio)
  state.onChange(syncSound)
  const status = (): SlideshowStatus => {
    const decks = engineStates(state.decks(), manager)
    return {
      decks,
      resumable: Object.keys(decks).filter((id) => manager.fellBack(id) && manager.sessionOpen(id)),
      helperError:
        (engine instanceof PowerPointEngine || engine instanceof LibreOfficeEngine
          ? engine.helperError
          : null) ?? (e2eFake ? null : (info.message ?? null)),
      engine: e2eFake ? 'powerpoint' : info.engine
    }
  }
  let lastStatus = JSON.stringify(status())
  const pushStatus = (): void => {
    const next = status()
    const json = JSON.stringify(next)
    if (json === lastStatus) return
    lastStatus = json
    broadcast(Broadcast.slideshowStatus, next)
  }
  manager.onStatus(pushStatus)
  state.onChange(pushStatus)
  const libreOfficeImport = async (
    req: Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    if (!(engine instanceof LibreOfficeEngine)) {
      throw new Error('LibreOffice is not available. Restart Bridgecast, then try again.')
    }
    return engine.importDeck(req)
  }
  // Ends the engine, then removes the private sound sink (only the modules this run loaded).
  const stop = (): Promise<void> => engine.shutdown().finally(() => pulse.remove())
  return { engine, manager, sound, syncSound, status, libreOfficeImport, stop }
}

/**
 * Network output (OMT and NDI). PPT_OMT_FAKE=1 swaps libomt for a recording fake
 * (e2e, no native library); PPT_NDI_FAKE=1 does the same for NDI and
 * PPT_NDI_FAKE=missing simulates an absent NDI runtime.
 */
/**
 * The part of the Canvas the network outputs send. Only an image or PDF slide of a Fit deck
 * is cut to its own rectangle (no black bars). KV, Black, web pages, streams, the native
 * slideshow and video slides send the whole Canvas, as does everything when the setting is off.
 */
function sendRectOf(lib: Library, sendContentOnly: boolean, s: ProgramState): ContentRect {
  const whole = contentRect(s.canvas, null, 'fit')
  if (!sendContentOnly || s.black || kvOnAir(s)) return whole
  const shown = s.shown
  if (!shown || shown.video) return whole
  let deck: DeckMeta
  try {
    deck = lib.getDeck(shown.deckId)
  } catch {
    return whole
  }
  if (
    deck.source !== 'pptx' &&
    deck.source !== 'pdf' &&
    deck.source !== 'folder' &&
    deck.source !== 'image'
  )
    return whole
  if ((shown.playback ?? playbackOf(deck)) === 'native') return whole
  return contentRect(s.canvas, { width: deck.width, height: deck.height }, shown.fit ?? 'fit')
}

function createNetOutput(settings: SettingsStore, state: AppState, lib: Library): NetOutput {
  const dump = !!process.env['PPT_OUTPUT_DUMP']
  const ndiFake = process.env['PPT_NDI_FAKE']
  const net = new NetOutput(
    { omt: settings.get().omt, ndi: settings.get().ndi },
    () => state.state.canvas,
    (id: NetId, s: NetStatus) => {
      broadcast(id === 'omt' ? Broadcast.omtStatus : Broadcast.ndiStatus, s)
      // After the microtask: the network window is created right after the status is set.
      queueMicrotask(() => outputsMaybeChanged())
    },
    {
      fake: process.env['PPT_OMT_FAKE'] === '1',
      fakeNdi: ndiFake === 'missing' ? 'missing' : ndiFake === '1',
      debug: dump
    },
    () => sendRectOf(lib, settings.get().sendContentOnly, state.state)
  )
  if (dump) {
    Object.defineProperty(globalThis, '__pptOmt', { configurable: true, get: () => net.debug })
    Object.defineProperty(globalThis, '__pptNet', {
      configurable: true,
      get: () => {
        const d = net.debug
        return {
          windows: d.windowExists ? 1 : 0,
          targets: (d.frames?.targets ?? []).map((t) => ({
            id: t.id,
            frames: t.frames,
            lastPx: t.lastPx
          }))
        }
      }
    })
  }
  return net
}

function createWindow(onReady?: () => void): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#0c0e12',
    title: 'Bridgecast',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    onReady?.()
  })
  // The HDMI output window keeps the app alive otherwise.
  mainWindow.on('closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:/.test(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })
  // The operator window never navigates away from the app (e.g. a stray file drop).
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())

  // PPT_SKIP_HOME=1 (e2e): the operator window opens on the console instead of Home. It reaches
  // the renderer as a hash query (`#/?skipHome=1`), read in main.tsx.
  // PPT_OUTPUT_DUMP and PPT_SKIP_TOUR=1 (e2e) also skip the first-run tour (`skipTour=1`).
  const hashParams = [
    process.env['PPT_SKIP_HOME'] === '1' ? 'skipHome=1' : '',
    process.env['PPT_OUTPUT_DUMP'] || process.env['PPT_SKIP_TOUR'] === '1' ? 'skipTour=1' : ''
  ].filter(Boolean)
  const hash = hashParams.length ? `/?${hashParams.join('&')}` : ''
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? `#${hash}` : ''))
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
  return mainWindow
}

// Lets the e2e smoke test (and power users) point the library at another folder.
if (process.env['PPT_SHARE_USER_DATA']) {
  app.setPath('userData', process.env['PPT_SHARE_USER_DATA'])
} else if (!app.isPackaged) {
  // Development runs keep their own library, so test decks never show up in an installed
  // Bridgecast on the same PC (both would otherwise share one userData folder).
  app.setPath('userData', join(app.getPath('appData'), 'bridgecast-dev'))
} else {
  // Renamed from PPT Share: carry the old library over once.
  migrateUserData(app.getPath('userData'), app.getPath('appData'))
}

/**
 * One instance per data folder, taken once userData is known. Two copies of the app each keep the
 * event list in memory and write `events.json` whole, so the last writer silently dropped the deck
 * ids the other one had just added: the deck folders stayed on disk but disappeared from the
 * library. A second start hands over to the running window instead of opening its own. e2e runs get
 * their own PPT_SHARE_USER_DATA, so they never collide with an installed app.
 */
if (!app.requestSingleInstanceLock()) app.exit(0)

app.on('second-instance', () => {
  const win = operatorWindowRef()
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.bridgecast.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Audio output labels and setSinkId need media permissions; only the app's
  // own pages get them (the HDMI output window uses the default session).
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) =>
    permissionAllowed(permission, origin, devUrl)
  )
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(permissionAllowed(permission, details.requestingUrl, devUrl))
  )

  const root = app.getPath('userData')
  // Which program plays PowerPoint files here: by platform only (PowerPoint, LibreOffice, none).
  const engineInfo = detectEngine({
    platform: process.platform,
    sessionType,
    x11Capture: x11Capture !== null,
    ...(process.platform === 'linux' ? await probeLinux() : { hasSoffice: false, hasPyUno: false }),
    ...(process.platform === 'darwin'
      ? {
          hasPowerPoint: fs.existsSync('/Applications/Microsoft PowerPoint.app'),
          macosMajor: macosMajorFromDarwin(os.release())
        }
      : {})
  })
  let lib: Library
  try {
    lib = new Library(root)
  } catch (err) {
    dialog.showErrorBox(
      'Bridgecast',
      `${(err as Error).message}

Location: ${root}`
    )
    app.quit()
    return
  }
  const settings = new SettingsStore(join(root, 'settings.json'))
  // Web deck diagnostics: `<userData>/web.log` (helper lifecycle, loads, capture, HOLD).
  setWebLogFile(join(app.getPath('userData'), 'web.log'))
  // The web host needs the state and the state needs the host (ready gate, arrow keys).
  let web: WebHost | null = null
  // Likewise the slide show manager: a native take asks it whether the deck's slide show is ready.
  let slides: SlideShowManager | null = null
  const state = new AppState(
    lib,
    settings.get().autoAdvance,
    () => settings.get().canvas,
    (deckId) => web?.webReady(deckId) ?? false,
    (deckId, key) => web?.key(deckId, key),
    (deckId) => slides?.ready(deckId) ?? false,
    (deckId) => web?.interacting(deckId) ?? false
  )
  const slideShow = createSlideShow(lib, state, settings, engineInfo)
  configureImport({
    engine: engineInfo,
    format: () => settings.get().pptImportFormat,
    powerPoint: importPptxPowerPoint,
    libreOffice: (file, outDir, width, opts) =>
      importPptxLibreOffice(file, outDir, width, opts, {
        bridgeImport: (req) => slideShow.libreOfficeImport(req),
        installedFonts: installedFonts
      })
  })
  slides = slideShow.manager
  // The auto advance toggle is part of the program state; keep it saved.
  state.onChange((s) => {
    if (s.autoAdvance === settings.get().autoAdvance) return
    try {
      settings.saveAutoAdvance(s.autoAdvance)
    } catch (err) {
      console.error('[settings] auto advance could not be saved:', err)
    }
  })
  const hdmi = createHdmiOutput(settings)
  const net = createNetOutput(settings, state, lib)
  let operator: BrowserWindow | null = null
  const webDevUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
  const isLiveWeb = (deckId: string): boolean => state.state.shown?.web?.deckId === deckId
  const electronWebBackend = (): PageBackend =>
    new ElectronPageBackend({
      operatorWindow: () => operator,
      isLive: isLiveWeb,
      ...(webDevUrl ? { devUrl: webDevUrl } : {})
    })
  let webHost: WebHost | null = null
  /** One-line operator notice while it lasts (a PC without WebView2). */
  let webNote: string | null = null
  // Linux: web pages in the PC's Chrome (opt-in). Chosen once here; a changed setting applies
  // after a restart, so a page on air is never touched.
  const chromeDetect: ChromeDetection =
    process.platform === 'linux' ? detectLinuxChrome(process.env) : { browser: null, problem: null }
  const webChoice = pickWebBackend({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    platform: process.platform,
    env: process.env,
    chromeEnabled: settings.get().webChrome,
    chrome: chromeDetect
  })
  /** This session's pages run in Chrome (false again once the supervisor fell back). */
  let chromeActive = webChoice.kind === 'chrome'
  const signInProfile = join(linuxProfileRoot(app.getPath('userData')), SHARED_PROFILE)
  const googleSignIn = new GoogleSignIn(
    {
      spawn: (file, args, env) =>
        spawn(file, args, { stdio: 'ignore', env }) as unknown as SignInChild,
      mkdir: (dir) => void fs.mkdirSync(dir, { recursive: true }),
      inUse: (dir) => profileInUse(dir),
      env: childEnv(process.env)
    },
    () => broadcast(Broadcast.webChromeStatus, webChrome.status())
  )
  const webChrome: WebChromeControl = {
    status: () =>
      chromeStatus({
        platform: process.platform,
        enabled: settings.get().webChrome,
        browser: chromeDetect.browser,
        problem: chromeDetect.problem,
        active: chromeActive,
        signInOpen: googleSignIn.open
      }),
    set: (on) => {
      if (process.platform !== 'linux') throw new Error('Chrome for web pages is only on Linux.')
      settings.saveWebChrome(on)
      const s = webChrome.status()
      broadcast(Broadcast.webChromeStatus, s)
      return s
    },
    signIn: () => {
      const refusal = signInRefusal(webChrome.status())
      if (refusal) throw new Error(refusal)
      googleSignIn.start(chromeDetect.browser!, signInProfile)
      return webChrome.status()
    }
  }
  const host = new WebHost(
    lib,
    state,
    () => state.state.canvas,
    (deckId, status, message, warning) =>
      broadcast(Broadcast.webStatus, {
        deckId,
        status,
        ...(message ? { message } : {}),
        ...((warning ?? webNote) ? { warning: warning ?? webNote! } : {})
      }),
    createWebPageBackend({
      choice: webChoice,
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
      userData: app.getPath('userData'),
      env: process.env,
      operatorWindow: () => operator,
      isLive: isLiveWeb,
      onHold: (deckId) => {
        if (isLiveWeb(deckId)) state.setWebHold(true)
      },
      onFallback: (message) => {
        console.warn('[web]', message)
        // Never black, never desktop: the open pages move to the built-in browser.
        chromeActive = false
        broadcast(Broadcast.webChromeStatus, webChrome.status())
        void webHost?.switchBackend(electronWebBackend())
      },
      onNote: (message) => {
        webNote = message
        console.warn('[web]', message)
      },
      ...(webDevUrl ? { devUrl: webDevUrl } : {})
    }),
    (s) => broadcast(Broadcast.webNavState, s)
  )
  webHost = host
  web = host
  isWebPage = (wc) => host.owns(wc)
  // Web page sound: the deck on air reads the helper's pipe (web-bridge) through the same
  // output gain as PowerPoint; only that page is left unmuted on this PC, and Black/KV
  // silence it (which also silences the pipe, as the picture is covered).
  const syncWebSound = (): void => {
    const s = state.state
    const live = s.shown?.web?.deckId ?? null
    slideShow.sound.setWebPipe(live ? host.audioPipe(live) : null)
    for (const { deckId } of host.statuses()) {
      host.setMuted(deckId, !(deckId === live && !s.black && !kvOnAir(s)))
    }
  }
  host.onAudioChanged = syncWebSound
  state.onChange(syncWebSound)
  syncWebSound()
  // Pages follow the open event's web decks; the one on air stays until it leaves air.
  const syncWeb = (): void => {
    try {
      const onAir = state.state.shown?.web?.deckId ?? null
      host.syncEvent(state.decks(), onAir)
      // Interact ends with the deck on air and with the event it was turned on in.
      host.syncInteract(state.eventId, onAir)
    } catch (err) {
      console.error('[web] pages could not follow the deck list:', err)
    }
  }
  let canvasSize = `${state.state.canvas.width}x${state.state.canvas.height}`
  state.onChange((s) => {
    syncWeb()
    const size = `${s.canvas.width}x${s.canvas.height}`
    if (size !== canvasSize) {
      canvasSize = size
      host.resize()
    }
  })
  if (process.env['PPT_OUTPUT_DUMP']) {
    Object.defineProperty(globalThis, '__pptWeb', { configurable: true, get: () => host.debug() })
    // e2e with FakeWebEngine: no real capture exists, so the test reports the first frame.
    Object.defineProperty(globalThis, '__pptWebFrame', {
      configurable: true,
      value: (deckId: string) => host.frameSeen(deckId)
    })
  }
  // Auto-update: only packaged Windows, Linux AppImage and Linux .deb builds (or the fake test
  // engine) ever check or
  // download. A failed check is silent; a newer version downloads by itself while nothing is on
  // air and installs when the app quits with nothing on air (or when the operator restarts).
  const updatesEnabled =
    process.env['PPT_UPDATE_FAKE'] === '1' ||
    canSelfUpdate({
      packaged: app.isPackaged,
      platform: process.platform,
      env: process.env,
      packageType: readPackageType()
    })
  const updateManager = updatesEnabled
    ? new UpdateManager({
        engine:
          process.env['PPT_UPDATE_FAKE'] === '1' ? createFakeEngine() : createElectronEngine(),
        currentVersion: app.getVersion(),
        getSkipped: () => settings.get().updates.skippedVersion,
        setSkipped: (version) => settings.saveUpdates({ skippedVersion: version }),
        isOnAir: () => !canInstallNow(state.state),
        onStatus: (s) => broadcastToOperator(Broadcast.updateStatus, s)
      })
    : null
  // Check 15 s after the operator window first shows, then every 6 hours. The delay starts at
  // ready-to-show, not at app start, so a slow window cannot consume the operator's grace period.
  // A version found during a show starts downloading as soon as the Program goes off air.
  if (updateManager) state.onChange(() => updateManager.autoDownload())
  let updateCheckTimer: ReturnType<typeof setInterval> | null = null
  let updateCheckFirstTimer: ReturnType<typeof setTimeout> | null = null
  let updateCheckScheduled = false
  const scheduleUpdateCheck = (): void => {
    if (!updateManager || updateCheckScheduled) return
    updateCheckScheduled = true
    const check = (): void => {
      updateManager.check().catch((err) => console.warn('[update] check failed:', err))
    }
    updateCheckFirstTimer = setTimeout(() => {
      updateCheckFirstTimer = null
      check()
      updateCheckTimer = setInterval(check, 6 * 60 * 60 * 1000)
    }, 15_000)
  }
  // Quit waits (briefly) for the OMT worker to stop its sender before it is terminated.
  let omtDone = false
  let omtStopping = false
  app.on('before-quit', (e) => {
    // A downloaded update installs on the way out, unless something is still on air.
    updateManager?.prepareQuit()
    if (updateCheckTimer) clearInterval(updateCheckTimer)
    if (updateCheckFirstTimer) clearTimeout(updateCheckFirstTimer)
    updateCheckTimer = null
    updateCheckFirstTimer = null
    hdmi.shutdown()
    host.shutdown()
    slideShow.manager.dispose()
    slideShow.sound.dispose()
    if (omtDone) return
    e.preventDefault()
    if (!omtStopping) {
      omtStopping = true
      // Hard cap: a blocked native call in the worker must never keep the app from quitting.
      const cap = new Promise<void>((r) => setTimeout(r, OMT_QUIT_CAP_MS))
      const engineDone = slideShow.stop().catch(() => {})
      void Promise.race([Promise.all([net.shutdown(), engineDone]), cap]).finally(() => {
        omtDone = true
        app.quit()
      })
    }
  })
  registerSlideProtocol(root, lib)
  registerIpc(
    lib,
    state,
    settings,
    hdmi,
    net,
    host,
    slideShow,
    syncWeb,
    () => operator,
    updateManager,
    webChrome
  )

  // Settings > Clicker in the background: the clicker keys (PageDown/PageUp or Right/Left) run
  // Next/Prev while no Bridgecast window has focus. The press goes to the operator window, which applies its usual key guards.
  const clicker = new BackgroundClicker(
    {
      register: (accel, cb) => globalShortcut.register(accel, cb),
      unregister: (accel) => globalShortcut.unregister(accel)
    },
    (d) => broadcastToOperator(Broadcast.clickerPress, d)
  )
  clicker.setKeys(settings.get().clickerKeys)
  clicker.setEnabled(settings.get().clickerBackground)
  clicker.setAppFocused(BrowserWindow.getFocusedWindow() !== null)
  app.on('browser-window-focus', () => clicker.setAppFocused(true))
  // Deferred: moving focus between two Bridgecast windows fires blur before focus.
  app.on('browser-window-blur', () =>
    setImmediate(() => clicker.setAppFocused(BrowserWindow.getFocusedWindow() !== null))
  )
  app.on('will-quit', () => clicker.dispose())
  handle(Invoke.clickerSetBackground, (on) => {
    if (typeof on !== 'boolean') throw new Error('Clicker setting must be on or off')
    const saved = settings.saveClickerBackground(on)
    clicker.setEnabled(on)
    return saved
  })
  handle(Invoke.clickerSetKeys, (keys) => {
    if (keys !== 'page' && keys !== 'arrows')
      throw new Error('Choose PageDown/PageUp or the arrow keys')
    const saved = settings.saveClickerKeys(keys)
    clicker.setKeys(keys)
    return saved
  })

  const startOutputs = (): void => {
    hdmi.start()
    net.start()
    syncWeb()
  }
  const onOperatorShown = (): void => {
    startOutputs()
    scheduleUpdateCheck()
  }
  operator = createWindow(onOperatorShown)
  operatorWindowRef = () => operator
  hdmi.watchOperator(operator)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      operator = createWindow(onOperatorShown)
      operatorWindowRef = () => operator
      hdmi.watchOperator(operator)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
