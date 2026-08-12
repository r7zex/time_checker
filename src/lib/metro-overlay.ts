import metroJson from '../data/metro.json'
import type { Coordinates } from '../types'

interface MetroLine {
  id: string
  name: string
  color: string
}

interface MetroStationRecord {
  id: string
  name: string
  coordinates: Coordinates
  lineIds: string[]
}

interface MetroEdgeRecord {
  from: string
  to: string
  lineId: string
}

interface MetroOverlayData {
  lines: MetroLine[]
  stations: MetroStationRecord[]
  edges: MetroEdgeRecord[]
}

export interface MetroOverlayStation extends MetroStationRecord {
  color: string
  isKey: boolean
}

export interface MetroRouteSegment {
  from: Coordinates
  to: Coordinates
  fromName: string
  toName: string
  lineId: string
  color: string
}

const data = metroJson as unknown as MetroOverlayData
const lineById = new Map(data.lines.map((line) => [line.id, line]))
const stationById = new Map(data.stations.map((station) => [station.id, station]))
const stationNameCount = new Map<string, number>()
const trackDegree = new Map<string, number>()

for (const station of data.stations) {
  stationNameCount.set(station.name, (stationNameCount.get(station.name) ?? 0) + 1)
}

for (const edge of data.edges) {
  trackDegree.set(edge.from, (trackDegree.get(edge.from) ?? 0) + 1)
  trackDegree.set(edge.to, (trackDegree.get(edge.to) ?? 0) + 1)
}

function stationPair(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`
}

const FORBIDDEN_TRACK_PAIRS = new Set([stationPair('ЗИЛ', 'Технопарк')])

export const METRO_OVERLAY_STATIONS: readonly MetroOverlayStation[] = data.stations.map(
  (station) => ({
    ...station,
    color: lineById.get(station.lineIds[0])?.color ?? '#65718a',
    isKey:
      station.name !== 'ЗИЛ' &&
      ((stationNameCount.get(station.name) ?? 0) > 1 ||
        (trackDegree.get(station.id) ?? 0) <= 1),
  }),
)

export const METRO_ROUTE_SEGMENTS: readonly MetroRouteSegment[] = data.edges.flatMap(
  (edge) => {
    const from = stationById.get(edge.from)
    const to = stationById.get(edge.to)
    const line = lineById.get(edge.lineId)
    if (!from || !to || !line) return []
    if (FORBIDDEN_TRACK_PAIRS.has(stationPair(from.name, to.name))) return []

    return [
      {
        from: from.coordinates,
        to: to.coordinates,
        fromName: from.name,
        toName: to.name,
        lineId: edge.lineId,
        color: line.color,
      },
    ]
  },
)

export function hasTrackConnection(leftName: string, rightName: string): boolean {
  const expected = stationPair(leftName, rightName)
  return METRO_ROUTE_SEGMENTS.some(
    (segment) => stationPair(segment.fromName, segment.toName) === expected,
  )
}
