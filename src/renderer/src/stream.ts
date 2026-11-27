import type { WebStatus } from '../../shared/web'

/**
 * What a stream layer captures: `tab` (a web deck's hidden page) or `desktop`
 * (a native deck's PowerPoint slide show window, never a screen).
 */
export type StreamSourceKind = 'tab' | 'desktop'

const MAX_SIDE = 7680
const clampInt = (n: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback

/**
 * getUserMedia constraints for a web deck page (`webContents.getMediaSourceId`,
 * `chromeMediaSource: 'tab'`; shape verified in the spike). Video is capped at the
 * canvas and `fps`; audio, when asked, names the same source; without it the
 * `audio` key is left out (video only).
 */
export function tabConstraints(
  sourceId: string,
  canvas: { width: number; height: number },
  fps: number,
  audio: boolean
): MediaStreamConstraints {
  const video = {
    mandatory: {
      chromeMediaSource: 'tab',
      chromeMediaSourceId: sourceId,
      maxWidth: clampInt(canvas.width, 1, MAX_SIDE, 1920),
      maxHeight: clampInt(canvas.height, 1, MAX_SIDE, 1080),
      maxFrameRate: clampInt(fps, 1, 60, 30)
    }
  }
  // `mandatory` is Chromium's legacy constraint form; lib.dom does not type it.
  const c: Record<string, unknown> = { video }
  if (audio) c.audio = { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: sourceId } }
  return c as MediaStreamConstraints
}

/**
 * getUserMedia constraints for a native deck's slide show window (a source id from
 * `slideshow:sourceId`, `chromeMediaSource: 'desktop'`). Video only: the sound comes
 * from the bridge's audio pipe. Capped at the canvas and `fps` like the tab capture.
 */
export function desktopConstraints(
  sourceId: string,
  canvas: { width: number; height: number },
  fps: number
): MediaStreamConstraints {
  const video = {
    mandatory: {
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: sourceId,
      maxWidth: clampInt(canvas.width, 1, MAX_SIDE, 1920),
      maxHeight: clampInt(canvas.height, 1, MAX_SIDE, 1080),
      maxFrameRate: clampInt(fps, 1, 60, 30),
      // No mouse pointer in the picture (Chromium ignores it where it does not know it;
      // Windows capture on this build does not add one, older ones do).
      cursor: 'never'
    }
  }
  return { video } as MediaStreamConstraints
}

/**
 * macOS: the slide show window is captured with getDisplayMedia, where `cursor: 'never'`
 * keeps the mouse pointer out of the picture (the desktop getUserMedia path draws it).
 */
export function usesDisplayMedia(userAgent: string): boolean {
  return /Macintosh|Mac OS X/.test(userAgent)
}

/** getDisplayMedia options for a slide show window: video only, capped like desktopConstraints, no pointer. */
export function displayMediaOptions(
  canvas: { width: number; height: number },
  fps: number
): DisplayMediaStreamOptions {
  return {
    video: {
      width: { max: clampInt(canvas.width, 1, MAX_SIDE, 1920) },
      height: { max: clampInt(canvas.height, 1, MAX_SIDE, 1080) },
      frameRate: { max: clampInt(fps, 1, 60, 30) },
      // `cursor` is not in the DOM typings yet.
      cursor: 'never'
    },
    audio: false
  } as DisplayMediaStreamOptions
}

/**
 * Frame rate of every video-only page capture: the operator monitor, the Prepare
 * preview and the ready-gate pre-capture. Chromium runs ONE capture per page for all
 * video-only requests (same device id `web-contents-media-stream://<p>:<f>`, across
 * windows) in the format of the request that opened it; later requests only get its
 * frames. So they must all ask for the same size and rate. Outputs capture with sound
 * (device id `...?local_echo=false`) and so have a capture of their own.
 */
export const VIDEO_ONLY_FPS = 30

/**
 * The ready-gate pre-capture's format: the Canvas at VIDEO_ONLY_FPS, the same as the
 * monitor and Prepare. A smaller or slower one (it used to be 320x180 at 5 fps) left
 * every video-only capture that joined while it ran at that size and rate.
 */
export function precaptureFormat(canvas: { width: number; height: number }): {
  canvas: { width: number; height: number }
  fps: number
} {
  return { canvas: { width: canvas.width, height: canvas.height }, fps: VIDEO_ONLY_FPS }
}

/** Output capture frame rate: the network fps while OMT or NDI runs, else 30 (spec 3). */
export function streamFps(networkFps: number | undefined, networkRunning: boolean): number {
  return networkRunning && networkFps === 60 ? 60 : 30
}

/** Which app windows main treats as putting a page on air (mirrors main's `frameSenderAllowed`). */
export interface OutputsActive {
  hdmi: boolean
  omt: boolean
}

/**
 * True when this window's first-frame reports open the ready gate, so it must
 * capture pages that are not live yet: an output window while it is active, the
 * operator window only while no output is active. Unknown (null) = no output.
 */
export function capturesForGate(
  role: 'hdmi' | 'omt' | 'operator',
  outputs: OutputsActive | null
): boolean {
  const o = outputs ?? { hdmi: false, omt: false }
  if (role === 'hdmi') return o.hdmi
  if (role === 'omt') return o.omt
  return !o.hdmi && !o.omt
}

/**
 * The pages to capture off screen for the ready gate: every open page still
 * `loading` (a ready page has had its frame; an error waits for Reload), except
 * the one this window already shows as a stream (that layer reports its own frame).
 */
export function precaptureIds(
  statuses: Readonly<Record<string, WebStatus>>,
  streaming: string | null
): string[] {
  return Object.keys(statuses)
    .filter((id) => statuses[id] === 'loading' && id !== streaming)
    .sort()
}

/**
 * A page that comes back from an error (renderer crash reloaded, or Reload after
 * a failed load) is captured again with a new source id, so its frame is reported
 * again (main resets the frame after a crash).
 */
export function recaptureNeeded(prev: WebStatus | undefined, next: WebStatus): boolean {
  return prev === 'error' && next !== 'error'
}

/** `url?v=<n>`: main rewrites a web deck's snapshot under the same name, so a new version reloads it. */
export function posterWithVersion(url: string, version: number): string {
  return version > 0 ? `${url}?v=${version}` : url
}

/**
 * getUserMedia constraints for a web deck's page (`webSourceId`). Main decides how the
 * page is hosted: Electron's tab capture (video + sound) or a web-bridge helper window
 * (`chromeMediaSource: 'desktop'`, video only: its sound comes through the PCM pipe).
 */
export async function openWebStream(
  id: string,
  canvas: { width: number; height: number },
  fps: number,
  audio: boolean
): Promise<MediaStream> {
  const source = await window.api.webSourceId(id)
  return navigator.mediaDevices.getUserMedia(
    source.kind === 'desktop'
      ? desktopConstraints(source.id, canvas, fps)
      : tabConstraints(source.id, canvas, fps, audio)
  )
}

/** Requests a fresh capture id (valid ~10 s) and opens the stream. */
export async function openStream(
  source: StreamSourceKind,
  id: string,
  canvas: { width: number; height: number },
  fps: number,
  audio: boolean
): Promise<MediaStream> {
  switch (source) {
    case 'tab':
      return openWebStream(id, canvas, fps, audio)
    case 'desktop': {
      // Video only: PowerPoint's sound arrives through the audio pipe, not the capture.
      const sourceId = await window.api.slideshowSourceId(id)
      if (usesDisplayMedia(navigator.userAgent)) {
        // Main answers this request with the window it just looked up for this renderer.
        try {
          return await navigator.mediaDevices.getDisplayMedia(displayMediaOptions(canvas, fps))
        } catch (e) {
          console.warn('[slideshow] getDisplayMedia failed, using desktop capture:', e)
          const again = await window.api.slideshowSourceId(id)
          return navigator.mediaDevices.getUserMedia(desktopConstraints(again, canvas, fps))
        }
      }
      return navigator.mediaDevices.getUserMedia(desktopConstraints(sourceId, canvas, fps))
    }
  }
}

/**
 * Plays `stream` in `v` and resolves on its first frame. The callback is
 * registered BEFORE play(): a still page sends a single frame when capture starts.
 */
export function playFirstFrame(v: HTMLVideoElement, stream: MediaStream): Promise<void> {
  return new Promise((resolve, reject) => {
    v.srcObject = stream
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => resolve())
    else v.addEventListener('loadeddata', () => resolve(), { once: true })
    v.play().catch(reject)
  })
}

/** Stops every track of a stream (the page stops painting when nothing captures it). */
export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop())
}
