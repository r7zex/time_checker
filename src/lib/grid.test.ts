import { describe, expect, it } from 'vitest'
import {
  createAnchorGrid,
  detailPointCount,
  includeOriginSample,
  interpolateMinutes,
  mapWithConcurrency,
} from './grid'

const CENTRAL_TELEGRAPH = [55.758272, 37.611014] as [number, number]

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

  it('adds close-range samples around the Central Telegraph', () => {
    const moscowBounds = {
      southWest: [55.58, 37.34] as [number, number],
      northEast: [55.91, 37.9] as [number, number],
    }
    const points = createAnchorGrid(moscowBounds, 'balanced', CENTRAL_TELEGRAPH)
    const localPoints = points.filter(([latitude, longitude]) => {
      const northKm = (latitude - CENTRAL_TELEGRAPH[0]) * 111.32
      const eastKm =
        (longitude - CENTRAL_TELEGRAPH[1]) *
        111.32 *
        Math.cos((CENTRAL_TELEGRAPH[0] * Math.PI) / 180)
      return Math.hypot(northKm, eastKm) <= 6.1
    })

    expect(points).toHaveLength(24)
    expect(localPoints.length).toBeGreaterThanOrEqual(8)
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

  it('keeps the selected Central Telegraph point at zero minutes', () => {
    const samples = includeOriginSample(
      [{ coordinates: [55.77, 37.63], minutes: 18, fromCache: false }],
      CENTRAL_TELEGRAPH,
    )
    const projected = samples.map((sample, index) => ({
      ...sample,
      page: index === 0 ? ([500, 500] as [number, number]) : ([650, 500] as [number, number]),
    }))

    expect(interpolateMinutes([500, 500], projected)).toBe(0)
  })

  it('uses nearby routes instead of averaging the whole map', () => {
    const nearby = [
      { coordinates: [0, 0] as [number, number], minutes: 0, fromCache: false, page: [0, 0] as [number, number] },
      { coordinates: [0, 0] as [number, number], minutes: 6, fromCache: false, page: [10, 0] as [number, number] },
      { coordinates: [0, 0] as [number, number], minutes: 6, fromCache: false, page: [0, 10] as [number, number] },
      { coordinates: [0, 0] as [number, number], minutes: 12, fromCache: false, page: [10, 10] as [number, number] },
    ]
    const distant = Array.from({ length: 20 }, (_, index) => ({
      coordinates: [0, 0] as [number, number],
      minutes: 90,
      fromCache: false,
      page: [20 + index, 20 + index] as [number, number],
    }))

    expect(interpolateMinutes([5, 5], [...nearby, ...distant])).toBeCloseTo(6)
  })
})

describe('bounded concurrency', () => {
  it('preserves input order', async () => {
    const result = await mapWithConcurrency([3, 1, 2], 2, async (value) => value * 2)
    expect(result).toEqual([6, 2, 4])
  })
})
