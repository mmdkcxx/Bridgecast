import { useEffect, useRef, useState } from 'react'
import type { OutputAudio } from '../output-audio'
import { openStream, type StreamSourceKind } from '../stream'
import { StreamCapture, type CaptureView } from '../stream-capture'
import { cropStyle, type CropRect } from '../../../shared/crop'

export interface StreamLayerProps {
  /** What is captured: `tab` = a web deck's page, `desktop` = a native deck's slide show window. */
  source: StreamSourceKind
  /** The captured thing's id (the deck id for both). */
  id: string
  /** Shown when capture fails or ends (the deck's snapshot, or the slide's PNG); never black. */
  poster: string
  /** Hold the last frame (Freeze, HOLD): the <video> is paused, not removed. */
  paused: boolean
  canvas: { width: number; height: number }
  fps: number
  /** Output windows: the stream's sound goes through this gain (captured with audio). */
  audio?: OutputAudio
  muted: boolean
  /** A new value captures again with a new source id (page back from a crash or an error). */
  generation?: number
  /** The layer can go on screen: its first frame is presented, or its poster after a failure. */
  onReady(): void
  /** Each new capture's first frame (the ready gate report). */
  onFrame?(): void
  /** A capture track ended (HOLD trigger while the page is on air). */
  onEnded?(): void
  /** The capture failed or ended and the poster shows (true), or it works again (false). */
  onFailed?(failed: boolean): void
  /** The visible stream was paused (HOLD, Freeze): main may now navigate the page. */
  onPaused?(): void
  /** Accessible name (the operator monitor); outputs have none. */
  label?: string
}

/**
 * A live capture in a slide layer (see StreamCapture): reveals on its first
 * frame, pauses for Freeze and HOLD and then shows the still of the last good
 * frame (also when the track ends; the poster only when no frame ever came),
 * captures again on a new `generation`, stops its tracks on unmount.
 */
export function StreamLayer(props: StreamLayerProps): React.JSX.Element {
  const { source, id, poster, paused, audio, muted, generation = 0, label } = props
  const [view, setView] = useState<CaptureView>({
    entries: [],
    shownKey: null,
    poster: false,
    still: false
  })
  const stillRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })
  const [cap, setCap] = useState<StreamCapture | null>(null)
  const attached = useRef<MediaStream | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)

  useEffect(() => {
    if (source !== 'desktop') {
      setCrop(null)
      return
    }
    let live = true
    window.api
      .slideshowCrop(id)
      .then((r) => {
        if (live) setCrop(r)
      })
      .catch(() => {
        if (live) setCrop(null)
      })
    return () => {
      live = false
    }
  }, [source, id, generation])

  const cropped = cropStyle(crop)
  const mediaStyle: React.CSSProperties | undefined = cropped
    ? { ...cropped, objectFit: 'fill' }
    : undefined

  useEffect(() => {
    const p = (): StreamLayerProps => latest.current
    const c = new StreamCapture({
      open: () => openStream(source, id, p().canvas, p().fps, !!p().audio),
      paused: () => p().paused,
      sound: (stream) => {
        const a = p().audio
        // Sound goes through OutputAudio only when the capture carries it: a web-bridge
        // (WebView2) page and a slide show window are captured video-only, their sound
        // arrives through the PCM pipe instead.
        const want = a && !p().muted && stream && stream.getAudioTracks().length > 0 ? stream : null
        if (attached.current === want) return
        if (attached.current) a?.detachStream(attached.current)
        attached.current = want && a?.attachStream(want) ? want : null
      },
      // A web page keeps its last frame when it ends (HOLD); a slide show shows the slide's PNG.
      holdOnEnd: source === 'tab',
      onView: setView,
      onReady: () => p().onReady(),
      onFrame: () => p().onFrame?.(),
      onEnded: () => p().onEnded?.(),
      onFailed: (f) => p().onFailed?.(f),
      onPaused: () => p().onPaused?.()
    })
    c.bindStill(stillRef.current)
    setCap(c)
    c.start()
    return () => {
      c.dispose()
      if (attached.current) latest.current.audio?.detachStream(attached.current)
      attached.current = null
    }
  }, [source, id])

  const firstGen = useRef(generation)
  useEffect(() => {
    if (generation === firstGen.current) return
    firstGen.current = generation
    cap?.capture()
  }, [generation, cap])

  useEffect(() => {
    cap?.setPaused(paused)
  }, [paused, cap])

  useEffect(() => {
    cap?.syncSound()
  }, [audio, muted, cap])

  return (
    <div
      className="stream-layer"
      data-source={source}
      data-paused={String(paused)}
      data-poster={view.poster ? 'true' : undefined}
      data-still={view.still ? 'true' : undefined}
      style={cropped ? { overflow: 'hidden' } : undefined}
      data-crop={cropped ? 'true' : undefined}
      {...(label ? { role: 'img', 'aria-label': label } : {})}
    >
      {view.entries.map((e) => (
        <video
          key={e.key}
          ref={(v) => {
            if (v) cap?.bind(e.key, v)
          }}
          // Sound only through OutputAudio (a captured page never plays locally).
          muted
          playsInline
          style={mediaStyle}
          data-incoming={e.key === view.shownKey ? undefined : 'true'}
        />
      ))}
      {/* One canvas per layer: the last good frame, above the paused or ended <video>. */}
      <canvas
        ref={stillRef}
        className="stream-still"
        style={mediaStyle}
        data-shown={view.still ? '' : undefined}
      />
      {view.poster && <img src={poster} alt="" draggable={false} />}
    </div>
  )
}
