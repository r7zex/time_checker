import { describe, expect, it } from 'vitest'
import { HEAT_BANDS, heatBandForMinutes } from './colors'

describe('three-minute heat bands', () => {
  it('uses three-minute boundaries through one hour', () => {
    expect(HEAT_BANDS.map(({ maxMinutes }) => maxMinutes)).toEqual([
      3,
      6,
      9,
      12,
      15,
      18,
      21,
      24,
      27,
      30,
      33,
      36,
      39,
      42,
      45,
      48,
      51,
      54,
      57,
      60,
      Number.POSITIVE_INFINITY,
    ])
  })

  it('moves into the next band immediately after a boundary', () => {
    expect(heatBandForMinutes(3).label).toBe('0–3')
    expect(heatBandForMinutes(3.01).label).toBe('3–6')
    expect(heatBandForMinutes(60.01).label).toBe('60+')
  })
})
