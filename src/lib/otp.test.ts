import { describe, expect, it } from 'vitest'
import type { TravelTimeRaster } from './otp'
import {
  minutesFromTravelTimeRaster,
  travelSamplesFromRasters,
} from './otp'

function raster(seconds: number[]): TravelTimeRaster {
  return {
    bounds: [37, 55, 39, 57],
    width: 2,
    height: 2,
    seconds,
    noData: -1,
    coordinateSystem: 4326,
    rowIncreasesNorth: false,
    baselineSeconds: 0,
  }
}

describe('OpenTripPlanner travel-time surfaces', () => {
  it('samples the north-up GeoTIFF raster in minutes', () => {
    const surface = raster([60, 120, 180, 240])
    expect(minutesFromTravelTimeRaster(surface, [56.5, 37.5])).toBe(1)
    expect(minutesFromTravelTimeRaster(surface, [55.5, 38.5])).toBe(4)
  })

  it('handles OTP rasters whose row axis increases northward', () => {
    const surface = { ...raster([60, 120, 180, 240]), rowIncreasesNorth: true }
    expect(minutesFromTravelTimeRaster(surface, [55.5, 37.5])).toBe(1)
    expect(minutesFromTravelTimeRaster(surface, [56.5, 38.5])).toBe(4)
  })

  it('removes the sampling baseline introduced by the OTP surface renderer', () => {
    const surface = { ...raster([420, 480, 540, 600]), baselineSeconds: 420 }
    expect(minutesFromTravelTimeRaster(surface, [56.5, 37.5])).toBe(0)
    expect(minutesFromTravelTimeRaster(surface, [55.5, 38.5])).toBe(3)
  })

  it('caps missing and out-of-range pixels beyond the 120 minute boundary', () => {
    const surface = raster([-1, 999_999, 60, 60])
    expect(minutesFromTravelTimeRaster(surface, [56.5, 37.5])).toBe(121)
    expect(minutesFromTravelTimeRaster(surface, [56.5, 38.5])).toBe(121)
    expect(minutesFromTravelTimeRaster(surface, [54, 37.5])).toBe(121)
  })

  it('combines multiple points using the worst travel time', () => {
    const bounds = {
      southWest: [55, 37] as [number, number],
      northEast: [57, 39] as [number, number],
    }
    const samples = travelSamplesFromRasters(
      [raster([60, 60, 60, 60]), raster([180, 180, 180, 180])],
      bounds,
      'fast',
    )
    expect(samples[0].pointMinutes).toEqual([1, 3])
    expect(samples[0].minutes).toBe(3)
  })
})
