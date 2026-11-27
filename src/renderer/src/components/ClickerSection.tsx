import { useEffect, useState } from 'react'
import { errorMessage } from '../model'
import { Switch } from './Switch'
import { Segmented } from './Segmented'
import type { ClickerKeys, Settings } from '../../../shared/settings'

const KEY_OPTIONS: readonly { value: ClickerKeys; label: string }[] = [
  { value: 'page', label: 'PageDown / PageUp' },
  { value: 'arrows', label: 'Right / Left arrows' }
]

/**
 * Settings > Clicker in the background: the clicker's keys (PageDown/PageUp, or Right/Left for
 * clickers such as Perfect Cue) move the live slide while another app is in front. Off by default;
 * both choices apply at once.
 */
export function ClickerSection(): React.JSX.Element {
  const [on, setOn] = useState<boolean | null>(null)
  const [keys, setKeys] = useState<ClickerKeys>('page')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    window.api
      .getSettings()
      .then((s) => {
        if (!live) return
        setOn(s.clickerBackground)
        setKeys(s.clickerKeys)
      })
      .catch((e: unknown) => live && setError(errorMessage(e)))
    return () => {
      live = false
    }
  }, [])

  const run = async (act: () => Promise<Settings>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const s = await act()
      setOn(s.clickerBackground)
      setKeys(s.clickerKeys)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="set-section" aria-labelledby="set-clicker" data-testid="settings-clicker">
      <div className="set-row">
        <div>
          <h3 id="set-clicker">Clicker in the background</h3>
          <p className="hint">
            The clicker keys below move the live slide even when another app is in front, so a
            speaker&apos;s clicker keeps working while you reply to a message or prepare files.
            These two keys then move slides from every keyboard on this PC and stop working in other
            apps.
          </p>
        </div>
        <Switch
          id="clicker-background"
          labelledBy="set-clicker"
          checked={on === true}
          disabled={busy || on === null}
          onChange={(next) => void run(() => window.api.setClickerBackground(next))}
          testId="settings-clicker-background"
        />
      </div>
      <div className="set-row">
        <div>
          <span className="row-label" id="clicker-keys-label">
            Clicker keys
          </span>
          <p className="hint">
            Most clickers send PageDown / PageUp. Choose the arrows for clickers that send Right /
            Left (Perfect Cue by default); the arrows then do not move the text cursor in other
            apps.
          </p>
        </div>
        <Segmented<ClickerKeys>
          label="Clicker keys"
          value={keys}
          options={KEY_OPTIONS}
          disabled={busy || on === null}
          testId="settings-clicker-keys"
          onChange={(k) => void run(() => window.api.setClickerKeys(k))}
        />
      </div>
      {error && (
        <p className="hint" role="alert" data-testid="settings-clicker-error">
          {error}
        </p>
      )}
    </section>
  )
}
