export type Coordinates = [latitude: number, longitude: number]

export type Direction = 'to' | 'from'

export type TransportMode =
  | 'metro'
  | 'walk'

export type DetailLevel = 'fast' | 'balanced' | 'precise'

export interface TravelSample {
  coordinates: Coordinates
  cellBounds: MapBounds
  minutes: number
  fromCache: boolean
}

export interface CalculationProgress {
  completed: number
  total: number
  apiRequests: number
  cached: number
}

export interface CalculationOptions {
  point: Coordinates
  direction: Direction
  transport: TransportMode
  detail: DetailLevel
}

export interface MapBounds {
  southWest: Coordinates
  northEast: Coordinates
}
