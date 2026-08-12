import type { Coordinates } from '../types'

export function updateSelectedPoints(
  current: readonly Coordinates[],
  coordinates: Coordinates,
  shouldAdd: boolean,
): Coordinates[] {
  if (shouldAdd || current.length === 0) return [...current, coordinates]
  return [coordinates, ...current.slice(1)]
}
