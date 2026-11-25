import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  Broadcast,
  OMT_AUDIO_PORT,
  SLIDESHOW_AUDIO_PORT,
  Invoke,
  Send,
  type Api,
  type BroadcastMap,
  type InvokeChannel,
  type InvokeMap
} from '../shared/ipc'

function invoke<C extends InvokeChannel>(
  channel: C,
  ...args: InvokeMap[C]['args']
): Promise<InvokeMap[C]['result']> {
  return ipcRenderer.invoke(channel, ...args)
}

function subscribe<C extends keyof BroadcastMap>(
  channel: C,
  cb: (payload: BroadcastMap[C]) => void
): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: BroadcastMap[C]): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

// OMT audio port contract: a MessagePort cannot cross contextBridge, so main's
// port is forwarded to the page as window.postMessage('omt:audio-port', '*', ports).
// The output renderer listens for 'message' events with data === 'omt:audio-port',
// takes e.ports[0], and calls api.requestOmtAudioPort() on mount (main also posts
// one after did-finish-load). The listener is registered at preload load time so
// no port is missed.
ipcRenderer.on(OMT_AUDIO_PORT, (e) => {
  window.postMessage('omt:audio-port', '*', [...e.ports])
})

// PowerPoint sound port: same contract as the OMT one, for the HDMI and OMT output windows.
ipcRenderer.on(SLIDESHOW_AUDIO_PORT, (e) => {
  window.postMessage('slideshow:audio-port', '*', [...e.ports])
})

const api: Api = {
  listEvents: () => invoke(Invoke.eventsList),
  createEvent: (name, options) => invoke(Invoke.eventsCreate, name, options),
  selectEvent: (eventId) => invoke(Invoke.eventsSelect, eventId),
  eventSummaries: () => invoke(Invoke.eventsSummaries),
  setEventArchived: (eventId, archived) => invoke(Invoke.eventsSetArchived, eventId, archived),
  listDecks: (eventId) => invoke(Invoke.decksList, eventId),
  importDecks: (eventId, files) => invoke(Invoke.decksImport, eventId, files),
  addRendered: (eventId, payload) => invoke(Invoke.decksAddRendered, eventId, payload),
  convertPptx: (file) => invoke(Invoke.decksConvertPptx, file),
  reorderDecks: (eventId, items) => invoke(Invoke.decksReorder, eventId, items),
  addSection: (eventId, at) => invoke(Invoke.sectionsAdd, eventId, at),
  renameSection: (eventId, sectionId, name) =>
    invoke(Invoke.sectionsRename, eventId, sectionId, name),
  removeSection: (eventId, sectionId) => invoke(Invoke.sectionsRemove, eventId, sectionId),
  reorderSlides: (deckId, order) => invoke(Invoke.slidesReorder, deckId, order),
  removeDeck: (eventId, deckId) => invoke(Invoke.decksRemove, eventId, deckId),
  orphanDecks: () => invoke(Invoke.decksOrphans),
  restoreDeck: (deckId, eventId) => invoke(Invoke.decksRestore, deckId, eventId),
  renameDeck: (eventId, deckId, name) => invoke(Invoke.decksRename, eventId, deckId, name),
  setDeckFit: (eventId, deckId, fit) => invoke(Invoke.decksSetFit, eventId, deckId, fit),
  setDeckAudio: (eventId, deckId, audio) => invoke(Invoke.decksSetAudio, eventId, deckId, audio),
  setEventCanvas: (eventId, canvas) => invoke(Invoke.eventsSetCanvas, eventId, canvas),
  setDefaultCanvas: (canvas) => invoke(Invoke.canvasSetDefault, canvas),
  setImportFormat: (format) => invoke(Invoke.importSetFormat, format),
  setKv: (eventId, path) => invoke(Invoke.kvSet, eventId, path),
  clearKv: (eventId) => invoke(Invoke.kvClear, eventId),
  dispatch: (action) => invoke(Invoke.programDispatch, action),
  getSession: () => invoke(Invoke.programGet),
  onProgramState: (cb) => subscribe(Broadcast.programState, cb),
  onImportProgress: (cb) => subscribe(Broadcast.importProgress, cb),
  getSettings: () => invoke(Invoke.settingsGet),
  setClickerBackground: (on) => invoke(Invoke.clickerSetBackground, on),
  getAppVersion: () => invoke(Invoke.appVersion),
  listDisplays: () => invoke(Invoke.displaysList),
  onDisplaysChanged: (cb) => subscribe(Broadcast.displaysChanged, cb),
  setHdmi: (h) => invoke(Invoke.hdmiSet, h),
  getHdmiStatus: () => invoke(Invoke.hdmiGetStatus),
  onHdmiStatus: (cb) => subscribe(Broadcast.hdmiStatus, cb),
  setAudio: (a) => invoke(Invoke.audioSet, a),
  patchAudio: (patch) => invoke(Invoke.audioPatch, patch),
  onAudioSettings: (cb) => subscribe(Broadcast.audioSettings, cb),
  onOutputSettings: (cb) => subscribe(Broadcast.outputSettings, cb),
  outputReady: () => ipcRenderer.send(Send.outputReady),
  setOmt: (o) => invoke(Invoke.omtSet, o),
  getOmtStatus: () => invoke(Invoke.omtGetStatus),
  onOmtStatus: (cb) => subscribe(Broadcast.omtStatus, cb),
  setNdi: (n) => invoke(Invoke.ndiSet, n),
  getNdiStatus: () => invoke(Invoke.ndiGetStatus),
  onNdiStatus: (cb) => subscribe(Broadcast.ndiStatus, cb),
  setNetworkFps: (fps) => invoke(Invoke.networkSetFps, fps),
  setNetworkContentOnly: (on) => invoke(Invoke.networkSetContentOnly, on),
  requestOmtAudioPort: () => ipcRenderer.send(Send.omtAudioPortRequest),
  reportOmtWarning: (w) => ipcRenderer.send(Send.omtAudioWarning, w),
  addWebDeck: (eventId, url, name) =>
    name === undefined
      ? invoke(Invoke.webAdd, eventId, url)
      : invoke(Invoke.webAdd, eventId, url, name),
  setWebUrl: (deckId, url) => invoke(Invoke.webSetUrl, deckId, url),
  reloadWeb: (deckId) => invoke(Invoke.webReload, deckId),
  navWeb: (deckId, dir) => invoke(Invoke.webNav, deckId, dir),
  stopWeb: (deckId) => invoke(Invoke.webStop, deckId),
  homeWeb: (deckId) => invoke(Invoke.webHome, deckId),
  setWebZoom: (deckId, zoom) => invoke(Invoke.webSetZoom, deckId, zoom),
  webNavStates: () => invoke(Invoke.webNavStates),
  onWebNavState: (cb) => subscribe(Broadcast.webNavState, cb),
  webInput: (deckId, input) => invoke(Invoke.webInput, deckId, input),
  setWebInteract: (deckId, on) => invoke(Invoke.webSetInteract, deckId, on),
  webSourceId: (deckId) => invoke(Invoke.webSourceId, deckId),
  webFrame: (deckId) => invoke(Invoke.webFrame, deckId),
  webEnded: (deckId) => invoke(Invoke.webEnded, deckId),
  webHeld: (deckId) => invoke(Invoke.webHeld, deckId),
  openPrepare: (deckId) => invoke(Invoke.webOpenPrepare, deckId),
  signOutWeb: () => invoke(Invoke.webSignOut),
  webChromeStatus: () => invoke(Invoke.webChromeStatus),
  setWebChrome: (on) => invoke(Invoke.webChromeSet, on),
  signInGoogle: () => invoke(Invoke.webChromeSignIn),
  onWebChromeStatus: (cb) => subscribe(Broadcast.webChromeStatus, cb),
  webStatuses: () => invoke(Invoke.webStatuses),
  onWebStatus: (cb) => subscribe(Broadcast.webStatus, cb),
  webOutputs: () => invoke(Invoke.webOutputs),
  onWebOutputs: (cb) => subscribe(Broadcast.webOutputs, cb),
  webCaptureFailed: (deckId, failed) => invoke(Invoke.webCaptureFailed, deckId, failed),
  webCaptureWarnings: () => invoke(Invoke.webCaptureWarnings),
  onWebCaptureWarnings: (cb) => subscribe(Broadcast.webCaptureWarnings, cb),
  slideshowSourceId: (deckId) => invoke(Invoke.slideshowSourceId, deckId),
  requestSlideshowAudioPort: () => ipcRenderer.send(Send.slideshowAudioPortRequest),
  slideshowNote: () => invoke(Invoke.slideshowNote),
  onSlideshowNote: (cb) => subscribe(Broadcast.slideshowNote, cb),
  slideshowStatus: () => invoke(Invoke.slideshowStatus),
  onSlideshowStatus: (cb) => subscribe(Broadcast.slideshowStatus, cb),
  editDeck: (deckId, confirmed) =>
    confirmed === undefined
      ? invoke(Invoke.deckEdit, deckId)
      : invoke(Invoke.deckEdit, deckId, confirmed),
  editDeckDone: (deckId) => invoke(Invoke.deckEditDone, deckId),
  applyDeckNow: (deckId) => invoke(Invoke.deckApplyNow, deckId),
  revertDeck: (deckId) => invoke(Invoke.deckRevert, deckId),
  isDeckEdited: (deckId) => invoke(Invoke.deckIsEdited, deckId),
  setDeckPlayback: (eventId, deckId, playback) =>
    invoke(Invoke.deckSetPlayback, eventId, deckId, playback),
  onDeckPending: (cb) => subscribe(Broadcast.deckPending, cb),
  onDeckEditError: (cb) => subscribe(Broadcast.deckEditError, cb),
  getUpdateStatus: () => invoke(Invoke.updateStatus),
  checkForUpdate: () => invoke(Invoke.updateCheck),
  downloadUpdate: () => invoke(Invoke.updateDownload),
  installUpdate: () => invoke(Invoke.updateInstall),
  skipUpdate: () => invoke(Invoke.updateSkip),
  onUpdateStatus: (cb) => subscribe(Broadcast.updateStatus, cb),
  onClickerPress: (cb) => subscribe(Broadcast.clickerPress, cb),
  // File.path no longer exists in Electron; this is the supported replacement.
  pathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
