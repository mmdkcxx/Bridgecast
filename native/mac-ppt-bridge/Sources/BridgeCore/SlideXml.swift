import Foundation

/// Counts `nodeType="clickEffect"` occurrences inside the `<p:timing>` block.
public func clickCount(slideXml: String) -> Int {
  let marker = "nodeType=\"clickEffect\""
  guard let start = slideXml.range(of: "<p:timing") else { return 0 }
  var block = String(slideXml[start.lowerBound...])
  if let end = block.range(of: "</p:timing") {
    block = String(block[..<end.lowerBound])
  }
  return block.components(separatedBy: marker).count - 1
}

/// Resolves slide r:ids to their presentation targets, in document order.
public func slideOrder(presentationXml: String, relsXml: String) -> [String] {
  let idPattern = try! NSRegularExpression(pattern: "<p:sldId\\b[^>]*\\br:id=\"([^\"]+)\"")
  let presentation = presentationXml as NSString
  let ids = idPattern.matches(
    in: presentationXml,
    range: NSRange(location: 0, length: presentation.length)
  ).map { presentation.substring(with: $0.range(at: 1)) }

  var targets: [String: String] = [:]
  let relPattern = try! NSRegularExpression(pattern: "<Relationship\\b[^>]*>")
  let idAttr = try! NSRegularExpression(pattern: "Id=\"([^\"]+)\"")
  let targetAttr = try! NSRegularExpression(pattern: "Target=\"([^\"]+)\"")
  let rels = relsXml as NSString
  for match in relPattern.matches(in: relsXml, range: NSRange(location: 0, length: rels.length)) {
    let element = rels.substring(with: match.range)
    let elementNs = element as NSString
    let full = NSRange(location: 0, length: elementNs.length)
    guard let idMatch = idAttr.firstMatch(in: element, range: full),
          let targetMatch = targetAttr.firstMatch(in: element, range: full) else { continue }
    let id = elementNs.substring(with: idMatch.range(at: 1))
    let target = elementNs.substring(with: targetMatch.range(at: 1))
    targets[id] = target
  }

  return ids.compactMap { id in
    guard let target = targets[id] else { return nil }
    return target.hasPrefix("/") ? String(target.dropFirst()) : "ppt/" + target
  }
}
