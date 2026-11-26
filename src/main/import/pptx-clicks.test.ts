import { describe, it, expect } from 'vitest'
import { clickCount, pptxClicks, slideOrder } from './pptx-clicks'

const presentation =
  '<p:sldIdLst><p:sldId id="257" r:id="rId3"/><p:sldId id="256" r:id="rId2"/></p:sldIdLst>'
const rels =
  '<Relationships><Relationship Id="rId2" Type="x" Target="slides/slide1.xml"/>' +
  '<Relationship Target="/ppt/slides/slide2.xml" Id="rId3" Type="x"/></Relationships>'
const click = '<p:par><p:cTn nodeType="clickEffect"/></p:par>'
const timing = (n: number): string => `<p:sld><p:timing>${click.repeat(n)}</p:timing></p:sld>`

const reader =
  (parts: Record<string, string>) =>
  async (_file: string, part: string): Promise<string | null> =>
    parts[part] ?? null

describe('clickCount', () => {
  it('is 0 without a timing block', () => {
    expect(clickCount('<p:sld><p:cSld/></p:sld>')).toBe(0)
  })

  it('counts click effects only', () => {
    const xml = `<p:timing>${click}${click}<p:cTn nodeType="withEffect"/></p:timing>`
    expect(clickCount(xml)).toBe(2)
  })

  it('ignores click effects after the timing block', () => {
    expect(clickCount(`<p:timing>${click}</p:timing>${click}`)).toBe(1)
  })
})

describe('slideOrder', () => {
  it('follows the presentation order through the rels, in any attribute order', () => {
    expect(slideOrder(presentation, rels)).toEqual([
      'ppt/slides/slide2.xml',
      'ppt/slides/slide1.xml'
    ])
  })
})

describe('pptxClicks', () => {
  it('counts per slide in show order; an unreadable slide counts 0', async () => {
    const read = reader({
      'ppt/presentation.xml': presentation,
      'ppt/_rels/presentation.xml.rels': rels,
      'ppt/slides/slide2.xml': timing(3)
    })
    expect(await pptxClicks('deck.pptx', read)).toEqual([3, 0])
  })

  it('is null without a presentation part', async () => {
    const read = reader({ 'ppt/_rels/presentation.xml.rels': rels })
    expect(await pptxClicks('deck.pptx', read)).toBeNull()
  })

  it('is null when the presentation lists no slides', async () => {
    const read = reader({
      'ppt/presentation.xml': '<p:presentation/>',
      'ppt/_rels/presentation.xml.rels': rels
    })
    expect(await pptxClicks('deck.pptx', read)).toBeNull()
  })
})
