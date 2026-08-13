import { createReadStream } from 'node:fs'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { zipSync, strToU8 } from 'fflate'
import { OSMTransform } from 'osm-pbf-parser-node'
import metroJson from '../src/data/metro.json' with { type: 'json' }

const OUTPUT_DIRECTORY = new URL('../otp/data/', import.meta.url)
const OUTPUT = new URL('moscow-metro.gtfs.zip', OUTPUT_DIRECTORY)
const OSM_INPUT = new URL('Moscow.osm.pbf', OUTPUT_DIRECTORY)
const TRAIN_SPEED_KMH = 41
const MIN_EDGE_SECONDS = 105
const ACCELERATION_SECONDS = 10
const DWELL_SECONDS = 5
// OTP treats frequency headways as the full waiting time in travel-time
// surfaces. These values therefore represent typical waiting time rather than
// the literal gap between vehicles.
const HEADWAY_SECONDS = 60
const MIN_TRANSFER_SECONDS = 3 * 60
const BUS_SPEED_KMH = 25
const TRAM_SPEED_KMH = 22
const SURFACE_TRANSIT_DETOUR = 1.12
const BUS_DWELL_SECONDS = 15
const BUS_HEADWAY_SECONDS = 2 * 60
const TRAM_HEADWAY_SECONDS = 3 * 60

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

function surfaceTransitSeconds(left, right, mode) {
  const speed = mode === 'tram' ? TRAM_SPEED_KMH : BUS_SPEED_KMH
  const minimum = mode === 'tram' ? 55 : 45
  return Math.round(Math.max(
    minimum,
    (distanceKm(left, right) * SURFACE_TRANSIT_DETOUR * 3600) / speed +
      BUS_DWELL_SECONDS,
  ))
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

function routeColor(value, fallback) {
  const color = String(value ?? '').replace('#', '')
  return /^[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : fallback
}

async function fileExists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function readSurfaceTransitFromOsm() {
  if (!(await fileExists(OSM_INPUT))) {
    console.warn('Moscow.osm.pbf is absent; generating the metro-only GTFS feed.')
    return { nodes: new Map(), relations: [] }
  }

  return new Promise((resolve, reject) => {
    const nodes = new Map()
    const relations = []
    createReadStream(OSM_INPUT)
      .pipe(new OSMTransform({
        withTags: {
          node: ['public_transport', 'highway', 'railway', 'name'],
          way: false,
          relation: ['route', 'network', 'ref', 'name', 'colour', 'to'],
        },
      }))
      .on('data', (items) => {
        for (const item of items) {
          if (
            item.type === 'node' &&
            (item.tags?.public_transport === 'platform' ||
              item.tags?.highway === 'bus_stop' ||
              item.tags?.railway === 'tram_stop')
          ) {
            nodes.set(item.id, item)
          }
          if (
            item.type === 'relation' &&
            ['bus', 'trolleybus', 'tram'].includes(item.tags?.route) &&
            item.tags?.network === 'Московский транспорт'
          ) {
            relations.push(item)
          }
        }
      })
      .on('error', reject)
      .on('end', () => resolve({ nodes, relations }))
  })
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
  agency_name: 'Московский транспорт (локальная модель)',
  agency_url: 'https://transport.mos.ru/',
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

const { nodes: osmTransitNodes, relations: osmTransitRelations } =
  await readSurfaceTransitFromOsm()
const surfaceRouteIds = new Set()
const surfaceStopIds = new Set()
let surfaceTrips = 0
for (const relation of osmTransitRelations) {
  const platforms = relation.members
    .filter((member) => member.type === 'node' && member.role.includes('platform'))
    .map((member) => osmTransitNodes.get(member.ref))
    .filter(Boolean)
    .filter((platform, index, all) => index === 0 || platform.id !== all[index - 1].id)
  if (platforms.length < 2) continue

  const mode = relation.tags.route === 'tram' ? 'tram' : 'bus'
  const routeRef = relation.tags.ref || String(relation.id)
  const routeId = `osm-${mode}-${routeRef}`
  if (!surfaceRouteIds.has(routeId)) {
    surfaceRouteIds.add(routeId)
    routeRows.push({
      route_id: routeId,
      agency_id: 'mosmetro',
      route_short_name: routeRef,
      route_long_name: relation.tags.name || `${mode} ${routeRef}`,
      route_type: mode === 'tram' ? 0 : 3,
      route_color: routeColor(relation.tags.colour, mode === 'tram' ? 'D32F2F' : '1D70B8'),
      route_text_color: 'FFFFFF',
    })
  }

  for (const platform of platforms) {
    const stopId = `osm-${platform.id}`
    if (surfaceStopIds.has(stopId)) continue
    surfaceStopIds.add(stopId)
    stopRows.push({
      stop_id: stopId,
      stop_code: String(platform.id),
      stop_name: platform.tags?.name || 'Остановка наземного транспорта',
      stop_lat: platform.lat,
      stop_lon: platform.lon,
      location_type: 0,
      parent_station: '',
    })
  }

  const tripId = `osm-${relation.id}`
  tripRows.push({
    route_id: routeId,
    service_id: 'daily',
    trip_id: tripId,
    trip_headsign: relation.tags.to || platforms.at(-1).tags?.name || routeRef,
    direction_id: 0,
  })

  frequencyRows.push({
    trip_id: tripId,
    start_time: '00:00:00',
    end_time: '30:00:00',
    headway_secs: mode === 'tram' ? TRAM_HEADWAY_SECONDS : BUS_HEADWAY_SECONDS,
    exact_times: 0,
  })

  let arrivalSeconds = 0
  platforms.forEach((platform, stopIndex) => {
    const isLast = stopIndex === platforms.length - 1
    stopTimeRows.push({
      trip_id: tripId,
      arrival_time: formatGtfsTime(arrivalSeconds),
      departure_time: formatGtfsTime(arrivalSeconds),
      stop_id: `osm-${platform.id}`,
      stop_sequence: stopIndex + 1,
      pickup_type: isLast ? 1 : 0,
      drop_off_type: stopIndex === 0 ? 1 : 0,
    })
    if (!isLast) {
      arrivalSeconds += surfaceTransitSeconds(
        [platform.lat, platform.lon],
        [platforms[stopIndex + 1].lat, platforms[stopIndex + 1].lon],
        mode,
      )
    }
  })
  surfaceTrips += 1
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
      Math.max(MIN_TRANSFER_SECONDS, walkingSeconds(left.coordinates, right.coordinates) + 90)
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
    `${stopRows.length} stops, ${transferRows.length} directed transfers ` +
    `(${surfaceTrips} OSM bus/tram trips).`,
)
