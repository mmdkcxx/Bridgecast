import type { ClickerDirection } from '../shared/types'
import type { ClickerKeys } from '../shared/settings'

export type { ClickerDirection } from '../shared/types'

/**
 * Electron accelerators per Settings choice, Next first: most clickers send PageDown/PageUp;
 * some (Perfect Cue by default) send the Right/Left arrows.
 */
export const CLICKER_KEY_SETS: Readonly<
  Record<ClickerKeys, readonly (readonly [string, ClickerDirection])[]>
> = Object.freeze({
  page: [
    ['PageDown', 'next'],
    ['PageUp', 'prev']
  ],
  arrows: [
    ['Right', 'next'],
    ['Left', 'prev']
  ]
})

export interface ShortcutPort {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
}

/**
 * Runs Next/Prev from a presentation clicker's keys (PageDown/PageUp, or Right/Left) while no
 * Bridgecast window has focus, behind the Settings switch. Only keys that registered
 * successfully are released.
 */
export class BackgroundClicker {
  private enabled = false
  private appFocused = true
  private disposed = false
  private active = false
  private choice: ClickerKeys = 'page'
  private readonly keys = new Set<string>()
  private readonly warned = new Set<string>()
  private readonly warn: (msg: string) => void

  constructor(
    private readonly port: ShortcutPort,
    private readonly onPress: (d: ClickerDirection) => void,
    warn?: (msg: string) => void
  ) {
    this.warn = warn ?? ((message: string): void => console.warn(message))
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    this.sync()
  }

  setAppFocused(focused: boolean): void {
    this.appFocused = focused
    this.sync()
  }

  /** Which keys the clicker sends; swaps the registered keys at once while active. */
  setKeys(choice: ClickerKeys): void {
    if (choice === this.choice) return
    this.release()
    this.choice = choice
    this.sync()
  }

  registered(): string[] {
    return Array.from(this.keys)
  }

  dispose(): void {
    this.disposed = true
    this.sync()
  }

  private sync(): void {
    const want = this.enabled && !this.appFocused && !this.disposed
    if (want && !this.active) {
      for (const [key, direction] of CLICKER_KEY_SETS[this.choice]) {
        let registered = false
        try {
          registered = this.port.register(key, () => this.onPress(direction))
        } catch {
          registered = false
        }
        if (registered) {
          this.keys.add(key)
        } else if (!this.warned.has(key)) {
          this.warn(`[clicker] could not register ${key} while Bridgecast is in the background`)
          this.warned.add(key)
        }
      }
      this.active = true
    } else if (!want && this.active) {
      this.release()
    }
  }

  private release(): void {
    for (const key of this.keys) this.port.unregister(key)
    this.keys.clear()
    this.active = false
  }
}
