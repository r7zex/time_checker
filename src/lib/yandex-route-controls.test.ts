import { describe, expect, it } from 'vitest'
import controlsDocument from '../data/yandex-route-controls.json'
import type { Coordinates } from '../types'
import { calculateTravelMinutes } from './travel'

interface RouteAlternative {
  durationSeconds: number
  transportTypes: string[]
  metroOnlyVerified: boolean
}

interface RouteControl {
  id: string
  anchorId: string
  direction: 'from-anchor' | 'to-anchor'
  sector: string
  origin: { coordinates: Coordinates }
  destination: { coordinates: Coordinates }
  strictMetroMinutes: number
  strictMetroVerified: boolean
  alternatives: RouteAlternative[]
}

const controls = controlsDocument.controls as unknown as RouteControl[]

describe('saved Yandex strict-metro controls', () => {
  it('covers both anchors, six sectors and both directions', () => {
    expect(controls).toHaveLength(24)
    expect(new Set(controls.map((control) => control.anchorId))).toEqual(
      new Set(['central-telegraph', 'rudn-ordzhonikidze']),
    )
    expect(new Set(controls.map((control) => control.direction))).toEqual(
      new Set(['from-anchor', 'to-anchor']),
    )
    expect(new Set(controls.map((control) => control.sector)).size).toBe(6)
  })

  it('uses the shortest verified underground-only alternative', () => {
    for (const control of controls) {
      const strictAlternatives = control.alternatives.filter(
        (alternative) => alternative.metroOnlyVerified,
      )
      expect(strictAlternatives.length, control.id).toBeGreaterThan(0)
      for (const alternative of strictAlternatives) {
        expect(alternative.transportTypes, control.id).toEqual(['underground'])
      }
      const shortestSeconds = Math.min(
        ...strictAlternatives.map((alternative) => alternative.durationSeconds),
      )
      expect(control.strictMetroVerified, control.id).toBe(true)
      expect(control.strictMetroMinutes, control.id).toBeCloseTo(
        shortestSeconds / 60,
        2,
      )
    }
  })

  it('guards the current metro model against aggregate regressions', () => {
    const absoluteErrors = controls.map((control) => {
      const modelMinutes = calculateTravelMinutes(
        control.origin.coordinates,
        control.destination.coordinates,
        'metro',
      )
      return Math.abs(modelMinutes - control.strictMetroMinutes)
    })
    const meanAbsoluteError =
      absoluteErrors.reduce((sum, error) => sum + error, 0) /
      absoluteErrors.length

    expect(meanAbsoluteError).toBeLessThanOrEqual(3)
    expect(Math.max(...absoluteErrors)).toBeLessThanOrEqual(8)
  })
})
