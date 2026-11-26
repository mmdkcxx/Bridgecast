import { execFile } from 'node:child_process'

/**
 * Click-triggered animation steps of one slide: `nodeType="clickEffect"` occurrences inside its
 * `<p:timing>` block (0 without one). Same count as the Mac slide show helper (SlideXml.swift).
 */
export function clickCount(slideXml: string): number {
  const start = slideXml.indexOf('<p:timing')
  if (start === -1) return 0
  const end = slideXml.indexOf('</p:timing', start)
  const block = slideXml.slice(start, end === -1 ? undefined : end)
  return block.split('nodeType="clickEffect"').length - 1
}

/**
 * Slide part names (for example `ppt/slides/slide3.xml`) in show order, from presentation.xml's
 * `<p:sldId r:id>` list resolved through its rels. Targets starting with '/' drop the slash;
 * others get the 'ppt/' prefix.
 */
export function slideOrder(presentationXml: string, relsXml: string): string[] {
  const ids = [...presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map((m) => m[1])
  const targets = new Map<string, string>()
  for (const [element] of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(element)?.[1]
    const target = /\bTarget="([^"]+)"/.exec(element)?.[1]
    if (id && target) targets.set(id, target)
  }
  const order: string[] = []
  for (const id of ids) {
    const target = targets.get(id)
    if (target) order.push(target.startsWith('/') ? target.slice(1) : `ppt/${target}`)
  }
  return order
}

export type ReadPart = (file: string, part: string) => Promise<string | null>

/**
 * Clicks per slide in show order; null when the file cannot be read as a .pptx (missing
 * presentation parts, no slides). A slide part that cannot be read counts 0.
 */
export async function pptxClicks(file: string, readPart: ReadPart): Promise<number[] | null> {
  const presentation = await readPart(file, 'ppt/presentation.xml')
  const rels = await readPart(file, 'ppt/_rels/presentation.xml.rels')
  if (presentation === null || rels === null) return null
  const order = slideOrder(presentation, rels)
  if (order.length === 0) return null
  const counts: number[] = []
  for (const part of order) counts.push(clickCount((await readPart(file, part)) ?? ''))
  return counts
}

/** Reads one zip part with `/usr/bin/unzip -p` (macOS); null on any failure. */
export function unzipPart(file: string, part: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        '/usr/bin/unzip',
        ['-p', file, part],
        { encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024 * 1024 },
        (err, stdout) => resolve(err ? null : stdout)
      )
    } catch {
      resolve(null)
    }
  })
}
