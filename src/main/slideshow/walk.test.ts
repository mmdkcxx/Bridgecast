import { describe, it, expect } from 'vitest'
import { walkSteps, stepOnce } from './walk'

const slides = [{ clicks: 2 }, { clicks: 0 }, { clicks: 1, hidden: true }, { clicks: 1 }]

const p = (index: number, step: number): { index: number; step: number } => ({ index, step })

describe('walkSteps', () => {
  it('returns 0 for the same position', () => {
    expect(walkSteps(slides, p(0, 0), p(0, 0), 10)).toBe(0)
  })

  it('returns signed moves between visible positions', () => {
    expect(walkSteps(slides, p(0, 0), p(0, 2), 10)).toBe(2)
    expect(walkSteps(slides, p(0, 1), p(1, 0), 10)).toBe(2)
    expect(walkSteps(slides, p(1, 0), p(3, 1), 10)).toBe(2)
    expect(walkSteps(slides, p(3, 0), p(0, 2), 10)).toBe(-2)
  })

  it('returns null when the moves exceed max', () => {
    expect(walkSteps(slides, p(0, 0), p(3, 1), 4)).toBeNull()
  })

  it('returns the move count when it equals max', () => {
    expect(walkSteps(slides, p(0, 0), p(3, 1), 5)).toBe(5)
  })

  it('returns null for a hidden target position', () => {
    expect(walkSteps(slides, p(0, 0), p(2, 0), 10)).toBeNull()
  })

  it('returns null for a step past the slide clicks', () => {
    expect(walkSteps(slides, p(0, 0), p(1, 1), 10)).toBeNull()
  })

  it('returns null for an out-of-range slide index', () => {
    expect(walkSteps(slides, p(0, 0), p(4, 0), 10)).toBeNull()
  })
})

describe('stepOnce', () => {
  it('moves forward within a slide', () => {
    expect(stepOnce(slides, p(0, 1), 1)).toEqual(p(0, 2))
  })

  it('moves forward to the next visible slide', () => {
    expect(stepOnce(slides, p(0, 2), 1)).toEqual(p(1, 0))
    expect(stepOnce(slides, p(1, 0), 1)).toEqual(p(3, 0))
  })

  it('returns null when moving forward past the end', () => {
    expect(stepOnce(slides, p(3, 1), 1)).toBeNull()
  })

  it('moves back to the previous visible slide', () => {
    expect(stepOnce(slides, p(3, 0), -1)).toEqual(p(1, 0))
    expect(stepOnce(slides, p(1, 0), -1)).toEqual(p(0, 2))
  })

  it('returns null when moving back past the start', () => {
    expect(stepOnce(slides, p(0, 0), -1)).toBeNull()
  })

  it('returns null for a hidden slide', () => {
    expect(stepOnce(slides, p(2, 0), 1)).toBeNull()
  })
})
