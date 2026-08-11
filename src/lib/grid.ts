import type { Coordinates, DetailLevel, MapBounds } from '../types'

interface GridCell {
  coordinates: Coordinates
  cellBounds: MapBounds
}

const CELL_SIDE_SCALE = 8

const GRID_SIZE: Record<DetailLevel, [columns: number, rows: number]> = {
  fast: [36 * CELL_SIDE_SCALE, 24 * CELL_SIDE_SCALE],
  balanced: [64 * CELL_SIDE_SCALE, 40 * CELL_SIDE_SCALE],
  precise: [96 * CELL_SIDE_SCALE, 60 * CELL_SIDE_SCALE],
}

export function detailPointCount(detail: DetailLevel): number {
  const [columns, rows] = GRID_SIZE[detail]
  return columns * rows
}

export function createGridCells(
  bounds: MapBounds,
  detail: DetailLevel,
): GridCell[] {
  const [columns, rows] = GRID_SIZE[detail]
  const [south, west] = bounds.southWest
  const [north, east] = bounds.northEast
  const latitudeStep = (north - south) / rows
  const longitudeStep = (east - west) / columns
  const cells: GridCell[] = []

  for (let row = 0; row < rows; row += 1) {
    const cellSouth = south + latitudeStep * row
    const cellNorth = cellSouth + latitudeStep
    for (let column = 0; column < columns; column += 1) {
      const cellWest = west + longitudeStep * column
      const cellEast = cellWest + longitudeStep
      cells.push({
        coordinates: [
          cellSouth + latitudeStep / 2,
          cellWest + longitudeStep / 2,
        ],
        cellBounds: {
          southWest: [cellSouth, cellWest],
          northEast: [cellNorth, cellEast],
        },
      })
    }
  }

  return cells
}
