import { mkdir, writeFile } from 'node:fs/promises'
import { zipSync, strToU8 } from 'fflate'
import metroJson from '../src/data/metro.json' with { type: 'json' }

const OUTPUT_DIRECTORY = new URL('../otp/data/', import.meta.url)
const OUTPUT = new URL('moscow-metro.gtfs.zip', OUTPUT_DIRECTORY)
const TRAIN_SPEED_KMH = 41
const MIN_EDGE_SECONDS = 105
const ACCELERATION_SECONDS = 10
const DWELL_SECONDS = 5
const HEADWAY_SECONDS = 180
const MIN_TRANSFER_SECONDS = 6 * 60

const NON_TRANSFER_NAMES = new Set(['Арбатская', 'Смоленская'])
const EXPLICIT_TRANSFER_PAIRS = new Set([
  'Деловой центр|Москва-Сити',
  'Площадь Революции|Театральная',
])
const CALIBRATED_TRANSFERS = new Map([
  ['Каховская|Севастопольская', 150],
])

function csvCell(value) {
  const valueAsText = String(value ?? '')
  return /[",\r\n]/.test(valueAsText)
    ? `"${valueAsText.replaceAll('"', '""')}"`
    : valueAsText
}

function csv(headers, rows) {
  return `${[
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n')}\n`
}

function distanceKm(left, right) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const [leftLat, leftLon] = left
  const [rightLat, rightLon] = right
  const latitudeDelta = toRadians(rightLat - leftLat)
  const longitudeDelta = toRadians(rightLon - leftLon)
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(leftLat)) *
      Math.cos(toRadians(rightLat)) *
      Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

function walkingSeconds(left, right) {
  return Math.round((distanceKm(left, right) * 1.22 * 3600) / 5)
}

function pairKey(left, right) {
  return left < right ? `${left}|${right}` : `${right}|${left}`
}

function formatGtfsTime(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return [hours, minutes, seconds % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

function connectedComponents(stationIds, adjacency) {
  const remaining = new Set(stationIds)
  const components = []
  while (remaining.size) {
    const first = remaining.values().next().value
    const queue = [first]
    const component = []
    remaining.delete(first)
    while (queue.length) {
      const current = queue.shift()
      component.push(current)
      for (const next of adjacency.get(current) ?? []) {
        if (!remaining.delete(next)) continue
        queue.push(next)
      }
    }
    components.push(component)
  }
  return components
}

function pathBetween(from, to, adjacency) {
  const queue = [from]
  const previous = new Map([[from, null]])
  while (queue.length) {
    const current = queue.shift()
    if (current === to) break
    for (const next of adjacency.get(current) ?? []) {
      if (previous.has(next)) continue
      previous.set(next, current)
      queue.push(next)
    }
  }
  if (!previous.has(to)) throw new Error(`No metro path between ${from} and ${to}`)
  const path = []
  for (let current = to; current; current = previous.get(current)) path.push(current)
  return path.reverse()
}

function linePaths(line, stations, edges) {
  const stationIds = stations
    .filter((station) => station.lineIds.includes(line.id))
    .map((station) => station.id)
  const adjacency = new Map(stationIds.map((id) => [id, []]))
  for (const edge of edges.filter((candidate) => candidate.lineId === line.id)) {
    adjacency.get(edge.from)?.push(edge.to)
    adjacency.get(edge.to)?.push(edge.from)
  }

  if (line.id === 'Q834540') {
    const stationByName = new Map(stations.map((station) => [station.name, station.id]))
    return [
      pathBetween(
        stationByName.get('Александровский сад'),
        stationByName.get('Кунцевская'),
        adjacency,
      ),
      pathBetween(
        stationByName.get('Киевская'),
        stationByName.get('Москва-Сити'),
        adjacency,
      ),
    ]
  }

  const component = connectedComponents(stationIds, adjacency)
    .sort((left, right) => right.length - left.length)[0]
  const endpoints = component.filter((id) => adjacency.get(id)?.length === 1)
  if (endpoints.length === 2) return [pathBetween(endpoints[0], endpoints[1], adjacency)]

  if (endpoints.length === 0 && component.every((id) => adjacency.get(id)?.length === 2)) {
    const start = component[0]
    const path = [start]
    let previous = null
    let current = start
    do {
      const next = adjacency.get(current).find((id) => id !== previous)
      previous = current
      current = next
      path.push(current)
    } while (current !== start)
    return [path]
  }

  throw new Error(`Unsupported topology for ${line.name}`)
}

const stationById = new Map(metroJson.stations.map((station) => [station.id, station]))
const edgeSeconds = new Map()
for (const edge of metroJson.edges) {
  const from = stationById.get(edge.from)
  const to = stationById.get(edge.to)
  if (!from || !to) continue
  const runSeconds = Math.max(
    MIN_EDGE_SECONDS,
    (distanceKm(from.coordinates, to.coordinates) * 3600) / TRAIN_SPEED_KMH +
      ACCELERATION_SECONDS,
  )
  edgeSeconds.set(pairKey(edge.from, edge.to), Math.round(runSeconds))
}

const agencyRows = [{
  agency_id: 'mosmetro',
  agency_name: 'Московский метрополитен (локальная модель)',
  agency_url: 'https://mosmetro.ru/',
  agency_timezone: 'Europe/Moscow',
  agency_lang: 'ru',
}]
const routeRows = metroJson.lines.map((line) => ({
  route_id: line.id,
  agency_id: 'mosmetro',
  route_short_name: line.name.replace(' линия', ''),
  route_long_name: line.name,
  route_type: 1,
  route_color: line.color.replace('#', ''),
  route_text_color: 'FFFFFF',
}))
const stopRows = []
for (const station of metroJson.stations) {
  const parentId = `parent-${station.id}`
  stopRows.push({
    stop_id: parentId,
    stop_code: '',
    stop_name: station.name,
    stop_lat: station.coordinates[0],
    stop_lon: station.coordinates[1],
    location_type: 1,
    parent_station: '',
  })
  stopRows.push({
    stop_id: station.id,
    stop_code: station.id,
    stop_name: `${station.name} — платформа`,
    stop_lat: station.coordinates[0],
    stop_lon: station.coordinates[1],
    location_type: 0,
    parent_station: parentId,
  })
}

const tripRows = []
const stopTimeRows = []
const frequencyRows = []
for (const line of metroJson.lines) {
  const paths = linePaths(line, metroJson.stations, metroJson.edges)
  paths.forEach((basePath, pathIndex) => {
    ;[basePath, [...basePath].reverse()].forEach((path, directionId) => {
      const tripId = `${line.id}-${pathIndex}-${directionId}`
      tripRows.push({
        route_id: line.id,
        service_id: 'daily',
        trip_id: tripId,
        trip_headsign: stationById.get(path.at(-1))?.name ?? line.name,
        direction_id: directionId,
      })
      frequencyRows.push({
        trip_id: tripId,
        start_time: '00:00:00',
        end_time: '30:00:00',
        headway_secs: HEADWAY_SECONDS,
        exact_times: 0,
      })

      let arrivalSeconds = 0
      path.forEach((stationId, stopIndex) => {
        const isLast = stopIndex === path.length - 1
        const departureSeconds = arrivalSeconds + (isLast ? 0 : DWELL_SECONDS)
        stopTimeRows.push({
          trip_id: tripId,
          arrival_time: formatGtfsTime(arrivalSeconds),
          departure_time: formatGtfsTime(departureSeconds),
          stop_id: stationId,
          stop_sequence: stopIndex + 1,
          pickup_type: isLast ? 1 : 0,
          drop_off_type: stopIndex === 0 ? 1 : 0,
        })
        if (!isLast) {
          arrivalSeconds = departureSeconds +
            (edgeSeconds.get(pairKey(stationId, path[stopIndex + 1])) ?? MIN_EDGE_SECONDS)
        }
      })
    })
  })
}

const transferRows = []
for (let leftIndex = 0; leftIndex < metroJson.stations.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < metroJson.stations.length; rightIndex += 1) {
    const left = metroJson.stations[leftIndex]
    const right = metroJson.stations[rightIndex]
    if (left.lineIds.some((lineId) => right.lineIds.includes(lineId))) continue
    const distance = distanceKm(left.coordinates, right.coordinates)
    const key = pairKey(left.name, right.name)
    const sameNameTransfer =
      left.name === right.name &&
      !NON_TRANSFER_NAMES.has(left.name) &&
      distance <= 0.65
    if (!sameNameTransfer && distance > 0.35 && !EXPLICIT_TRANSFER_PAIRS.has(key)) continue
    const seconds = CALIBRATED_TRANSFERS.get(key) ??
      Math.max(MIN_TRANSFER_SECONDS, walkingSeconds(left.coordinates, right.coordinates) + 120)
    for (const [from, to] of [[left, right], [right, left]]) {
      transferRows.push({
        from_stop_id: from.id,
        to_stop_id: to.id,
        transfer_type: 2,
        min_transfer_time: seconds,
      })
    }
  }
}

const files = {
  'agency.txt': csv(
    ['agency_id', 'agency_name', 'agency_url', 'agency_timezone', 'agency_lang'], agencyRows,
  ),
  'routes.txt': csv(
    ['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_type', 'route_color', 'route_text_color'], routeRows,
  ),
  'stops.txt': csv(
    ['stop_id', 'stop_code', 'stop_name', 'stop_lat', 'stop_lon', 'location_type', 'parent_station'], stopRows,
  ),
  'trips.txt': csv(
    ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id'], tripRows,
  ),
  'stop_times.txt': csv(
    ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type', 'drop_off_type'], stopTimeRows,
  ),
  'frequencies.txt': csv(
    ['trip_id', 'start_time', 'end_time', 'headway_secs', 'exact_times'], frequencyRows,
  ),
  'calendar.txt': csv(
    ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
    [{
      service_id: 'daily', monday: 1, tuesday: 1, wednesday: 1, thursday: 1,
      friday: 1, saturday: 1, sunday: 1, start_date: '20250101', end_date: '20300101',
    }],
  ),
  'transfers.txt': csv(
    ['from_stop_id', 'to_stop_id', 'transfer_type', 'min_transfer_time'], transferRows,
  ),
  'feed_info.txt': csv(
    ['feed_publisher_name', 'feed_publisher_url', 'feed_lang', 'feed_start_date', 'feed_end_date', 'feed_version'],
    [{
      feed_publisher_name: 'time_checker',
      feed_publisher_url: 'https://github.com/r7zex/time_checker',
      feed_lang: 'ru',
      feed_start_date: '20250101',
      feed_end_date: '20300101',
      feed_version: metroJson.source.generatedAt,
    }],
  ),
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true })
await writeFile(
  OUTPUT,
  zipSync(Object.fromEntries(
    Object.entries(files).map(([name, contents]) => [name, strToU8(contents)]),
  )),
)
console.log(
  `Generated ${OUTPUT.pathname}: ${routeRows.length} routes, ${tripRows.length} trips, ` +
    `${stopRows.length} stops, ${transferRows.length} directed transfers.`,
)
