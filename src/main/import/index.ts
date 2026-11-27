import type { EngineInfo } from '../platform'
import type { PptImportFormat } from '../../shared/settings'
import type { LibreOfficeImportOptions } from './libreoffice'
import type { importPptxPowerPoint } from './pptx'
import type { ImportedDeck } from './types'

export type { ImportedDeck } from './types'

/** What the import needs to know about this computer (set once at start, injectable in tests). */
export interface ImportEnv {
  engine: Pick<EngineInfo, 'engine' | 'message'>
  /** Linux: what to do with the imported PowerPoint file (the saved setting). */
  format: () => PptImportFormat
  powerPoint: typeof importPptxPowerPoint
  /** The LibreOffice import with its bridge already bound. */
  libreOffice: (
    file: string,
    outDir: string,
    width: number,
    opts: LibreOfficeImportOptions
  ) => Promise<ImportedDeck & { warning?: string }>
}

let env: ImportEnv | null = null

/** Called once at start (before the first import) with the detected engine and importers. */
export function configureImport(e: ImportEnv): void {
  env = e
}

/** The engine configured at start ('none' before configureImport). */
export function importEngine(): EngineInfo['engine'] {
  return env?.engine.engine ?? 'none'
}

interface ImportOptions {
  /** Test seam: the environment to use instead of the configured one. */
  env?: ImportEnv
  /**
   * Keep the file's own format: no conversion to .odp. Used for the re-export of an edit
   * (`edit.*`), which must stay what the operator saved; a fresh import and Revert convert.
   */
  keepFormat?: boolean
}

/**
 * Imports a PPT/PPTX with the program of this platform: PowerPoint on Windows, LibreOffice on
 * Linux. Both give the same deck shape (PNGs, `source.pdf`, notes, clicks, hidden, static). With
 * no engine the install message is thrown, so the import row reports it.
 */
export async function importPptx(
  file: string,
  outDir: string,
  width: number,
  opts: ImportOptions = {}
): Promise<ImportedDeck & { warning?: string }> {
  const e = opts.env ?? env
  if (!e) throw new Error('The import is not ready yet. Try again in a moment.')
  if (e.engine.engine === 'powerpoint') return e.powerPoint(file, outDir, width)
  if (e.engine.engine === 'libreoffice') {
    return e.libreOffice(file, outDir, width, {
      format: opts.keepFormat ? 'original' : e.format()
    })
  }
  throw new Error(e.engine.message ?? 'PowerPoint files cannot be imported on this computer.')
}
