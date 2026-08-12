import { describe, expect, it } from 'vitest'
import type { TravelSample } from '../types'
import { rgbForMinutes } from './colors'
import { createHeatPixelData } from './heat-raster'

function sample(minutes: number): TravelSample {
  return {
    coordinates: [0, 0],
    cellBounds: { southWest: [0, 0], northEast: [1, 1] },
    minutes,
    pointMinutes: [minutes],
    fromCache: false,
  }
}

describe('heat raster', () => {
  it('writes one opaque pixel per cell and flips south-to-north grid rows', () => {
    const pixels = createHeatPixelData(
      [sample(2), sample(5), sample(8), sample(11)],
      [2, 2],
    )

    expect([...pixels.slice(0, 3)]).toEqual([...rgbForMinutes(8)])
    expect([...pixels.slice(4, 7)]).toEqual([...rgbForMinutes(11)])
    expect([...pixels.slice(8, 11)]).toEqual([...rgbForMinutes(2)])
    expect([...pixels.slice(12, 15)]).toEqual([...rgbForMinutes(5)])
    expect([pixels[3], pixels[7], pixels[11], pixels[15]]).toEqual([
      255,
      255,
      255,
      255,
    ])
  })
})
