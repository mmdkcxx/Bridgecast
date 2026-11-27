import { pdfSourceFields } from './pdf-source'
import type { EngineKind } from '../../shared/playback'

/** Library fields for a deck the renderer drew (PDF pages or images). */
export interface RenderedFields {
  source: 'pptx' | 'pdf' | 'image'
  sourcePath?: string
  originalPath?: string
  pdfPath?: string
  playback?: 'native' | 'vector'
}

/**
 * macOS with PowerPoint for Mac: a converted PowerPoint file is stored like a Windows PowerPoint
 * deck (source.<ext> = the PowerPoint file, source.pdf = its PDF, playback native); otherwise the
 * PDF plays as vector and the PowerPoint file is kept as original.
 */
export function renderedDeckFields(opts: {
  source: 'pdf' | 'image'
  sourcePath: unknown
  original?: string
  engine: EngineKind
}): RenderedFields {
  if (opts.source === 'image') return { source: 'image' }
  const pdf = pdfSourceFields(opts.sourcePath)
  if (opts.original && opts.engine === 'powerpoint') {
    return {
      source: 'pptx',
      sourcePath: opts.original,
      ...('sourcePath' in pdf ? { pdfPath: pdf.sourcePath } : {}),
      playback: 'native'
    }
  }
  return {
    source: 'pdf',
    ...pdf,
    ...(opts.original ? { originalPath: opts.original } : {})
  }
}
