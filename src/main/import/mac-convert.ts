import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import path from 'node:path'

export const NO_MAC_CONVERTER =
  'Install Microsoft PowerPoint, Keynote (free from the App Store) or LibreOffice to import PowerPoint files, or export the file to PDF and import the PDF.'
export const KEYNOTE_DENIED =
  'Bridgecast is not allowed to control Keynote. Allow it in System Settings > Privacy & Security > Automation, then import again.'
export const POWERPOINT_DENIED =
  'Bridgecast is not allowed to control Microsoft PowerPoint. Allow it in System Settings > Privacy & Security > Automation, then import again.'
export const CONVERT_FAILED =
  'The PowerPoint file could not be converted to PDF. Export it to PDF from PowerPoint or Keynote and import the PDF.'

export const POWERPOINT_APP = '/Applications/Microsoft PowerPoint.app'
export const KEYNOTE_APP = '/Applications/Keynote.app'
export const SOFFICE_PATHS = [
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/opt/homebrew/bin/soffice',
  '/usr/local/bin/soffice'
]
export const CONVERT_TIMEOUT_MS = 180_000

/**
 * Microsoft PowerPoint exports the PDF itself, so fonts, layout and effects match what the speaker
 * made. Paths come in as argv, never spliced into the script. `save ... in` takes an HFS path
 * string. Only the presentation this script opened is closed, and PowerPoint quits only if it
 * was not running before. PowerPoint is sandboxed: it may ask once to grant access to the folder.
 */
export const POWERPOINT_SCRIPT = `on run argv
  set inFile to POSIX file (item 1 of argv)
  set outPath to (POSIX file (item 2 of argv)) as text
  set wasRunning to application "Microsoft PowerPoint" is running
  tell application "Microsoft PowerPoint"
    open inFile
    set theDoc to active presentation
    try
      save theDoc in outPath as save as PDF
    on error errMsg number errNum
      close theDoc saving no
      if not wasRunning then quit
      error errMsg number errNum
    end try
    close theDoc saving no
    if not wasRunning then quit
  end tell
end run`

export const powerpointArgs = (file: string, outPdf: string): string[] => [
  '-e',
  POWERPOINT_SCRIPT,
  file,
  outPdf
]

/** Paths come in as argv (`on run argv`), never spliced into the script. */
export const KEYNOTE_SCRIPT = `on run argv
  set inFile to POSIX file (item 1 of argv)
  set outFile to POSIX file (item 2 of argv)
  set wasRunning to application "Keynote" is running
  tell application "Keynote"
    set theDoc to open inFile
    try
      export theDoc to outFile as PDF
    on error errMsg number errNum
      close theDoc saving no
      if not wasRunning then quit
      error errMsg number errNum
    end try
    close theDoc saving no
    if not wasRunning then quit
  end tell
end run`

export const keynoteArgs = (file: string, outPdf: string): string[] => [
  '-e',
  KEYNOTE_SCRIPT,
  file,
  outPdf
]

export const sofficeArgs = (file: string, outDir: string): string[] => [
  '--headless',
  '--convert-to',
  'pdf',
  '--outdir',
  outDir,
  file
]

/** osascript error -1743: the user refused (or never allowed) Apple events to Keynote. */
export const isAutomationDenied = (err: unknown): boolean =>
  /-1743|not authorized to send apple events/i.test(String((err as Error)?.message ?? err))

export interface MacConvertDeps {
  exists(p: string): boolean
  /** Runs a program; rejects with its stderr as the message (also on timeout). */
  run(cmd: string, args: string[], timeoutMs: number): Promise<void>
}

export const macConvertDeps: MacConvertDeps = {
  exists: (p) => fs.existsSync(p),
  run: (cmd, args, timeoutMs) =>
    new Promise((resolve, reject) => {
      execFile(cmd, args, { timeout: timeoutMs, killSignal: 'SIGKILL' }, (err, _out, stderr) =>
        err ? reject(new Error(String(stderr || err.message))) : resolve()
      )
    })
}

/**
 * Converts a PowerPoint file to `<outDir>/<name>.pdf` on macOS: Microsoft PowerPoint first, then
 * Keynote, then LibreOffice.
 * Resolves with the PDF path; throws an operator message when nothing could convert it.
 */
export async function convertPptxToPdf(
  file: string,
  outDir: string,
  deps: MacConvertDeps = macConvertDeps
): Promise<string> {
  const pdf = path.join(outDir, `${path.basename(file).replace(/\.[^.]*$/, '')}.pdf`)
  const soffice = SOFFICE_PATHS.find((p) => deps.exists(p))
  const hasPowerpoint = deps.exists(POWERPOINT_APP)
  const hasKeynote = deps.exists(KEYNOTE_APP)
  if (!hasPowerpoint && !hasKeynote && !soffice) throw new Error(NO_MAC_CONVERTER)
  // The first app that refused Automation names the message (PowerPoint before Keynote).
  let denied: string | null = null
  const attempt = async (cmd: string, args: string[], deniedMessage?: string): Promise<boolean> => {
    try {
      await deps.run(cmd, args, CONVERT_TIMEOUT_MS)
      return deps.exists(pdf)
    } catch (err) {
      if (deniedMessage && !denied && isAutomationDenied(err)) denied = deniedMessage
      return false
    }
  }
  if (hasPowerpoint && (await attempt('osascript', powerpointArgs(file, pdf), POWERPOINT_DENIED))) {
    return pdf
  }
  if (hasKeynote && (await attempt('osascript', keynoteArgs(file, pdf), KEYNOTE_DENIED))) return pdf
  // soffice names its output after the input file, which is what `pdf` is.
  if (soffice && (await attempt(soffice, sofficeArgs(file, outDir)))) return pdf
  throw new Error(denied ?? CONVERT_FAILED)
}
