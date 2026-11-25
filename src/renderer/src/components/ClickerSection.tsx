import { useEffect, useState } from 'react'
import { errorMessage } from '../model'
import { Switch } from './Switch'

/**
 * Settings > Clicker in the background: PageDown/PageUp move the live slide while another app
 * is in front. Off by default; applies at once.
 */
export function ClickerSection(): React.JSX.Element {
  const [on, setOn] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    window.api
      .getSettings()
      .then((s) => live && setOn(s.clickerBackground))
      .catch((e: unknown) => live && setError(errorMessage(e)))
    return () => {
      live = false
    }
  }, [])

  const change = async (next: boolean): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const s = await window.api.setClickerBackground(next)
      setOn(s.clickerBackground)
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
            PageDown and PageUp move the live slide even when another app is in front, so a
            speaker&apos;s clicker keeps working while you reply to a message or prepare files. These
            two keys then move slides from every keyboard on this PC and stop working in other apps.
            Clickers that send arrow keys only work while Bridgecast is in front.
          </p>
        </div>
        <Switch
          id="clicker-background"
          labelledBy="set-clicker"
          checked={on === true}
          disabled={busy || on === null}
          onChange={(next) => void change(next)}
          testId="settings-clicker-background"
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
