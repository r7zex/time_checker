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

export function calculateTravelSamples(
  origin: Coordinates,
  bounds: MapBounds,
  detail: DetailLevel,
  transport: TransportMode,
): TravelSample[] {
  const stationCosts =
    transport === 'metro' ? createMetroCostField(origin) : undefined

  return createGridCells(bounds, detail).map(({ coordinates, cellBounds }) => ({
    coordinates,
    cellBounds,
    minutes: calculateTravelMinutes(
      origin,
      coordinates,
      transport,
      stationCosts,
    ),
    fromCache: false,
  }))
}

