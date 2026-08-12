import { describe, expect, it } from 'vitest'
import { findStation, metroDataStats } from './metro'
import { calculateTravelMinutes } from './travel'

const CENTRAL_TELEGRAPH = [55.758272, 37.611014] as [number, number]

describe('open Moscow metro graph', () => {
  it('contains the active network downloaded from Wikidata', () => {
    const stats = metroDataStats()

    expect(stats.stations).toBeGreaterThanOrEqual(260)
    expect(stats.trackEdges).toBeGreaterThanOrEqual(250)
    expect(stats.graphEdges).toBeGreaterThan(stats.trackEdges)
  })

  it('finds current stations used by the Central Telegraph scenario', () => {
    expect(findStation('Охотный Ряд')).not.toBeNull()
    expect(findStation('Театральная')).not.toBeNull()
    expect(findStation('Площадь Революции')).not.toBeNull()
  })

  it('uses the current passenger stations on the north-west blue section', () => {
    expect(findStation('Мякинино', 'Q626941')).not.toBeNull()
    expect(findStation('Троице-Лыково', 'Q626941')).toBeNull()
    expect(findStation('Молодёжная', 'Q834540')).toBeNull()
    expect(findStation('Крылатское', 'Q834540')).toBeNull()
  })

  it('uses the metro graph for a long cross-city trip', () => {
    const medvedkovo = findStation('Медведково')
    expect(medvedkovo).not.toBeNull()

    const walking = calculateTravelMinutes(
      CENTRAL_TELEGRAPH,
      medvedkovo!.coordinates,
      'walk',
    )
    const metro = calculateTravelMinutes(
      CENTRAL_TELEGRAPH,
      medvedkovo!.coordinates,
      'metro',
    )

    expect(metro).toBeLessThan(walking * 0.5)
    expect(metro).toBeGreaterThan(20)
    expect(metro).toBeLessThan(50)
  })

  it('keeps Central Telegraph control routes in plausible ranges', () => {
    const checks = [
      { station: 'Охотный Ряд', minimum: 2, maximum: 10 },
      { station: 'ВДНХ', minimum: 15, maximum: 35 },
      { station: 'Медведково', minimum: 20, maximum: 50 },
    ]

    for (const check of checks) {
      const station = findStation(check.station)
      expect(station, check.station).not.toBeNull()
      const minutes = calculateTravelMinutes(
        CENTRAL_TELEGRAPH,
        station!.coordinates,
        'metro',
      )
      expect(minutes, check.station).toBeGreaterThan(check.minimum)
      expect(minutes, check.station).toBeLessThan(check.maximum)
    }
  })

  it('keeps the selected Central Telegraph point at zero minutes', () => {
    expect(
      calculateTravelMinutes(CENTRAL_TELEGRAPH, CENTRAL_TELEGRAPH, 'metro'),
    ).toBe(0)
  })
})
