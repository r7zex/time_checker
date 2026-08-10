import { mkdir, writeFile } from 'node:fs/promises'

const ENDPOINT = 'https://query.wikidata.org/sparql'
const OUTPUT = new URL('../src/data/metro.json', import.meta.url)
const EXCLUDED_LINES = new Set([
  'Бирюлёвская линия',
  'Рублёво-Архангельская линия',
  'Московская кольцевая железная дорога',
  'Калининско-Солнцевская линия',
])

const QUERY = `
SELECT DISTINCT
  ?station ?stationLabel ?coord ?adjacent
  ?line ?lineLabel ?rgb ?opened ?officialOpened
WHERE {
  ?station wdt:P31/wdt:P279* wd:Q928830;
           wdt:P131*/wdt:P279* wd:Q649;
           wdt:P625 ?coord;
           wdt:P81 ?line.

  OPTIONAL { ?station wdt:P571 ?opened. }
  OPTIONAL { ?station wdt:P1619 ?officialOpened. }
  OPTIONAL {
    ?station wdt:P197 ?adjacent.
    ?adjacent wdt:P81 ?line.
  }
  OPTIONAL { ?line wdt:P465 ?rgb. }

  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "ru,en".
  }
}
`

function entityId(uri) {
  return uri.slice(uri.lastIndexOf('/') + 1)
}

function parsePoint(value) {
  const match = /^Point\((-?[\d.]+) (-?[\d.]+)\)$/.exec(value)
  if (!match) throw new Error(`Unexpected Wikidata coordinate: ${value}`)
  return [Number(match[2]), Number(match[1])]
}

function canonicalEdge(from, to, lineId) {
  return from < to ? `${from}:${to}:${lineId}` : `${to}:${from}:${lineId}`
}

const requestUrl = new URL(ENDPOINT)
requestUrl.searchParams.set('query', QUERY)
requestUrl.searchParams.set('format', 'json')

const response = await fetch(requestUrl, {
  headers: {
    Accept: 'application/sparql-results+json',
    'User-Agent': 'time-checker/0.2 (https://github.com/r7zex/time_checker)',
  },
})

if (!response.ok) {
  throw new Error(`Wikidata returned ${response.status} ${response.statusText}`)
}

const payload = await response.json()
const now = Date.now()
const lines = new Map()
const stations = new Map()
const pendingEdges = new Set()

for (const binding of payload.results.bindings) {
  const openedValue = binding.officialOpened?.value ?? binding.opened?.value
  if (!openedValue || Date.parse(openedValue) > now) continue

  const lineName = binding.lineLabel.value
  if (EXCLUDED_LINES.has(lineName)) continue

  const stationId = entityId(binding.station.value)
  const lineId = entityId(binding.line.value)
  const current = stations.get(stationId) ?? {
    id: stationId,
    name: binding.stationLabel.value,
    coordinates: parsePoint(binding.coord.value),
    lineIds: new Set(),
  }
  current.lineIds.add(lineId)
  stations.set(stationId, current)

  lines.set(lineId, {
    id: lineId,
    name: lineName,
    color: `#${binding.rgb?.value ?? '667085'}`,
  })

  if (binding.adjacent?.value) {
    pendingEdges.add(
      canonicalEdge(stationId, entityId(binding.adjacent.value), lineId),
    )
  }
}

const edges = [...pendingEdges]
  .map((key) => {
    const [from, to, lineId] = key.split(':')
    return { from, to, lineId }
  })
  .filter(({ from, to }) => stations.has(from) && stations.has(to))
  .sort((left, right) =>
    `${left.lineId}:${left.from}:${left.to}`.localeCompare(
      `${right.lineId}:${right.from}:${right.to}`,
    ),
  )

const output = {
  source: {
    name: 'Wikidata Query Service',
    url: ENDPOINT,
    license: 'CC0-1.0',
    generatedAt: new Date().toISOString(),
  },
  lines: [...lines.values()].sort((left, right) =>
    left.name.localeCompare(right.name, 'ru'),
  ),
  stations: [...stations.values()]
    .map((station) => ({ ...station, lineIds: [...station.lineIds].sort() }))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru')),
  edges,
}

await mkdir(new URL('../src/data/', import.meta.url), { recursive: true })
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

console.log(
  `Saved ${output.stations.length} stations, ${output.lines.length} lines and ${output.edges.length} track edges.`,
)
