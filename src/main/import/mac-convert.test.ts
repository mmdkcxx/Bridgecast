import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  convertPptxToPdf,
  CONVERT_FAILED,
  isAutomationDenied,
  keynoteArgs,
  KEYNOTE_APP,
  KEYNOTE_DENIED,
  KEYNOTE_SCRIPT,
  NO_MAC_CONVERTER,
  powerpointArgs,
  POWERPOINT_APP,
  POWERPOINT_DENIED,
  POWERPOINT_SCRIPT,
  sofficeArgs,
  SOFFICE_PATHS,
  type MacConvertDeps
} from './mac-convert'

const OUT = path.join('/tmp/o', 'Show.pdf')

/** Which converter a run call is: 'powerpoint', 'keynote', or the soffice path. */
const who = (cmd: string, args: string[]): string =>
  cmd !== 'osascript'
    ? cmd
    : args[1] === POWERPOINT_SCRIPT
      ? 'powerpoint'
      : args[1] === KEYNOTE_SCRIPT
        ? 'keynote'
        : 'unknown'

function deps(o: {
  powerpoint?: boolean
  keynote?: boolean
  soffice?: boolean
  failPowerpoint?: string
  failKeynote?: string
  failSoffice?: boolean
  noOutput?: boolean
}): MacConvertDeps & { calls: string[] } {
  const made = new Set<string>()
  const calls: string[] = []
  return {
    calls,
    exists: (p) =>
      (p === POWERPOINT_APP && !!o.powerpoint) ||
      (p === KEYNOTE_APP && !!o.keynote) ||
      (p === SOFFICE_PATHS[0] && !!o.soffice) ||
      made.has(p),
    run: async (cmd, args) => {
      const w = who(cmd, args)
      calls.push(w)
      if (w === 'powerpoint' && o.failPowerpoint) throw new Error(o.failPowerpoint)
      if (w === 'keynote' && o.failKeynote) throw new Error(o.failKeynote)
      if (cmd !== 'osascript' && o.failSoffice) throw new Error('soffice failed')
      if (!o.noOutput) made.add(OUT)
    }
  }
}

describe('argv', () => {
  it('passes paths as argv after the script', () => {
    for (const a of [
      keynoteArgs('/a b/x.pptx', '/o/x.pdf'),
      powerpointArgs('/a b/x.pptx', '/o/x.pdf')
    ]) {
      expect(a.slice(0, 1)).toEqual(['-e'])
      expect(a.slice(2)).toEqual(['/a b/x.pptx', '/o/x.pdf'])
      expect(a[1]).not.toContain('/a b/')
    }
    expect(sofficeArgs('/a.pptx', '/o')).toEqual([
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      '/o',
      '/a.pptx'
    ])
  })
  it('spots the Automation refusal', () => {
    expect(
      isAutomationDenied(new Error('execution error: Not authorized to send Apple events (-1743)'))
    ).toBe(true)
    expect(isAutomationDenied(new Error('boom'))).toBe(false)
  })
  it('exports with PowerPoint as PDF and only closes the presentation it opened', () => {
    expect(POWERPOINT_SCRIPT).toContain('tell application "Microsoft PowerPoint"')
    expect(POWERPOINT_SCRIPT).toContain('as save as PDF')
    expect(POWERPOINT_SCRIPT).toContain('close theDoc saving no')
    expect(POWERPOINT_SCRIPT).not.toMatch(/close (every|all)/)
  })
})

describe('convertPptxToPdf', () => {
  const go = (d: MacConvertDeps): Promise<string> => convertPptxToPdf('/in/Show.pptx', '/tmp/o', d)

  it('uses PowerPoint first when it is installed', async () => {
    const d = deps({ powerpoint: true, keynote: true, soffice: true })
    expect(await go(d)).toBe(OUT)
    expect(d.calls).toEqual(['powerpoint'])
  })
  it('falls back to Keynote, then LibreOffice, when PowerPoint fails', async () => {
    const d = deps({ powerpoint: true, keynote: true, soffice: true, failPowerpoint: 'x' })
    expect(await go(d)).toBe(OUT)
    expect(d.calls).toEqual(['powerpoint', 'keynote'])
    const e = deps({
      powerpoint: true,
      keynote: true,
      soffice: true,
      failPowerpoint: 'x',
      failKeynote: 'y'
    })
    expect(await go(e)).toBe(OUT)
    expect(e.calls).toEqual(['powerpoint', 'keynote', SOFFICE_PATHS[0]])
  })
  it('uses Keynote first when PowerPoint is missing', async () => {
    const d = deps({ keynote: true, soffice: true })
    expect(await go(d)).toBe(OUT)
    expect(d.calls).toEqual(['keynote'])
  })
  it('uses LibreOffice when PowerPoint and Keynote are missing', async () => {
    const d = deps({ soffice: true })
    expect(await go(d)).toBe(OUT)
    expect(d.calls).toEqual([SOFFICE_PATHS[0]])
  })
  it('falls back to LibreOffice when Keynote fails', async () => {
    const d = deps({ keynote: true, soffice: true, failKeynote: 'x (-1743)' })
    expect(await go(d)).toBe(OUT)
    expect(d.calls).toEqual(['keynote', SOFFICE_PATHS[0]])
  })
  it('uses PowerPoint alone when it is the only converter', async () => {
    const d = deps({ powerpoint: true })
    expect(await go(d)).toBe(OUT)
    expect(d.calls).toEqual(['powerpoint'])
  })
  it('says nothing is installed', async () => {
    await expect(go(deps({}))).rejects.toThrow(NO_MAC_CONVERTER)
    expect(NO_MAC_CONVERTER).toContain('PowerPoint')
  })
  it('says to allow Automation when denied and nothing else converts', async () => {
    await expect(
      go(deps({ keynote: true, failKeynote: 'Not authorized (-1743)' }))
    ).rejects.toThrow(KEYNOTE_DENIED)
    await expect(
      go(deps({ powerpoint: true, failPowerpoint: 'Not authorized (-1743)' }))
    ).rejects.toThrow(POWERPOINT_DENIED)
  })
  it('names PowerPoint when it was denied even if Keynote then failed for another reason', async () => {
    await expect(
      go(
        deps({
          powerpoint: true,
          keynote: true,
          failPowerpoint: 'Not authorized (-1743)',
          failKeynote: 'other'
        })
      )
    ).rejects.toThrow(POWERPOINT_DENIED)
  })
  it('reports a plain failure, also when no PDF appears', async () => {
    await expect(go(deps({ keynote: true, failKeynote: 'other' }))).rejects.toThrow(CONVERT_FAILED)
    await expect(go(deps({ soffice: true, noOutput: true }))).rejects.toThrow(CONVERT_FAILED)
    await expect(go(deps({ powerpoint: true, failPowerpoint: 'other' }))).rejects.toThrow(
      CONVERT_FAILED
    )
  })
})
