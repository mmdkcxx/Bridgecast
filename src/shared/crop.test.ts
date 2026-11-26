import { describe, expect, it } from 'vitest'
import { cropStyle, isCropRect } from './crop'

describe('cropStyle', () => {
  it('scales and offsets the video so the crop area fills the box', () => {
    expect(cropStyle({ x: 0.0156, y: 0.0311, width: 0.9689, height: 0.9689 })).toEqual({
      width: '103.21%',
      height: '103.21%',
      left: '-1.61%',
      top: '-3.21%'
    })
  })

  it('returns the identity style for a full-frame crop without negative zero', () => {
    expect(cropStyle({ x: 0, y: 0, width: 1, height: 1 })).toEqual({
      width: '100.00%',
      height: '100.00%',
      left: '0.00%',
      top: '0.00%'
    })
  })

  it('returns null when there is no crop', () => {
    expect(cropStyle(null)).toBeNull()
  })
})

describe('isCropRect', () => {
  it('accepts a full-frame crop', () => {
    expect(isCropRect({ x: 0, y: 0, width: 1, height: 1 })).toBe(true)
  })

  it('accepts a crop inside the frame', () => {
    expect(isCropRect({ x: 0.0156, y: 0.0311, width: 0.9689, height: 0.9689 })).toBe(true)
  })

  it('rejects a crop overflowing the frame', () => {
    expect(isCropRect({ x: 0.5, y: 0, width: 0.6, height: 1 })).toBe(false)
  })

  it('rejects a NaN coordinate', () => {
    expect(isCropRect({ x: NaN, y: 0, width: 1, height: 1 })).toBe(false)
  })

  it('rejects a zero width', () => {
    expect(isCropRect({ x: 0, y: 0, width: 0, height: 1 })).toBe(false)
  })

  it('rejects a negative offset', () => {
    expect(isCropRect({ x: -0.1, y: 0, width: 0.5, height: 1 })).toBe(false)
  })

  it('rejects non-object values', () => {
    expect(isCropRect('x')).toBe(false)
    expect(isCropRect(null)).toBe(false)
  })
})
