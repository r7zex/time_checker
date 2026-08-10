import type {
  Coordinates,
  DetailLevel,
  MapBounds,
  TravelSample,
} from '../types'

interface GridConfiguration {
  budget: number
  coverageGrid: [columns: number, rows: number]
  fallbackGrid: [columns: number, rows: number]
  focusSampleCount: number
}

const GRID_CONFIGURATION: Record<DetailLevel, GridConfiguration> = {
  fast: {
    budget: 12,
    coverageGrid: [4, 2],
    fallbackGrid: [4, 3],
    focusSampleCount: 4,
  },
  balanced: {
    budget: 24,
    coverageGrid: [4, 4],
    fallbackGrid: [6, 4],
    focusSampleCount: 8,
  },
  precise: {
    budget: 40,
    coverageGrid: [6, 4],
    fallbackGrid: [8, 5],
    focusSampleCount: 16,
  },
}

export function detailPointCount(detail: DetailLevel): number {
  return GRID_CONFIGURATION[detail].budget
}

function createRegularGrid(
  bounds: MapBounds,
  [columns, rows]: [number, number],
): Coordinates[] {
  const [south, west] = bounds.southWest
  const [north, east] = bounds.northEast
  const result: Coordinates[] = []

  for (let row = 0; row < rows; row += 1) {
    const latitude = south + ((north - south) * (row + 0.5)) / rows
    for (let column = 0; column < columns; column += 1) {
      const longitude = west + ((east - west) * (column + 0.5)) / columns
      result.push([latitude, longitude])
    }
  }

  return result
}

function viewportFocusRadiusKm(
  bounds: MapBounds,
  focus: Coordinates,
): number {
  const latitudeKm = 111.32
  const longitudeKm = latitudeKm * Math.cos((focus[0] * Math.PI) / 180)
  const heightKm = Math.abs(bounds.northEast[0] - bounds.southWest[0]) * latitudeKm
  const widthKm = Math.abs(bounds.northEast[1] - bounds.southWest[1]) * longitudeKm

  return Math.max(2, Math.min(60, Math.hypot(widthKm, heightKm) * 0.38))
}

function createFocusSpiral(
  focus: Coordinates,
  pointCount: number,
  maxRadiusKm: number,
): Coordinates[] {
  const latitudeKm = 111.32
  const longitudeKm = latitudeKm * Math.cos((focus[0] * Math.PI) / 180)
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))

  return Array.from({ length: pointCount }, (_, index) => {
    const progress = (index + 1) / (pointCount + 0.5)
    const radiusKm = maxRadiusKm * Math.pow(progress, 1.6)
    const angle = index * goldenAngle + Math.PI / 7
    return [
      focus[0] + (Math.sin(angle) * radiusKm) / latitudeKm,
      focus[1] + (Math.cos(angle) * radiusKm) / longitudeKm,
    ]
  })
}

function isInsideBounds(point: Coordinates, bounds: MapBounds): boolean {
  return (
    point[0] >= bounds.southWest[0] &&
    point[0] <= bounds.northEast[0] &&
    point[1] >= bounds.southWest[1] &&
    point[1] <= bounds.northEast[1]
  )
}

function uniquePoints(points: Coordinates[]): Coordinates[] {
  const seen = new Set<string>()
  return points.filter((point) => {
    const key = `${point[0].toFixed(6)}:${point[1].toFixed(6)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function createAnchorGrid(
  bounds: MapBounds,
  detail: DetailLevel,
  focus?: Coordinates,
): Coordinates[] {
  const configuration = GRID_CONFIGURATION[detail]
  if (!focus) return createRegularGrid(bounds, configuration.fallbackGrid)

  const focused = createFocusSpiral(
    focus,
    configuration.focusSampleCount,
    viewportFocusRadiusKm(bounds, focus),
  )
  const candidates = uniquePoints([
    ...focused.filter((point) => isInsideBounds(point, bounds)),
    ...createRegularGrid(bounds, configuration.coverageGrid),
    ...createRegularGrid(bounds, configuration.fallbackGrid),
  ])

  return candidates.slice(0, configuration.budget)
}

export function includeOriginSample(
  samples: TravelSample[],
  origin: Coordinates,
): TravelSample[] {
  const withoutOrigin = samples.filter(
    ({ coordinates }) =>
      Math.abs(coordinates[0] - origin[0]) > 1e-7 ||
      Math.abs(coordinates[1] - origin[1]) > 1e-7,
  )

  return [
    { coordinates: origin, minutes: 0, fromCache: false },
    ...withoutOrigin,
  ]
}

export function interpolateMinutes(
  pagePoint: [number, number],
  samples: Array<TravelSample & { page: [number, number] }>,
): number | null {
  if (samples.length === 0) return null

  const nearest: Array<{ sample: TravelSample; distanceSquared: number }> = []
  for (const sample of samples) {
    const dx = sample.page[0] - pagePoint[0]
    const dy = sample.page[1] - pagePoint[1]
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared < 4) return sample.minutes

    const insertAt = nearest.findIndex(
      (candidate) => distanceSquared < candidate.distanceSquared,
    )
    if (insertAt === -1) {
      if (nearest.length < 4) nearest.push({ sample, distanceSquared })
      continue
    }

    nearest.splice(insertAt, 0, { sample, distanceSquared })
    if (nearest.length > 4) nearest.pop()
  }

  let weightedMinutes = 0
  let totalWeight = 0

  for (const { sample, distanceSquared } of nearest) {
    const weight = 1 / Math.pow(distanceSquared, 1.05)
    weightedMinutes += sample.minutes * weight
    totalWeight += weight
  }

  return totalWeight === 0 ? null : weightedMinutes / totalWeight
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(items.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      output[index] = await worker(items[index], index)
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
  return output
}
