import { describe, expect, it } from 'vitest'
import { updateSelectedPoints } from './point-selection'

const FIRST = [55.758272, 37.611014] as [number, number]
const SECOND = [55.8, 37.68] as [number, number]
const REPLACEMENT = [55.72, 37.55] as [number, number]

describe('map point selection modes', () => {
  it('keeps existing points when add mode is active', () => {
    expect(updateSelectedPoints([FIRST], SECOND, true)).toEqual([FIRST, SECOND])
  })

  it('replaces only point 1 during a regular map click', () => {
    expect(updateSelectedPoints([FIRST, SECOND], REPLACEMENT, false)).toEqual([
      REPLACEMENT,
      SECOND,
    ])
  })
})
