import type { Canvas } from '../../shared/canvas'
import type { CropRect } from '../../shared/crop'

/** Where the slideshow is: slide index, animation step inside it, and the slide's click count. */
export interface EnginePosition {
  deckId: string
  index: number
  step: number
  clicks: number
}

export interface EngineError {
  deckId?: string
  message: string
}

/** One open slideshow of one deck, in its own window. */
export interface EngineSession {
  deckId: string
  windowId: string
  /** macOS: the slide inside the captured window (the capture includes the title bar); absent = whole window. */
  crop?: CropRect
  next(): Promise<void>
  prev(): Promise<void>
  goto(index: number): Promise<void>
  close(): Promise<void>
}

export interface SlideShowEngine {
  open(deckId: string, file: string, canvas: Canvas): Promise<EngineSession>
  on(ev: 'position', cb: (p: EnginePosition) => void): void
  on(ev: 'error', cb: (e: EngineError) => void): void
  on(ev: 'exited', cb: () => void): void
  /** Liveness check for the manager's heartbeat; never replies when the engine hangs. */
  ping(): Promise<void>
  /** Opens the deck's working copy in a normal (editing) window of the presentation program. */
  edit(file: string): Promise<void>
  /** Close everything and stop the engine process; a later `open` starts it again. */
  shutdown(): Promise<void>
}
