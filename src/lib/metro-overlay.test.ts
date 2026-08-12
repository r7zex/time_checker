import { describe, expect, it } from 'vitest'
import {
  hasTrackConnection,
  METRO_OVERLAY_STATIONS,
  METRO_ROUTE_SEGMENTS,
} from './metro-overlay'

describe('current metro overlay', () => {
  it('keeps the dark-blue line continuous through Myakinino', () => {
    expect(METRO_OVERLAY_STATIONS.some((station) => station.name === 'Мякинино')).toBe(
      true,
    )
    expect(hasTrackConnection('Строгино', 'Мякинино')).toBe(true)
    expect(hasTrackConnection('Мякинино', 'Волоколамская')).toBe(true)
    expect(
      METRO_OVERLAY_STATIONS.some((station) => station.name === 'Троице-Лыково'),
    ).toBe(false)
  })

  it('does not extend the light-blue line past Kuntsevskaya', () => {
    const obsoleteSegments = METRO_ROUTE_SEGMENTS.filter(
      (segment) =>
        segment.lineId === 'Q834540' &&
        ['Молодёжная', 'Крылатское'].some(
          (stationName) =>
            segment.fromName === stationName || segment.toName === stationName,
        ),
    )

    expect(obsoleteSegments).toHaveLength(0)
  })

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
    expect(METRO_ROUTE_SEGMENTS).toHaveLength(259)
  })

  it('keeps every active metro line in the visible overlay', () => {
    expect(new Set(METRO_ROUTE_SEGMENTS.map((segment) => segment.lineId))).toHaveLength(15)
  })

  it('renders ZIL like an ordinary station while keeping interchange labels', () => {
    expect(METRO_OVERLAY_STATIONS.find((station) => station.name === 'ЗИЛ')?.isKey).toBe(
      false,
    )
    expect(
      METRO_OVERLAY_STATIONS.some(
        (station) => station.name === 'Новаторская' && station.isKey,
      ),
    ).toBe(true)
  })
})
