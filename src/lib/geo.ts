import type { Coordinates } from '../types'

const EARTH_RADIUS_KM = 6_371
const WALKING_SPEED_KMH = 5
const PEDESTRIAN_DETOUR_FACTOR = 1.22

export function distanceKm(from: Coordinates, to: Coordinates): number {
  const toRadians = Math.PI / 180
  const fromLatitude = from[0] * toRadians
  const toLatitude = to[0] * toRadians
  const latitudeDelta = (to[0] - from[0]) * toRadians
  const longitudeDelta = (to[1] - from[1]) * toRadians

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2

  return (
    EARTH_RADIUS_KM *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  )
}

export function walkingMinutes(from: Coordinates, to: Coordinates): number {
  return (
    (distanceKm(from, to) * PEDESTRIAN_DETOUR_FACTOR * 60) /
    WALKING_SPEED_KMH
  )
}

