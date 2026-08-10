import { describe, expect, it } from 'vitest'
import { createGridCells, detailPointCount } from './grid'

describe('dense local grid', () => {
  const bounds = {
    southWest: [55.3, 36.7] as [number, number],
    northEast: [56.2, 38.8] as [number, number],
  }

  it('uses hundreds or thousands of locally calculated cells', () => {
    expect(detailPointCount('fast')).toBe(864)
    expect(detailPointCount('balanced')).toBe(2_560)
    expect(detailPointCount('precise')).toBe(5_760)
  })

  it('covers the whole viewport without leaving its bounds', () => {
    const cells = createGridCells(bounds, 'balanced')

    expect(cells).toHaveLength(2_560)
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
  })
})

