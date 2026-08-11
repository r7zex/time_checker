import { describe, expect, it } from 'vitest'
import { createGridCells, detailPointCount } from './grid'

describe('dense local grid', () => {
  const bounds = {
    southWest: [55.3, 36.7] as [number, number],
    northEast: [56.2, 38.8] as [number, number],
  }

  it('uses cells with 64 times less area', () => {
    expect(detailPointCount('fast')).toBe(55_296)
    expect(detailPointCount('balanced')).toBe(163_840)
    expect(detailPointCount('precise')).toBe(368_640)
  })

  it('covers the whole viewport without leaving its bounds', () => {
    const cells = createGridCells(bounds, 'fast')

    expect(cells).toHaveLength(55_296)
    expect(
      cells.every(({ coordinates: [latitude, longitude] }) =>
        latitude > bounds.southWest[0] &&
        latitude < bounds.northEast[0] &&
        longitude > bounds.southWest[1] &&
        longitude < bounds.northEast[1],
      ),
    ).toBe(true)
    expect(cells[0].cellBounds.southWest).toEqual(bounds.southWest)
    expect(cells.at(-1)?.cellBounds.northEast).toEqual(bounds.northEast)
    expect(
      cells[0].cellBounds.northEast[0] -
        cells[0].cellBounds.southWest[0],
    ).toBeCloseTo((bounds.northEast[0] - bounds.southWest[0]) / 192)
    expect(
      cells[0].cellBounds.northEast[1] -
        cells[0].cellBounds.southWest[1],
    ).toBeCloseTo((bounds.northEast[1] - bounds.southWest[1]) / 288)
  })
})
