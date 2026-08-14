import { fromArrayBuffer } from 'geotiff'
import type {
  Coordinates,
  DetailLevel,
  Direction,
  MapBounds,
  TransportMode,
  TravelSample,
} from '../types'
import { createGridCells } from './grid'
import {
  calculateTravelSamples,
  combinedTravelMinutes,
} from './travel'

export const OTP_CUTOFF_MINUTES = 120
const UNREACHABLE_MINUTES = OTP_CUTOFF_MINUTES + 1

export interface TravelTimeRaster {
  bounds: [west: number, south: number, east: number, north: number]
  width: number
  height: number
  seconds: ArrayLike<number>
  noData: number | null
  coordinateSystem: number | null
  rowIncreasesNorth: boolean
  baselineSeconds: number
}

interface CalculateOtpOptions {
  points: readonly Coordinates[]
  bounds: MapBounds
  detail: DetailLevel
  direction: Direction
  transport: Exclude<TransportMode, 'walk'>
  onSurface?: (completed: number, total: number) => void
}

function smoothStep(start: number, end: number, value: number): number {
  const progress = Math.min(1, Math.max(0, (value - start) / (end - start)))
  return progress * progress * (3 - 2 * progress)
}

function mix(from: number, to: number, weight: number): number {
  return from + (to - from) * weight
}

function webMercator([latitude, longitude]: Coordinates): [number, number] {
  const earthRadius = 6378137
  const safeLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude))
  return [
    earthRadius * (longitude * Math.PI / 180),
    earthRadius * Math.log(Math.tan(Math.PI / 4 + safeLatitude * Math.PI / 360)),
  ]
}

function rasterCoordinate(
  coordinates: Coordinates,
  coordinateSystem: number | null,
): [x: number, y: number] {
  if (coordinateSystem === 3857) return webMercator(coordinates)
  return [coordinates[1], coordinates[0]]
}

export function minutesFromTravelTimeRaster(
  raster: TravelTimeRaster,
  coordinates: Coordinates,
): number {
  const [x, y] = rasterCoordinate(coordinates, raster.coordinateSystem)
  const [west, south, east, north] = raster.bounds
  if (x < west || x >= east || y < south || y >= north) return UNREACHABLE_MINUTES

  const column = Math.floor(((x - west) / (east - west)) * raster.width)
  const row = Math.floor(
    (raster.rowIncreasesNorth
      ? (y - south) / (north - south)
      : (north - y) / (north - south)) * raster.height,
  )
  if (column < 0 || column >= raster.width || row < 0 || row >= raster.height) {
    return UNREACHABLE_MINUTES
  }

  const rawSeconds = Number(raster.seconds[row * raster.width + column])
  if (
    !Number.isFinite(rawSeconds) ||
    rawSeconds < 0 ||
    rawSeconds > OTP_CUTOFF_MINUTES * 60 + raster.baselineSeconds ||
    (raster.noData !== null && rawSeconds === raster.noData)
  ) {
    return UNREACHABLE_MINUTES
  }
  return Math.max(0, rawSeconds - raster.baselineSeconds) / 60
}

/**
 * OTP 2.4's one-to-many renderer optimizes a single generalized-cost state per
 * raster cell. With synthetic frequency trips this can retain either a slower
 * state after a transfer or an unrealistically fast isolated state away from a
 * station. Cross-checking it against the calibrated metro field removes both
 * artifacts. Faster OSM bus/tram routes remain untouched in the full-transit
 * mode. All transitions are continuous: the previous hard four-minute
 * threshold could make adjacent cells jump by six minutes when their
 * differences straddled that threshold.
 */
export function calibrateOtpMinutes(
  otpMinutes: number,
  metroModelMinutes: number,
  transport: Exclude<TransportMode, 'walk'> = 'metro',
): number {
  if (otpMinutes > OTP_CUTOFF_MINUTES || metroModelMinutes > OTP_CUTOFF_MINUTES) {
    return otpMinutes
  }

  const difference = otpMinutes - metroModelMinutes
  // A street-aware OTP result may be slower because of entrances, crossings,
  // and barriers, but an isolated raster state must not undercut the stable
  // metro graph at the same coordinate. Using the graph as the metro-mode
  // floor removes the off-station low-time islands without flattening real
  // walking penalties. Full transit can still legitimately beat the metro
  // graph by using a bus or tram.
  if (transport === 'metro' && difference < 0) return metroModelMinutes
  if (difference <= -2) return otpMinutes

  const average = (otpMinutes + metroModelMinutes) / 2
  const centralEstimate = mix(
    otpMinutes,
    average,
    smoothStep(-2, 0, difference),
  )

  // The supplied control routes below 50 minutes need the small systematic
  // offset retained by the old calibration. Fade it in by both route length
  // and model difference so crossing either value cannot create a seam.
  const shortRouteWeight = 1 - smoothStep(44, 54, metroModelMinutes)
  const shortRouteEstimate = mix(
    centralEstimate,
    otpMinutes + 2,
    smoothStep(0, 3.5, difference),
  )
  const moderateDifferenceEstimate = mix(
    centralEstimate,
    shortRouteEstimate,
    shortRouteWeight,
  )

  // As the OTP/model discrepancy grows, smoothly prefer the stable metro
  // field. Short routes get a wider transition because two minutes matter
  // much more there and were the source of the visible isolated pits.
  const correctionStart = mix(2, 3.5, shortRouteWeight)
  const correctionEnd = mix(4.5, 6, shortRouteWeight)
  return mix(
    moderateDifferenceEstimate,
    metroModelMinutes,
    smoothStep(correctionStart, correctionEnd, difference),
  )
}

export function otpModesForTransport(
  transport: Exclude<TransportMode, 'walk'>,
): string {
  return transport === 'metro'
    ? 'WALK,SUBWAY'
    : 'WALK,SUBWAY,BUS,TRAM'
}

export function travelSamplesFromRasters(
  rasters: readonly TravelTimeRaster[],
  bounds: MapBounds,
  detail: DetailLevel,
  metroModelSamples?: readonly TravelSample[],
  transport: Exclude<TransportMode, 'walk'> = 'metro',
): TravelSample[] {
  return createGridCells(bounds, detail).map(({ coordinates, cellBounds }, sampleIndex) => {
    const rawPointMinutes = rasters.map((raster) =>
      minutesFromTravelTimeRaster(raster, coordinates),
    )
    const modelPointMinutes = metroModelSamples?.[sampleIndex]?.pointMinutes
    const pointMinutes = modelPointMinutes?.length === rawPointMinutes.length
      ? rawPointMinutes.map((minutes, pointIndex) =>
          calibrateOtpMinutes(
            minutes,
            modelPointMinutes[pointIndex],
            transport,
          ))
      : rawPointMinutes
    return {
      coordinates,
      cellBounds,
      minutes: combinedTravelMinutes(pointMinutes),
      pointMinutes,
      fromCache: false,
    }
  })
}

async function fetchTravelTimeRaster(
  point: Coordinates,
  direction: Direction,
  transport: Exclude<TransportMode, 'walk'>,
): Promise<TravelTimeRaster> {
  const url = new URL('/otp/traveltime/surface', window.location.origin)
  url.searchParams.set('batch', 'true')
  url.searchParams.set('location', `${point[0]},${point[1]}`)
  url.searchParams.set('modes', otpModesForTransport(transport))
  // The generated frequency timetable has an identical trip in each direction.
  // OTP 2.4's reverse travel-time surface is not stable for frequency-based
  // trips, so a forward surface represents both UI directions without that
  // artificial offset.
  void direction
  url.searchParams.set('arriveBy', 'false')
  url.searchParams.set('cutoff', `PT${OTP_CUTOFF_MINUTES}M`)

  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw new Error(
      'OpenTripPlanner недоступен. Запустите `npm run otp:serve` и повторите расчёт.',
    )
  }
  if (!response.ok) {
    const details = (await response.text()).slice(0, 240)
    throw new Error(
      `OpenTripPlanner вернул ${response.status}${details ? `: ${details}` : ''}`,
    )
  }

  try {
    const tiff = await fromArrayBuffer(await response.arrayBuffer())
    const image = await tiff.getImage()
    const values = await image.readRasters({ interleave: true })
    const geoKeys = image.getGeoKeys()
    const [west, south, east, north] = image.getBoundingBox()
    let baselineSeconds = Number.POSITIVE_INFINITY
    for (let index = 0; index < values.length; index += 1) {
      const value = Number(values[index])
      if (value >= 0 && value < baselineSeconds) baselineSeconds = value
    }
    return {
      bounds: [west, south, east, north],
      width: image.getWidth(),
      height: image.getHeight(),
      seconds: values as ArrayLike<number>,
      noData: image.getGDALNoData(),
      coordinateSystem:
        geoKeys.ProjectedCSTypeGeoKey ?? geoKeys.GeographicTypeGeoKey ?? null,
      // OTP writes the northernmost sampled cells into the first raster row.
      rowIncreasesNorth: false,
      baselineSeconds: Number.isFinite(baselineSeconds) ? baselineSeconds : 0,
    }
  } catch {
    throw new Error('OpenTripPlanner вернул повреждённую travel-time surface.')
  }
}

export async function calculateOtpTravelSamples({
  points,
  bounds,
  detail,
  direction,
  transport,
  onSurface,
}: CalculateOtpOptions): Promise<TravelSample[]> {
  const rasters: TravelTimeRaster[] = []
  for (const point of points) {
    rasters.push(await fetchTravelTimeRaster(point, direction, transport))
    onSurface?.(rasters.length, points.length)
  }
  const metroModelSamples = calculateTravelSamples(points, bounds, detail, 'metro')
  return travelSamplesFromRasters(
    rasters,
    bounds,
    detail,
    metroModelSamples,
    transport,
  )
}
