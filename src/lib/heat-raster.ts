import type { TravelSample } from '../types'
import { rgbForMinutes } from './colors'
import type { GridSize } from './grid'

export function createHeatPixelData(
  samples: TravelSample[],
  [columns, rows]: GridSize,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(columns * rows * 4)
  if (samples.length !== columns * rows) return pixels

  for (let index = 0; index < samples.length; index += 1) {
    const row = Math.floor(index / columns)
    const column = index - row * columns
    const pixel = ((rows - row - 1) * columns + column) * 4
    const [red, green, blue] = rgbForMinutes(samples[index].minutes)
    pixels[pixel] = red
    pixels[pixel + 1] = green
    pixels[pixel + 2] = blue
    pixels[pixel + 3] = 255
  }

  return pixels
}
