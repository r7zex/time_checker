import { describe, expect, it } from 'vitest'
import type { MapBounds, TravelSample } from '../types'
import { createIsochroneBoundary } from './isochrone'

function samplesFor(values: number[][]): TravelSample[] {
  const rows = values.length
  const columns = values[0].length
  const samples: TravelSample[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cellBounds: MapBounds = {
        southWest: [row, column],
        northEast: [row + 1, column + 1],
      }
      samples.push({
        coordinates: [row + 0.5, column + 0.5],
        cellBounds,
        minutes: values[row][column],
        pointMinutes: [values[row][column]],
        fromCache: false,
      })
    }
  }

  return samples
}

describe('isochrone boundary', () => {
  it('draws only the outer boundary and omits internal cell borders', () => {
    const samples = samplesFor([
      [40, 40, 40],
      [40, 10, 40],
      [40, 40, 40],
    ])

    expect(createIsochroneBoundary(samples, [3, 3], 30)).toHaveLength(4)
  })

  it('keeps every disconnected zone', () => {
    const samples = samplesFor([
      [40, 40, 40, 40, 40],
      [40, 10, 40, 10, 40],
      [40, 40, 40, 40, 40],
    ])

    expect(createIsochroneBoundary(samples, [5, 3], 30)).toHaveLength(8)
  })

  it('does not outline the viewport when the whole grid is reachable', () => {
    const samples = samplesFor([
      [10, 10],
      [10, 10],
    ])

    expect(createIsochroneBoundary(samples, [2, 2], 30)).toEqual([])
  })
})
