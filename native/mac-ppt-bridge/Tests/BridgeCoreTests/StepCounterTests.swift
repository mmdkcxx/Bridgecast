import XCTest
@testable import BridgeCore

final class StepCounterTests: XCTestCase {
  private func assertPosition(
    _ counter: StepCounter,
    index: Int,
    step: Int,
    clicks: Int,
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    let position = counter.position()
    XCTAssertEqual(position.index, index, file: file, line: line)
    XCTAssertEqual(position.step, step, file: file, line: line)
    XCTAssertEqual(position.clicks, clicks, file: file, line: line)
  }

  func testThreeNextEffectsThenSlideChange() {
    let c = StepCounter(index: 0, clicks: 3)
    for expected in [1, 2, 3] {
      c.onNextEffect()
      assertPosition(c, index: 0, step: expected, clicks: 3)
    }
    c.onNextEffect()  // at the last click: leaves the slide, step stays until the change
    assertPosition(c, index: 0, step: 3, clicks: 3)
    c.onSlideChanged(index: 1, clicks: 1)
    assertPosition(c, index: 1, step: 0, clicks: 1)
  }

  func testPrevFromStepZeroLandsAtClicks() {
    let c = StepCounter(index: 2, clicks: 0)
    c.onPrevEffect()
    c.onSlideChanged(index: 1, clicks: 4)
    assertPosition(c, index: 1, step: 4, clicks: 4)
  }

  func testPrevInsideASlideGoesBackOneStep() {
    let c = StepCounter(index: 0, clicks: 3)
    c.onNextEffect()
    c.onNextEffect()
    c.onPrevEffect()
    assertPosition(c, index: 0, step: 1, clicks: 3)
    c.onPrevEffect()
    c.onPrevEffect()  // step 0: the next change is backwards
    c.onSlideChanged(index: 0, clicks: 3)  // same slide (first slide has nowhere to go): stays
    assertPosition(c, index: 0, step: 0, clicks: 3)
  }

  func testSlideChangeWithoutEffectsResets() {
    // auto advance, or a transition timer: no next was sent
    let c = StepCounter(index: 0, clicks: 2)
    c.onNextEffect()
    c.onSlideChanged(index: 1, clicks: 0)
    assertPosition(c, index: 1, step: 0, clicks: 0)
  }

  func testForwardSlideChangeAfterACancelledPrevIsNotBackwards() {
    let c = StepCounter(index: 1, clicks: 2)
    c.onPrevEffect()  // asked at step 0 ...
    c.onNextEffect()  // ... then forward again before the change was seen
    c.onSlideChanged(index: 2, clicks: 3)
    assertPosition(c, index: 2, step: 0, clicks: 3)
  }

  func testSameSlideUpdatesClickCountAndClampsStep() {
    let c = StepCounter(index: 0, clicks: 5)
    for _ in 0..<4 {
      c.onNextEffect()
    }
    c.onSlideChanged(index: 0, clicks: 2)
    assertPosition(c, index: 0, step: 2, clicks: 2)
  }

  func testGotoArrivesAtStepZero() {
    let c = StepCounter(index: 0, clicks: 3)
    c.onNextEffect()
    c.onSlideChanged(index: 4, clicks: 2)
    assertPosition(c, index: 4, step: 0, clicks: 2)
  }
}
