export interface WalkSlide {
  clicks: number
  hidden?: boolean
}
export interface WalkPos {
  index: number
  step: number
}
/**
 * Signed number of single moves between two slide show positions in show order: positive =
 * that many `next`, negative = that many `prev`, 0 = same place. Show order visits every
 * visible slide at steps 0..clicks (clicks < 0 counts as 0) and skips hidden slides. Null when
 * either position is out of range, on a hidden slide, or past its slide's clicks, or when more
 * than `max` moves apart.
 */
export function walkSteps(
  slides: WalkSlide[],
  from: WalkPos,
  to: WalkPos,
  max: number,
): number | null {
  const fromOrdinal = ordinal(slides, from)
  if (fromOrdinal === null) {
    return null
  }
  const toOrdinal = ordinal(slides, to)
  if (toOrdinal === null) {
    return null
  }
  const distance = toOrdinal - fromOrdinal
  return Math.abs(distance) > max ? null : distance
}

/**
 * The position one `next` (dir 1) or `prev` (dir -1) away in show order: the next step on
 * the same slide, else step 0 of the next visible slide (forward) or the last step of the
 * previous visible slide (back). Null when `pos` is invalid (see walkSteps) or there is no
 * such position (end or start of the show).
 */
export function stepOnce(slides: WalkSlide[], pos: WalkPos, dir: 1 | -1): WalkPos | null {
  if (ordinal(slides, pos) === null) {
    return null
  }
  if (dir === 1) {
    if (pos.step < Math.max(0, slides[pos.index].clicks)) {
      return { index: pos.index, step: pos.step + 1 }
    }
    for (let j = pos.index + 1; j < slides.length; j++) {
      if (!slides[j].hidden) {
        return { index: j, step: 0 }
      }
    }
    return null
  }
  if (pos.step > 0) {
    return { index: pos.index, step: pos.step - 1 }
  }
  for (let j = pos.index - 1; j >= 0; j--) {
    if (!slides[j].hidden) {
      return { index: j, step: Math.max(0, slides[j].clicks) }
    }
  }
  return null
}

/**
 * Zero-based position of a slide show position in show order, counting every visible slide's
 * steps 0..clicks (clicks < 0 counts as 0). Null when the position is out of range, on a hidden
 * slide, or past its slide's clicks.
 */
function ordinal(slides: WalkSlide[], pos: WalkPos): number | null {
  if (!Number.isInteger(pos.index) || pos.index < 0 || pos.index >= slides.length) {
    return null
  }
  if (slides[pos.index].hidden) {
    return null
  }
  const clicks = Math.max(0, slides[pos.index].clicks)
  if (!Number.isInteger(pos.step) || pos.step < 0 || pos.step > clicks) {
    return null
  }
  let total = 0
  for (let i = 0; i < pos.index; i++) {
    if (!slides[i].hidden) {
      total += Math.max(0, slides[i].clicks) + 1
    }
  }
  return total + pos.step
}
