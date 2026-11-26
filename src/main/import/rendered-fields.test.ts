import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderedDeckFields } from './rendered-fields'

describe('renderedDeckFields', () => {
  let dir: string
  let pdf: string
  let pptx: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rendered-'))
    pdf = path.join(dir, 'deck.pdf')
    pptx = path.join(dir, 'talk.pptx')
    fs.writeFileSync(pdf, 'pdf')
    fs.writeFileSync(pptx, 'pptx')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('a converted PowerPoint file with the PowerPoint engine becomes a native pptx deck', () => {
    expect(
      renderedDeckFields({ source: 'pdf', sourcePath: pdf, original: pptx, engine: 'powerpoint' })
    ).toEqual({ source: 'pptx', sourcePath: pptx, pdfPath: pdf, playback: 'native' })
  })

  it('without the PowerPoint engine it stays a vector PDF with the PowerPoint file as original', () => {
    expect(
      renderedDeckFields({ source: 'pdf', sourcePath: pdf, original: pptx, engine: 'none' })
    ).toEqual({ source: 'pdf', sourcePath: pdf, playback: 'vector', originalPath: pptx })
    expect(
      renderedDeckFields({ source: 'pdf', sourcePath: pdf, original: pptx, engine: 'libreoffice' })
    ).toEqual({ source: 'pdf', sourcePath: pdf, playback: 'vector', originalPath: pptx })
  })

  it('a plain PDF import is unchanged', () => {
    expect(renderedDeckFields({ source: 'pdf', sourcePath: pdf, engine: 'powerpoint' })).toEqual({
      source: 'pdf',
      sourcePath: pdf,
      playback: 'vector'
    })
  })

  it('a converted file whose PDF path is bad still plays native without source.pdf', () => {
    expect(
      renderedDeckFields({
        source: 'pdf',
        sourcePath: path.join(dir, 'missing.pdf'),
        original: pptx,
        engine: 'powerpoint'
      })
    ).toEqual({ source: 'pptx', sourcePath: pptx, playback: 'native' })
  })

  it('images stay images', () => {
    expect(
      renderedDeckFields({
        source: 'image',
        sourcePath: undefined,
        engine: 'powerpoint',
        original: pptx
      })
    ).toEqual({ source: 'image' })
  })
})
