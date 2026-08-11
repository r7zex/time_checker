import { describe, expect, it } from 'vitest'
import {
  hasTrackConnection,
  METRO_OVERLAY_STATIONS,
  METRO_ROUTE_SEGMENTS,
} from './metro-overlay'

describe('current metro overlay', () => {
  it('contains the current ZIL extension in the official station order', () => {
    expect(METRO_OVERLAY_STATIONS.some((station) => station.name === 'ЗИЛ')).toBe(true)
    expect(hasTrackConnection('ЗИЛ', 'Крымская')).toBe(true)
    expect(hasTrackConnection('Крымская', 'Академическая')).toBe(true)
    expect(hasTrackConnection('Академическая', 'Вавиловская')).toBe(true)
    expect(hasTrackConnection('Вавиловская', 'Новаторская')).toBe(true)
  })

  it('never draws a direct ZIL–Tekhnopark track', () => {
    expect(hasTrackConnection('ЗИЛ', 'Технопарк')).toBe(false)
  })

  it('uses only track edges from the active metro snapshot', () => {
    expect(METRO_ROUTE_SEGMENTS).toHaveLength(261)
  })
})
