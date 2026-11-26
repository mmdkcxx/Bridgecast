/// Click counter for a slide show that has no GetClickIndex (LibreOffice Impress).
///
/// The bridge counts the `next`/`prev` effects it sends itself and corrects the count whenever
/// the show reports (or is seen to be on) another slide. The engine position always wins in the
/// app, so this only has to be right in the normal cases and recover by itself otherwise.
public final class StepCounter {
  public private(set) var index: Int
  public private(set) var clicks: Int
  public private(set) var step: Int = 0
  // prev was asked at step 0: if the slide changes now, we arrive at the end of the other slide.
  private var backwards = false

  public init(index: Int = 0, clicks: Int = 0) {
    self.index = index
    self.clicks = clicks
  }

  /// `gotoNextEffect` was sent. At the last click it leaves the slide: the step stays and the
  /// slide change resets it.
  public func onNextEffect() {
    backwards = false
    if step < clicks {
      step += 1
    }
  }

  /// `gotoPreviousEffect` was sent. Inside a slide it undoes one click; at step 0 it goes to
  /// the previous slide with all its effects done.
  public func onPrevEffect() {
    if step > 0 {
      step -= 1
      backwards = false
    } else {
      backwards = true
    }
  }

  /// The show is on slide `index` (which has `clicks` clicks). The same slide changes nothing
  /// except the click count.
  public func onSlideChanged(index: Int, clicks: Int) {
    if index == self.index {
      self.clicks = clicks
      self.step = min(self.step, clicks)
      backwards = false
      return
    }
    self.step = backwards ? clicks : 0
    self.index = index
    self.clicks = clicks
    backwards = false
  }

  /// (slide index, step, clicks of the slide).
  public func position() -> (index: Int, step: Int, clicks: Int) {
    return (index, step, clicks)
  }
}
