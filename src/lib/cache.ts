import type { Coordinates, Direction, TransportMode } from '../types'

const STORAGE_KEY = 'travel-time-cache:v1'
const MAX_ENTRIES = 500
const MAX_AGE_MS = 6 * 60 * 60 * 1000

interface CacheEntry {
  key: string
  minutes: number
  createdAt: number
}

let memoryCache: CacheEntry[] | null = null

function loadEntries(): CacheEntry[] {
  if (memoryCache) return memoryCache

  try {
    const value = localStorage.getItem(STORAGE_KEY)
    const parsed = value ? (JSON.parse(value) as CacheEntry[]) : []
    const cutoff = Date.now() - MAX_AGE_MS
    memoryCache = parsed.filter(
      (entry) =>
        typeof entry.key === 'string' &&
        Number.isFinite(entry.minutes) &&
        entry.createdAt >= cutoff,
    )
  } catch {
    memoryCache = []
  }

  return memoryCache
}

function persist(entries: CacheEntry[]) {
  memoryCache = entries.slice(-MAX_ENTRIES)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryCache))
  } catch {
    // Private browsing and full storage must not break route calculations.
  }
}

function roundCoordinate(value: number): string {
  return value.toFixed(3)
}

export function createTravelCacheKey(
  selected: Coordinates,
  anchor: Coordinates,
  direction: Direction,
  transport: TransportMode,
): string {
  return [
    roundCoordinate(selected[0]),
    roundCoordinate(selected[1]),
    roundCoordinate(anchor[0]),
    roundCoordinate(anchor[1]),
    direction,
    transport,
  ].join(':')
}

export function getCachedMinutes(key: string): number | null {
  const entry = loadEntries().find((item) => item.key === key)
  return entry?.minutes ?? null
}

export function setCachedMinutes(key: string, minutes: number) {
  const entries = loadEntries().filter((entry) => entry.key !== key)
  entries.push({ key, minutes, createdAt: Date.now() })
  persist(entries)
}
