import { describe, expect, it } from 'vitest'
import { canSelfUpdate } from './platform'

const base = { packaged: true, platform: 'win32' as const, env: {}, packageType: null }

describe('canSelfUpdate for a Beta build', () => {
  it('a packaged Windows Bridgecast updates', () => {
    expect(canSelfUpdate({ ...base, appName: 'Bridgecast' })).toBe(true)
  })

  it('without a name it still updates', () => {
    expect(canSelfUpdate(base)).toBe(true)
  })

  it('Bridgecast Beta never updates', () => {
    expect(canSelfUpdate({ ...base, appName: 'Bridgecast Beta' })).toBe(false)
  })

  it('the beta package name also counts', () => {
    expect(canSelfUpdate({ ...base, appName: 'bridgecast-beta' })).toBe(false)
  })

  it('a name that only contains the letters does not', () => {
    expect(canSelfUpdate({ ...base, appName: 'Betamax Bridgecast' })).toBe(true)
  })
})
