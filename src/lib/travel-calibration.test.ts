import { describe, expect, it } from 'vitest'
import { calculateTravelMinutes } from './travel'

const CENTRAL_TELEGRAPH = [55.758272, 37.611014] as [number, number]
const YELETSKAYA_16K3 = [55.606297, 37.731355] as [number, number]

const CONTROL_ROUTES = [
  {
    name: 'Ленинский проспект, 99 → Центральный телеграф',
    origin: [55.669387, 37.519446] as [number, number],
    destination: CENTRAL_TELEGRAPH,
    referenceMinutes: 41,
  },
  {
    name: 'Елецкая улица, 16к3 → Центральный телеграф',
    origin: YELETSKAYA_16K3,
    destination: CENTRAL_TELEGRAPH,
    referenceMinutes: 55,
  },
  {
    name: 'РУДН на Орджоникидзе → Елецкая улица, 16к3',
    origin: [55.71068, 37.603253] as [number, number],
    destination: YELETSKAYA_16K3,
    referenceMinutes: 66,
  },
]

describe('travel-time calibration against supplied reference routes', () => {
  for (const route of CONTROL_ROUTES) {
    it(`keeps ${route.name} within one minute of the reference`, () => {
      const actualMinutes = calculateTravelMinutes(
        route.origin,
        route.destination,
        'metro',
      )

      expect(
        Math.abs(Math.round(actualMinutes) - route.referenceMinutes),
      ).toBeLessThanOrEqual(1)
    })
  }
})
