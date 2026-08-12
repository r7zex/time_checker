import { describe, expect, it } from 'vitest'
import { combinedTravelMinutes } from './travel'

describe('multi-point travel aggregation', () => {
  it('uses the slowest selected point so every point fits the time limit', () => {
    expect(combinedTravelMinutes([40, 32])).toBe(40)
    expect(combinedTravelMinutes([18, 27, 21])).toBe(27)
  })

  it('returns zero when no point is selected', () => {
    expect(combinedTravelMinutes([])).toBe(0)
  })
})
