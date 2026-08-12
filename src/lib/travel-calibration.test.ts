import { describe, expect, it } from 'vitest'
import { calculateTravelMinutes } from './travel'

const CENTRAL_TELEGRAPH = [55.758272, 37.611014] as [number, number]

const CONTROL_ROUTES = [
  {
    name: 'Ленинский проспект, 99',
    coordinates: [55.669387, 37.519446] as [number, number],
    referenceMinutes: 41,
  },
  {
    name: 'Елецкая улица, 16к3',
    coordinates: [55.606297, 37.731355] as [number, number],
    referenceMinutes: 55,
  },
]

describe('travel-time calibration against supplied reference routes', () => {
  for (const route of CONTROL_ROUTES) {
    it(`keeps ${route.name} within one minute of the reference`, () => {
      const actualMinutes = calculateTravelMinutes(
        route.coordinates,
        CENTRAL_TELEGRAPH,
        'metro',
      )

      expect(
        Math.abs(Math.round(actualMinutes) - route.referenceMinutes),
      ).toBeLessThanOrEqual(1)
    })
  }
})
