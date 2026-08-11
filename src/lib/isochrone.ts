import type { Coordinates, TravelSample } from '../types'
import type { GridSize } from './grid'

export interface IsochroneSegment {
  from: Coordinates
  to: Coordinates
}

export function createIsochroneBoundary(
  samples: TravelSample[],
  [columns, rows]: GridSize,
  targetMinutes: number,
): IsochroneSegment[] {
  if (samples.length !== columns * rows || samples.length === 0) return []

  const [south, west] = samples[0].cellBounds.southWest
  const [north, east] = samples.at(-1)!.cellBounds.northEast
  const latitudeStep = (north - south) / rows
  const longitudeStep = (east - west) / columns
  const inside = new Uint8Array(samples.length)
  const segments: IsochroneSegment[] = []

  for (let index = 0; index < samples.length; index += 1) {
    inside[index] = samples[index].minutes <= targetMinutes ? 1 : 0
  }

  for (let boundaryColumn = 1; boundaryColumn < columns; boundaryColumn += 1) {
    let runStart = -1
    for (let row = 0; row <= rows; row += 1) {
      const differs =
        row < rows &&
        inside[row * columns + boundaryColumn - 1] !==
          inside[row * columns + boundaryColumn]

      if (differs && runStart === -1) runStart = row
      if ((!differs || row === rows) && runStart !== -1) {
        const longitude = west + longitudeStep * boundaryColumn
        segments.push({
          from: [south + latitudeStep * runStart, longitude],
          to: [south + latitudeStep * row, longitude],
        })
        runStart = -1
      }
    }
  }

  for (let boundaryRow = 1; boundaryRow < rows; boundaryRow += 1) {
    let runStart = -1
    for (let column = 0; column <= columns; column += 1) {
      const differs =
        column < columns &&
        inside[(boundaryRow - 1) * columns + column] !==
          inside[boundaryRow * columns + column]

      if (differs && runStart === -1) runStart = column
      if ((!differs || column === columns) && runStart !== -1) {
        const latitude = south + latitudeStep * boundaryRow
        segments.push({
          from: [latitude, west + longitudeStep * runStart],
          to: [latitude, west + longitudeStep * column],
        })
        runStart = -1
      }
    }
  }

  return segments
}
