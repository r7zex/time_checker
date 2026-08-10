import { describe, expect, it } from 'vitest'
import { HEAT_BANDS, heatBandForMinutes } from './colors'

describe('six-minute heat bands', () => {
  it('uses six-minute boundaries through one hour', () => {
    expect(HEAT_BANDS.map(({ maxMinutes }) => maxMinutes)).toEqual([
      6,
      12,
      18,
      24,
      30,
      36,
      42,
      48,
      54,
      60,
      Number.POSITIVE_INFINITY,
    ])
  })

  it('moves into the next band immediately after a boundary', () => {
    expect(heatBandForMinutes(6).label).toBe('0–6')
    expect(heatBandForMinutes(6.01).label).toBe('6–12')
    expect(heatBandForMinutes(60.01).label).toBe('60+')
  })
})
