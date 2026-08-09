import { describe, expect, it } from 'vitest'
import { createAnchorGrid, detailPointCount, interpolateMinutes, mapWithConcurrency } from './grid'

describe('anchor grid', () => {
  const bounds = {
    southWest: [55, 37] as [number, number],
    northEast: [56, 38] as [number, number],
  }

  it('keeps the advertised request budgets', () => {
    expect(detailPointCount('fast')).toBe(12)
    expect(detailPointCount('balanced')).toBe(24)
    expect(detailPointCount('precise')).toBe(40)
  })

  it('places all anchors inside the viewport', () => {
    const points = createAnchorGrid(bounds, 'balanced')
    expect(points).toHaveLength(24)
    expect(points.every(([lat, lon]) => lat > 55 && lat < 56 && lon > 37 && lon < 38)).toBe(true)
  })
})

describe('interpolation', () => {
  it('returns the exact value at an anchor', () => {
    const result = interpolateMinutes([10, 10], [
      { coordinates: [55, 37], minutes: 20, fromCache: false, page: [10, 10] },
      { coordinates: [56, 38], minutes: 80, fromCache: false, page: [100, 100] },
    ])
    expect(result).toBe(20)
  })
})

describe('bounded concurrency', () => {
  it('preserves input order', async () => {
    const result = await mapWithConcurrency([3, 1, 2], 2, async (value) => value * 2)
    expect(result).toEqual([6, 2, 4])
  })
})
