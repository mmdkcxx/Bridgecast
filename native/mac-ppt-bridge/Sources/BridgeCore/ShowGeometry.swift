import CoreGraphics
import Foundation

/// Clamping helpers for PowerPoint show positions.
public enum ShowClamp {
  /// Returns the clamped slide index after advancing, and whether the show ended.
  public static func afterNext(position: Int, slideCount: Int) -> (clampTo: Int?, ended: Bool) {
    if slideCount > 0 && position > slideCount {
      return (slideCount, true)
    }
    return (nil, false)
  }
}

/// Expected window title for a running slide show of the given file.
public func expectedTitle(fileName: String) -> String {
  "PowerPoint Slide Show - [" + (fileName as NSString).deletingPathExtension + "]"
}

/// Normalized crop rectangle around the slide area.
public struct CropRect: Equatable {
  public var x: Double
  public var y: Double
  public var width: Double
  public var height: Double

  public init(x: Double, y: Double, width: Double, height: Double) {
    self.x = x
    self.y = y
    self.width = width
    self.height = height
  }
}

/// Computes the normalized crop rect for the slide inside a window.
public func slideCrop(window: CGSize, titleBar: Double, slideAspect: Double) -> CropRect {
  let W = Double(window.width)
  let H = Double(window.height)
  let ch = H - titleBar

  if W <= 0 || ch <= 0 || slideAspect <= 0 {
    return CropRect(x: 0, y: 0, width: 1, height: 1)
  }

  let w: Double
  let h: Double
  let x: Double
  let y: Double

  if W / ch > slideAspect {
    h = ch
    w = ch * slideAspect
    x = (W - w) / 2
    y = titleBar
  } else {
    w = W
    h = W / slideAspect
    x = 0
    y = titleBar + (ch - h) / 2
  }

  return CropRect(x: x / W, y: y / H, width: w / W, height: h / H)
}
