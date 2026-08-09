import type {
  Coordinates,
  DetailLevel,
  MapBounds,
  TravelSample,
} from '../types'

const GRID_SIZE: Record<DetailLevel, [columns: number, rows: number]> = {
  fast: [4, 3],
  balanced: [6, 4],
  precise: [8, 5],
}

export function detailPointCount(detail: DetailLevel): number {
  const [columns, rows] = GRID_SIZE[detail]
  return columns * rows
}

export function createAnchorGrid(
  bounds: MapBounds,
  detail: DetailLevel,
): Coordinates[] {
  const [columns, rows] = GRID_SIZE[detail]
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

export function interpolateMinutes(
  pagePoint: [number, number],
  samples: Array<TravelSample & { page: [number, number] }>,
): number | null {
  if (samples.length === 0) return null

  let weightedMinutes = 0
  let totalWeight = 0

  for (const sample of samples) {
    const dx = sample.page[0] - pagePoint[0]
    const dy = sample.page[1] - pagePoint[1]
    const distanceSquared = dx * dx + dy * dy

    if (distanceSquared < 4) return sample.minutes

    const weight = 1 / Math.pow(distanceSquared, 0.9)
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
