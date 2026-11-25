import type { ClickerDirection } from '../shared/types'

export type { ClickerDirection } from '../shared/types'

export const CLICKER_KEYS: Readonly<Record<'PageDown' | 'PageUp', ClickerDirection>> =
  Object.freeze({ PageDown: 'next', PageUp: 'prev' })

export interface ShortcutPort {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
}

/**
 * Runs Next/Prev from presentation clicker PageDown/PageUp keys while no Bridgecast window has
 * focus, behind the Settings switch. Only keys that registered successfully are released.
 */
export class BackgroundClicker {
  private enabled = false
  private appFocused = true
  private disposed = false
  private active = false
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
      const keys = Object.keys(CLICKER_KEYS) as Array<keyof typeof CLICKER_KEYS>
      for (const key of keys) {
        let registered = false
        try {
          registered = this.port.register(key, () => this.onPress(CLICKER_KEYS[key]))
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
      for (const key of this.keys) {
        this.port.unregister(key)
      }
      this.keys.clear()
      this.active = false
    }
  }
}
