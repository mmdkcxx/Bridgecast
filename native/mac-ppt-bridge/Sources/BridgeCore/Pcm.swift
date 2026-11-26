import Foundation

/// Builds the PCM the app expects: float32 little-endian, stereo interleaved
/// (L R L R), with no header.
public func interleave(left: UnsafePointer<Float>, right: UnsafePointer<Float>, frames: Int) -> Data {
  if frames <= 0 {
    return Data()
  }
  var out = [UInt32](repeating: 0, count: frames * 2)
  for i in 0..<frames {
    out[2 * i] = left[i].bitPattern.littleEndian
    out[2 * i + 1] = right[i].bitPattern.littleEndian
  }
  return out.withUnsafeBytes { Data($0) }
}
