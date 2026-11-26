import { describe, expect, it } from 'vitest'

import { detectEngine, NO_POWERPOINT_ENGINE } from './platform'

const STILLS = { engine: 'none', canCapture: false, message: NO_POWERPOINT_ENGINE }

describe('detectEngine on macOS', () => {
  it('uses PowerPoint on macOS 13 or later when it is installed', () => {
    expect(
      detectEngine({
        platform: 'darwin',
        hasSoffice: false,
        hasPyUno: false,
        hasPowerPoint: true,
        macosMajor: 13
      })
    ).toEqual({ engine: 'powerpoint', canCapture: true })
    expect(
      detectEngine({
        platform: 'darwin',
        hasSoffice: false,
        hasPyUno: false,
        hasPowerPoint: true,
        macosMajor: 27
      })
    ).toEqual({ engine: 'powerpoint', canCapture: true })
  })

  it('stays on still slides without PowerPoint', () => {
    expect(
      detectEngine({
        platform: 'darwin',
        hasSoffice: false,
        hasPyUno: false,
        hasPowerPoint: false,
        macosMajor: 15
      })
    ).toEqual(STILLS)
  })

  it('stays on still slides before macOS 13', () => {
    expect(
      detectEngine({
        platform: 'darwin',
        hasSoffice: false,
        hasPyUno: false,
        hasPowerPoint: true,
        macosMajor: 12
      })
    ).toEqual(STILLS)
    expect(
      detectEngine({
        platform: 'darwin',
        hasSoffice: false,
        hasPyUno: false,
        hasPowerPoint: true
      })
    ).toEqual(STILLS)
  })
})
