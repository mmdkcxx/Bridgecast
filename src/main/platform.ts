import { execFile } from 'node:child_process'

import { engineName, type EngineKind } from '../shared/playback'

export { engineName }
export type { EngineKind }

export const INSTALL_LIBREOFFICE =
  'Install LibreOffice Impress and python3-uno to import PowerPoint files, or export the file to PDF and import the PDF.'
export const WAYLAND_STILLS =
  "Animated slides need X11 on Linux, through Xwayland or an X11 session ('GNOME on Xorg'). Showing still slides."
export const NO_POWERPOINT_ENGINE =
  'PowerPoint files are converted to PDF on macOS with Microsoft PowerPoint, Keynote or LibreOffice. Install one of them, or export the file to PDF and import the PDF.'

export interface PlatformProbe {
  platform: NodeJS.Platform
  /** The session's own `XDG_SESSION_TYPE` (read before `x11CaptureEnv` changes it). */
  sessionType?: string
  /**
   * Wayland session, but the app runs on X11 (Xwayland) and its window capture was switched to
   * X11 (`x11CaptureEnv`), so the slide show window (an X11 window) can be captured.
   */
  x11Capture?: boolean
  hasSoffice: boolean
  hasPyUno: boolean
  /** macOS: Microsoft PowerPoint is installed in /Applications. */
  hasPowerPoint?: boolean
  /** macOS major version (13 = Ventura). */
  macosMajor?: number
}

export interface EngineInfo {
  engine: EngineKind
  /**
   * The slide show window can be captured (false on Wayland without Xwayland: native decks play
   * as still images). At run time a window that is not listed still falls back to the PNG.
   */
  canCapture: boolean
  /** Operator copy: why PowerPoint import is refused (`none`) or why slides stay still (Wayland). */
  message?: string
}

/**
 * Engine choice is by platform only (no setting): Windows uses PowerPoint; macOS uses PowerPoint
 * for Mac (mac-ppt-bridge) on macOS 13+ when it is installed; Linux uses LibreOffice Impress when
 * `soffice` and python3-uno are there. Under Wayland native decks play through Xwayland
 * (`x11Capture`), and as stills when the app could not get there.
 */
export function detectEngine(p: PlatformProbe): EngineInfo {
  if (p.platform === 'win32') return { engine: 'powerpoint', canCapture: true }
  if (p.platform === 'linux') {
    if (!p.hasSoffice || !p.hasPyUno) {
      return { engine: 'none', canCapture: false, message: INSTALL_LIBREOFFICE }
    }
    if (p.sessionType === 'wayland' && !p.x11Capture) {
      return { engine: 'libreoffice', canCapture: false, message: WAYLAND_STILLS }
    }
    return { engine: 'libreoffice', canCapture: true }
  }
  if (p.platform === 'darwin' && p.hasPowerPoint && (p.macosMajor ?? 0) >= 13) {
    return { engine: 'powerpoint', canCapture: true }
  }
  return { engine: 'none', canCapture: false, message: NO_POWERPOINT_ENGINE }
}

/** macOS major version from the Darwin kernel release (`os.release()`: Darwin 22 = macOS 13); 0 when unreadable. */
export function macosMajorFromDarwin(release: string): number {
  const darwin = Number.parseInt(release.split('.')[0] ?? '', 10)
  return Number.isFinite(darwin) && darwin >= 20 ? darwin - 9 : 0
}

function run(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: 15_000 }, (err) => resolve(!err))
    } catch {
      resolve(false)
    }
  })
}

/** `which soffice` and `python3 -c "import uno"`. Not unit tested (runs real programs). */
export async function probeLinux(): Promise<{ hasSoffice: boolean; hasPyUno: boolean }> {
  const [hasSoffice, hasPyUno] = await Promise.all([
    run('which', ['soffice']),
    run('python3', ['-c', 'import uno'])
  ])
  return { hasSoffice, hasPyUno }
}

/**
 * Linux in a Wayland session: the app must run on X11 (Xwayland). A Wayland compositor draws
 * only mapped windows, so the hidden web deck page window never gets a frame to capture, and a
 * window cannot be placed off-screen to hide it. On X11 the hidden window paints. The platform
 * is chosen before any script runs, so this takes a restart with `--ozone-platform=x11`.
 * Not when the flag is already given, and not without an X server to fall back on (DISPLAY).
 */
export function needsX11Relaunch(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  argv: readonly string[]
): boolean {
  if (platform !== 'linux') return false
  if (argv.some((a) => a.startsWith('--ozone-platform'))) return false
  const wayland = env['XDG_SESSION_TYPE'] === 'wayland' || !!env['WAYLAND_DISPLAY']
  return wayland && !!env['DISPLAY']
}

/**
 * Options for `app.relaunch` that restart on X11. An AppImage runs from a temporary mount that
 * is gone once this process exits, so the default `process.execPath` would start nothing: it
 * restarts through the `.AppImage` file itself (`APPIMAGE`, set by the AppImage runtime).
 */
export function x11RelaunchOptions(
  env: Record<string, string | undefined>,
  argv: readonly string[]
): { execPath?: string; args: string[] } {
  const args = [...argv.slice(1), '--ozone-platform=x11']
  const appImage = env['APPIMAGE']
  return appImage ? { execPath: appImage, args } : { args }
}

/** Holds the session's own `XDG_SESSION_TYPE` while the app says `x11` (see `x11CaptureEnv`). */
export const SESSION_TYPE_ENV = 'BRIDGECAST_SESSION_TYPE'

/**
 * Linux in a Wayland session with the app on X11 (`--ozone-platform=x11`, an X server in
 * `DISPLAY`): Chromium's window capture takes the PipeWire portal whenever `XDG_SESSION_TYPE` is
 * `wayland`, even for an X11 app, and that path never lists the LibreOffice slide show window
 * (an X11 window). With `x11` it captures X11 windows (measured on GNOME Wayland, see
 * docs/superpowers/notes/2026-11-18-wayland-libreoffice-capture.md). Returns the variables to
 * set in this process before the first capture, or null. Child processes get the session's own
 * value back from `childEnv`.
 */
export function x11CaptureEnv(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  argv: readonly string[]
): Record<string, string> | null {
  if (platform !== 'linux') return null
  if (env['XDG_SESSION_TYPE'] !== 'wayland' || !env['DISPLAY']) return null
  if (!argv.includes('--ozone-platform=x11')) return null
  return { XDG_SESSION_TYPE: 'x11', [SESSION_TYPE_ENV]: 'wayland' }
}

/**
 * The environment for a program the app starts (LibreOffice, the user's own LibreOffice through
 * Edit): this process's, with the session's own `XDG_SESSION_TYPE` back when `x11CaptureEnv`
 * changed it.
 */
export function childEnv(
  env: Record<string, string | undefined>
): Record<string, string | undefined> {
  const out = { ...env }
  const own = out[SESSION_TYPE_ENV]
  if (own === undefined) return out
  delete out[SESSION_TYPE_ENV]
  out['XDG_SESSION_TYPE'] = own
  return out
}

/**
 * Whether this build can update itself: a packaged Windows build, a Linux AppImage, or a Linux
 * `.deb` install. `packageType` is the text of `resources/package-type`, which electron-builder
 * writes into a `.deb` (`deb`); electron-updater picks its installer from the same file. A
 * `.deb` update is installed with `dpkg` and asks for the administrator password.
 * `BRIDGECAST_NO_UPDATE_CHECK=1` switches updates off. A Bridgecast Beta test build (its own app
 * id and name) never updates itself: the releases are the regular app.
 */
export function canSelfUpdate(o: {
  packaged: boolean
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  packageType: string | null
  /** The app's name, `app.getName()`. */
  appName?: string
}): boolean {
  if (!o.packaged || o.env['BRIDGECAST_NO_UPDATE_CHECK'] === '1') return false
  if (o.appName && /\bbeta\b/i.test(o.appName)) return false
  if (o.platform === 'win32') return true
  if (o.platform !== 'linux') return false
  return o.env['APPIMAGE'] !== undefined || o.packageType?.trim() === 'deb'
}
