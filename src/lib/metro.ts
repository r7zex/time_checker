import metroJson from '../data/metro.json'
import type { Coordinates } from '../types'
import { distanceKm, walkingMinutes } from './geo'

interface MetroStation {
  id: string
  name: string
  coordinates: Coordinates
  lineIds: string[]
}

interface MetroEdge {
  from: string
  to: string
  lineId: string
}

interface MetroData {
  stations: MetroStation[]
  edges: MetroEdge[]
}

interface GraphEdge {
  stationIndex: number
  minutes: number
}

const TRAIN_SPEED_KMH = 41
const TRAIN_WAIT_MINUTES = 1.5
const STATION_ENTRY_MINUTES = 2.5
const STATION_EXIT_MINUTES = 2
const MAX_AUTOMATIC_TRANSFER_KM = 0.35
const MAX_SAME_NAME_TRANSFER_KM = 0.65
const MIN_TRANSFER_WALK_MINUTES = 6

const NON_TRANSFER_NAMES = new Set(['Арбатская', 'Смоленская'])
const EXPLICIT_TRANSFER_PAIRS = new Set([
  'Деловой центр|Москва-Сити',
  'Площадь Революции|Театральная',
])

const metroData = metroJson as unknown as MetroData
const stationIndexById = new Map(
  metroData.stations.map((station, index) => [station.id, index]),
)

function pairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`
}

function sharesLine(left: MetroStation, right: MetroStation): boolean {
  return left.lineIds.some((lineId) => right.lineIds.includes(lineId))
}

function isTransfer(
  left: MetroStation,
  right: MetroStation,
  distance: number,
): boolean {
  if (sharesLine(left, right)) return false

  if (left.name === right.name) {
    return (
      !NON_TRANSFER_NAMES.has(left.name) &&
      distance <= MAX_SAME_NAME_TRANSFER_KM
    )
  }

  return (
    distance <= MAX_AUTOMATIC_TRANSFER_KM ||
    EXPLICIT_TRANSFER_PAIRS.has(pairKey(left.name, right.name))
  )
}

function addUndirectedEdge(
  graph: GraphEdge[][],
  from: number,
  to: number,
  minutes: number,
) {
  graph[from].push({ stationIndex: to, minutes })
  graph[to].push({ stationIndex: from, minutes })
}

function buildGraph(): GraphEdge[][] {
  const graph = metroData.stations.map(() => [] as GraphEdge[])

  for (const edge of metroData.edges) {
    const from = stationIndexById.get(edge.from)
    const to = stationIndexById.get(edge.to)
    if (from === undefined || to === undefined) continue

    const trackDistance = distanceKm(
      metroData.stations[from].coordinates,
      metroData.stations[to].coordinates,
    )
    const minutes = Math.max(1.5, (trackDistance * 60) / TRAIN_SPEED_KMH)
    addUndirectedEdge(graph, from, to, minutes)
  }

  for (let leftIndex = 0; leftIndex < metroData.stations.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < metroData.stations.length;
      rightIndex += 1
    ) {
      const left = metroData.stations[leftIndex]
      const right = metroData.stations[rightIndex]
      const transferDistance = distanceKm(left.coordinates, right.coordinates)
      if (!isTransfer(left, right, transferDistance)) continue

      const minutes = Math.max(
        MIN_TRANSFER_WALK_MINUTES,
        walkingMinutes(left.coordinates, right.coordinates) + 2,
      ) + TRAIN_WAIT_MINUTES
      addUndirectedEdge(graph, leftIndex, rightIndex, minutes)
    }
  }

  return graph
}

const graph = buildGraph()

function nextUnvisited(costs: Float64Array, visited: Uint8Array): number {
  let bestIndex = -1
  let bestCost = Number.POSITIVE_INFINITY

  for (let index = 0; index < costs.length; index += 1) {
    if (!visited[index] && costs[index] < bestCost) {
      bestIndex = index
      bestCost = costs[index]
    }
  }

  return bestIndex
}

export function createMetroCostField(origin: Coordinates): Float64Array {
  const costs = new Float64Array(metroData.stations.length)
  const visited = new Uint8Array(metroData.stations.length)

  for (let index = 0; index < metroData.stations.length; index += 1) {
    costs[index] =
      walkingMinutes(origin, metroData.stations[index].coordinates) +
      STATION_ENTRY_MINUTES +
      TRAIN_WAIT_MINUTES
  }

  for (let step = 0; step < metroData.stations.length; step += 1) {
    const current = nextUnvisited(costs, visited)
    if (current === -1) break
    visited[current] = 1

    for (const edge of graph[current]) {
      const candidate = costs[current] + edge.minutes
      if (candidate < costs[edge.stationIndex]) {
        costs[edge.stationIndex] = candidate
      }
    }
  }

  return costs
}

export function metroMinutesToPoint(
  destination: Coordinates,
  stationCosts: Float64Array,
): number {
  let best = Number.POSITIVE_INFINITY

  for (let index = 0; index < metroData.stations.length; index += 1) {
    const total =
      stationCosts[index] +
      STATION_EXIT_MINUTES +
      walkingMinutes(metroData.stations[index].coordinates, destination)
    if (total < best) best = total
  }

  return best
}

export function metroDataStats() {
  return {
    stations: metroData.stations.length,
    trackEdges: metroData.edges.length,
    graphEdges: graph.reduce((total, edges) => total + edges.length, 0) / 2,
  }
}

export function findStation(name: string, lineId?: string): MetroStation | null {
  return (
    metroData.stations.find(
      (station) =>
        station.name === name &&
        (lineId === undefined || station.lineIds.includes(lineId)),
    ) ?? null
  )
}
