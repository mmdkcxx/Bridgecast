/** The part of a captured slide show window that holds the slide, as fractions 0..1 of the window (macOS: the capture includes the title bar). */
export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export function isCropRect(v: unknown): v is CropRect {
  if (typeof v !== 'object' || v === null) return false
  const { x, y, width, height } = v as Record<string, unknown>
  return (
    typeof x === 'number' &&
    Number.isFinite(x) &&
    typeof y === 'number' &&
    Number.isFinite(y) &&
    typeof width === 'number' &&
    Number.isFinite(width) &&
    typeof height === 'number' &&
    Number.isFinite(height) &&
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0 &&
    x + width <= 1 &&
    y + height <= 1
  )
}

const formatPercent = (n: number): string =>
  (Object.is(n, -0) || Math.abs(n) < 0.005 ? 0 : n).toFixed(2) + '%'

/** CSS for a <video> (or canvas) inside an overflow:hidden box so only the crop area fills the box; null = no crop. */
export function cropStyle(
  c: CropRect | null
): { width: string; height: string; left: string; top: string } | null {
  if (!c) return null
  const scaleX = 100 / c.width
  const scaleY = 100 / c.height
  return {
    width: formatPercent(scaleX),
    height: formatPercent(scaleY),
    left: formatPercent(-c.x * scaleX),
    top: formatPercent(-c.y * scaleY)
  }
}
