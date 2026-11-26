import XCTest
import Foundation
import CoreGraphics
@testable import BridgeCore

final class BridgeCoreTests: XCTestCase {
  func testClickCountCountsClickEffectsOnly() {
    let xml = """
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld/>
      <p:timing>
        <p:tnLst>
          <p:par>
            <p:cTn id="1" nodeType="tmRoot">
              <p:childTnLst>
                <p:cTn id="2" fill="hold" nodeType="clickEffect"/>
                <p:cTn id="3" fill="hold" nodeType="clickEffect"/>
                <p:cTn id="4" fill="hold" nodeType="clickEffect"/>
                <p:cTn id="5" nodeType="afterEffect"/>
              </p:childTnLst>
            </p:cTn>
          </p:par>
        </p:tnLst>
      </p:timing>
    </p:sld>
    """

    XCTAssertEqual(clickCount(slideXml: xml), 3)
  }

  func testClickCountWithoutTimingIsZero() {
    let xml = "<p:sld><p:cSld/></p:sld>"

    XCTAssertEqual(clickCount(slideXml: xml), 0)
  }

  func testSlideOrderFollowsSldIdLst() {
    let presentationXml = """
    <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <p:sldIdLst>
        <p:sldId id="256" r:id="rId3"/>
        <p:sldId id="257" r:id="rId2"/>
      </p:sldIdLst>
    </p:presentation>
    """

    let relsXml = """
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
      <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
    </Relationships>
    """

    XCTAssertEqual(
      slideOrder(presentationXml: presentationXml, relsXml: relsXml),
      ["ppt/slides/slide2.xml", "ppt/slides/slide1.xml"]
    )
  }

  func testShowClampAfterLastSlideGoesBackAndEnds() {
    let result = ShowClamp.afterNext(position: 3, slideCount: 2)

    XCTAssertEqual(result.clampTo, 2)
    XCTAssertTrue(result.ended)
  }

  func testShowClampInsideShowDoesNothing() {
    let result = ShowClamp.afterNext(position: 2, slideCount: 2)

    XCTAssertNil(result.clampTo)
    XCTAssertFalse(result.ended)
  }

  func testExpectedTitle() {
    XCTAssertEqual(
      expectedTitle(fileName: "Presentation1.pptx"),
      "PowerPoint Slide Show - [Presentation1]"
    )
    XCTAssertEqual(
      expectedTitle(fileName: "Rapat [final] – Ü.v2.ppt"),
      "PowerPoint Slide Show - [Rapat [final] – Ü.v2]"
    )
  }

  func testSlideCropPillarboxesInsideTheContentArea() {
    let crop = slideCrop(
      window: CGSize(width: 1600, height: 900),
      titleBar: 28,
      slideAspect: 16.0 / 9.0
    )

    XCTAssertEqual(crop.x, 0.0156, accuracy: 0.001)
    XCTAssertEqual(crop.y, 0.0311, accuracy: 0.001)
    XCTAssertEqual(crop.width, 0.9689, accuracy: 0.001)
    XCTAssertEqual(crop.height, 0.9689, accuracy: 0.001)
  }

  func testSlideCropLetterboxesTallWindows() {
    let crop = slideCrop(
      window: CGSize(width: 1000, height: 1028),
      titleBar: 28,
      slideAspect: 16.0 / 9.0
    )

    XCTAssertEqual(crop.x, 0, accuracy: 0.001)
    XCTAssertEqual(crop.y, (28 + 218.75) / 1028, accuracy: 0.001)
    XCTAssertEqual(crop.width, 1, accuracy: 0.001)
    XCTAssertEqual(crop.height, 562.5 / 1028, accuracy: 0.001)
  }

  func testInterleave() {
    let left: [Float] = [1, 2]
    let right: [Float] = [3, 4]

    let data = left.withUnsafeBufferPointer { leftBuffer in
      right.withUnsafeBufferPointer { rightBuffer in
        interleave(
          left: leftBuffer.baseAddress!,
          right: rightBuffer.baseAddress!,
          frames: 2
        )
      }
    }

    XCTAssertEqual(data.count, 16)

    let bytes = [UInt8](data)
    let values = stride(from: 0, to: bytes.count, by: 4).map { offset -> Float in
      let bits = UInt32(bytes[offset]) |
        (UInt32(bytes[offset + 1]) << 8) |
        (UInt32(bytes[offset + 2]) << 16) |
        (UInt32(bytes[offset + 3]) << 24)
      return Float(bitPattern: bits)
    }

    XCTAssertEqual(values, [1, 3, 2, 4])
  }

  func testParseRequest() {
    let request = parseRequest("{\"id\":4,\"cmd\":\"goto\",\"deckId\":\"d\",\"index\":2}")

    XCTAssertEqual(request?.id, 4)
    XCTAssertEqual(request?.cmd, "goto")
    XCTAssertEqual(request?.args["index"] as? Int, 2)
    XCTAssertEqual(request?.args["deckId"] as? String, "d")

    XCTAssertNil(parseRequest("not json"))
    XCTAssertNil(parseRequest("{\"cmd\":\"ping\"}"))
  }

  func testEncodeIsOneLine() throws {
    let encoded = encode(["id": 1, "ok": true, "message": "a\nb"])

    XCTAssertFalse(encoded.contains("\n"))

    let data = try XCTUnwrap(encoded.data(using: .utf8))
    let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

    XCTAssertEqual(object["message"] as? String, "a\nb")
  }
}
