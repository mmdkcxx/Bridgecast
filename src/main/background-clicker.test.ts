import { describe, expect, it, vi } from 'vitest'
import { BackgroundClicker, type ShortcutPort } from './background-clicker'

type MockedShortcutPort = ShortcutPort & {
  register: ReturnType<typeof vi.fn>
  unregister: ReturnType<typeof vi.fn>
}

function fakePort(fail: string[] = []): {
  port: MockedShortcutPort
  callbacks: Map<string, () => void>
} {
  const callbacks = new Map<string, () => void>()
  const register = vi.fn((accelerator: string, callback: () => void) => {
    if (fail.includes(accelerator)) return false
    callbacks.set(accelerator, callback)
    return true
  })
  const unregister = vi.fn((accelerator: string) => {
    callbacks.delete(accelerator)
  })
  return {
    port: { register, unregister } as unknown as MockedShortcutPort,
    callbacks
  }
}

describe('BackgroundClicker', () => {
  it('is off by default', () => {
    const { port } = fakePort()
    const onPress = vi.fn()
    const warn = vi.fn()
    const clicker = new BackgroundClicker(port, onPress, warn)

    clicker.setAppFocused(false)

    expect(clicker.registered()).toEqual([])
    expect(port.register).not.toHaveBeenCalled()
  })

  it('registers PageDown and PageUp when enabled and unfocused', () => {
    const { port, callbacks } = fakePort()
    const onPress = vi.fn()
    const warn = vi.fn()
    const clicker = new BackgroundClicker(port, onPress, warn)

    clicker.setEnabled(true)
    clicker.setAppFocused(false)

    expect(clicker.registered()).toEqual(['PageDown', 'PageUp'])
    callbacks.get('PageDown')!()
    expect(onPress).toHaveBeenCalledWith('next')
    callbacks.get('PageUp')!()
    expect(onPress).toHaveBeenLastCalledWith('prev')
  })

  it('releases both keys when Bridgecast gets focus', () => {
    const { port } = fakePort()
    const clicker = new BackgroundClicker(port, vi.fn(), vi.fn())

    clicker.setEnabled(true)
    clicker.setAppFocused(false)
    clicker.setAppFocused(true)

    expect(port.unregister).toHaveBeenCalledWith('PageDown')
    expect(port.unregister).toHaveBeenCalledWith('PageUp')
    expect(clicker.registered()).toEqual([])
  })

  it('releases both keys when disabled while in the background', () => {
    const { port } = fakePort()
    const clicker = new BackgroundClicker(port, vi.fn(), vi.fn())

    clicker.setEnabled(true)
    clicker.setAppFocused(false)
    clicker.setEnabled(false)

    expect(port.unregister).toHaveBeenCalledWith('PageDown')
    expect(port.unregister).toHaveBeenCalledWith('PageUp')
    expect(clicker.registered()).toEqual([])
  })

  it('registers once on repeated focus changes', () => {
    const { port } = fakePort()
    const clicker = new BackgroundClicker(port, vi.fn(), vi.fn())

    clicker.setEnabled(true)
    clicker.setAppFocused(false)
    clicker.setAppFocused(false)
    clicker.setEnabled(true)

    expect(port.register).toHaveBeenCalledTimes(2)
  })

  it('keeps the other key and warns once when a key cannot be registered', () => {
    const { port } = fakePort(['PageDown'])
    const warn = vi.fn()
    const clicker = new BackgroundClicker(port, vi.fn(), warn)

    clicker.setEnabled(true)
    clicker.setAppFocused(false)

    expect(clicker.registered()).toEqual(['PageUp'])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('PageDown')

    clicker.setAppFocused(true)

    expect(port.unregister).toHaveBeenCalledTimes(1)
    expect(port.unregister).toHaveBeenCalledWith('PageUp')

    clicker.setAppFocused(false)

    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('releases on dispose and stays off afterwards', () => {
    const { port } = fakePort()
    const clicker = new BackgroundClicker(port, vi.fn(), vi.fn())

    clicker.setEnabled(true)
    clicker.setAppFocused(false)
    clicker.dispose()

    expect(port.unregister).toHaveBeenCalledWith('PageDown')
    expect(port.unregister).toHaveBeenCalledWith('PageUp')

    port.register.mockClear()
    clicker.setAppFocused(true)
    clicker.setAppFocused(false)
    clicker.setEnabled(true)

    expect(port.register).not.toHaveBeenCalled()
    expect(clicker.registered()).toEqual([])
  })
})
