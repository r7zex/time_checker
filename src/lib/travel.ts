import type {
  Coordinates,
  DetailLevel,
  MapBounds,
  TransportMode,
  TravelSample,
} from '../types'
import { walkingMinutes } from './geo'
import { createGridCells } from './grid'
import { createMetroCostField, metroMinutesToPoint } from './metro'

export function calculateTravelMinutes(
  origin: Coordinates,
  destination: Coordinates,
  transport: TransportMode,
  stationCosts?: Float64Array,
): number {
  const directWalk = walkingMinutes(origin, destination)
  if (transport === 'walk') return directWalk

  const metroCosts = stationCosts ?? createMetroCostField(origin)
  return Math.min(directWalk, metroMinutesToPoint(destination, metroCosts))
}

export function combinedTravelMinutes(pointMinutes: readonly number[]): number {
  return pointMinutes.length === 0 ? 0 : Math.max(...pointMinutes)
}

export function calculateTravelSamples(
  points: readonly Coordinates[],
  bounds: MapBounds,
  detail: DetailLevel,
  transport: TransportMode,
): TravelSample[] {
  if (points.length === 0) return []

  const stationCosts = points.map((point) =>
    transport === 'metro' ? createMetroCostField(point) : undefined,
  )

  return createGridCells(bounds, detail).map(({ coordinates, cellBounds }) => {
    const pointMinutes = points.map((point, index) =>
      calculateTravelMinutes(
        point,
        coordinates,
        transport,
        stationCosts[index],
      ),
    )

    return {
      coordinates,
      cellBounds,
      minutes: combinedTravelMinutes(pointMinutes),
      pointMinutes,
      fromCache: false,
    }
  })
}

