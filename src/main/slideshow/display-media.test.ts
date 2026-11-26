import { vi, describe, it, expect } from 'vitest'

vi.mock('electron', () => ({ webContents: { fromFrame: () => undefined } }))

import { createDisplayMediaRoute } from './display-media'

describe('createDisplayMediaRoute', () => {
  it('returns null when nothing was remembered', () => {
    const t = 0
    const now = (): number => t
    const route = createDisplayMediaRoute(10_000, now)

    expect(route.take(1)).toBeNull()
  })

  it('hands out sources in order, per renderer', () => {
    const t = 0
    const now = (): number => t
    const route = createDisplayMediaRoute(10_000, now)

    route.remember(1, 'window:1:0')
    route.remember(1, 'window:2:0')
    route.remember(2, 'window:3:0')

    expect(route.take(1)).toBe('window:1:0')
    expect(route.take(2)).toBe('window:3:0')
    expect(route.take(1)).toBe('window:2:0')
    expect(route.take(1)).toBeNull()
  })

  it('drops entries older than the TTL', () => {
    let t = 0
    const now = (): number => t
    const route = createDisplayMediaRoute(1000, now)

    route.remember(1, 'a')

    t = 500
    route.remember(1, 'b')

    t = 1200
    expect(route.take(1)).toBe('b')
    expect(route.take(1)).toBeNull()
  })
})
