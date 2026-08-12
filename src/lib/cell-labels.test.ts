import { describe, expect, it } from 'vitest'
import { cellLabelLines } from './cell-labels'

describe('multi-point cell labels', () => {
  const sample = { minutes: 40, pointMinutes: [40, 32] }

  it('shows the combined worst time and every selected point below it', () => {
    expect(cellLabelLines(sample, true)).toEqual([
      '40',
      '(Т1 40)',
      '(Т2 32)',
    ])
  })

  it('keeps a compact summary until the map is zoomed in enough', () => {
    expect(cellLabelLines(sample, false)).toEqual(['40'])
  })
})
