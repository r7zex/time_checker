import type {
  Coordinates,
  Direction,
  TransportMode,
} from '../types'

interface YMapsPropertyManager {
  get<T>(key: string): T
}

interface YMapsEvent {
  get<T>(key: string): T
}

interface YMapsEventManager {
  add(event: string, handler: (event: YMapsEvent) => void): void
}

interface YMapsCollection<T> {
  each(handler: (item: T) => void): void
}

interface YMapsSegment {
  properties: YMapsPropertyManager
}

interface YMapsPath {
  getSegments(): YMapsCollection<YMapsSegment>
}

interface YMapsRoute {
  properties: YMapsPropertyManager
  getPaths(): YMapsCollection<YMapsPath>
}

export interface YMapsMultiRoute {
  model: { events: YMapsEventManager }
  getRoutes(): YMapsCollection<YMapsRoute>
}

interface YMapsProjection {
  toGlobalPixels(coordinates: Coordinates, zoom: number): [number, number]
}

export interface YandexMapInstance {
  behaviors: { enable(behaviors: string[]): void }
  container: { fitToViewport(): void }
  converter: { globalToPage(point: [number, number]): [number, number] }
  events: YMapsEventManager
  geoObjects: {
    add(object: unknown): void
    remove(object: unknown): void
  }
  options: { get(key: 'projection'): YMapsProjection }
  getBounds(): [Coordinates, Coordinates]
  getZoom(): number
  destroy(): void
}

export interface YMapsApi {
  ready(callback: () => void): void
  Map: new (
    node: HTMLElement,
    state: { center: Coordinates; zoom: number; controls: string[] },
    options: Record<string, unknown>,
  ) => YandexMapInstance
  Placemark: new (
    point: Coordinates,
    properties: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => unknown
  multiRouter: {
    MultiRoute: new (
      model: Record<string, unknown>,
      options: Record<string, unknown>,
    ) => YMapsMultiRoute
  }
}

declare global {
  interface Window {
    ymaps?: YMapsApi
    __yandexMapsPromise?: Promise<YMapsApi>
  }
}

const SCRIPT_ID = 'yandex-maps-api'

export function loadYandexMaps(apiKey: string): Promise<YMapsApi> {
  if (window.ymaps) {
    return new Promise((resolve) => window.ymaps!.ready(() => resolve(window.ymaps!)))
  }
  if (window.__yandexMapsPromise) return window.__yandexMapsPromise

  window.__yandexMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    const script = existing ?? document.createElement('script')

    const handleLoad = () => {
      if (!window.ymaps) {
        reject(new Error('JavaScript API Яндекс Карт не инициализирован'))
        return
      }
      window.ymaps.ready(() => resolve(window.ymaps!))
    }

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener(
      'error',
      () => reject(new Error('Не удалось загрузить JavaScript API Яндекс Карт')),
      { once: true },
    )

    if (!existing) {
      script.id = SCRIPT_ID
      script.async = true
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`
      document.head.append(script)
    }
  })

  return window.__yandexMapsPromise
}

function getTransportTypes(route: YMapsRoute): Set<string> {
  const types = new Set<string>()
  route.getPaths().each((path) => {
    path.getSegments().each((segment) => {
      const transports = segment.properties.get('transports') as
        | Array<{ type?: string }>
        | undefined
      transports?.forEach((transport) => {
        if (transport.type) types.add(transport.type)
      })
    })
  })
  return types
}

function routeMatchesMode(route: YMapsRoute, mode: TransportMode): boolean {
  if (mode === 'all' || mode === 'walk') return true

  const types = getTransportTypes(route)
  if (types.size === 0) return false

  const accepted: Record<Exclude<TransportMode, 'all' | 'walk'>, Set<string>> = {
    metro: new Set(['underground']),
    bus: new Set(['bus', 'minibus', 'trolleybus']),
    tram: new Set(['tramway']),
  }

  const allowed = accepted[mode]
  return [...types].every((type) => allowed.has(type))
}

function durationInMinutes(route: YMapsRoute): number | null {
  const duration = route.properties.get('duration') as
    | { value?: number }
    | undefined
  const seconds = duration?.value
  return typeof seconds === 'number' && seconds >= 0
    ? Math.max(1, Math.round(seconds / 60))
    : null
}

export function calculateRouteMinutes(
  ymaps: YMapsApi,
  anchor: Coordinates,
  selected: Coordinates,
  direction: Direction,
  transport: TransportMode,
): Promise<number | null> {
  const referencePoints =
    direction === 'to' ? [anchor, selected] : [selected, anchor]
  const routingMode = transport === 'walk' ? 'pedestrian' : 'masstransit'

  return new Promise((resolve) => {
    const multiRoute = new ymaps.multiRouter.MultiRoute(
      {
        referencePoints,
        params: {
          routingMode,
          reverseGeocoding: false,
        },
      },
      {
        wayPointVisible: false,
        routeActiveVisible: false,
        routeVisible: false,
      },
    )

    let settled = false
    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      resolve(value)
    }

    const timeout = window.setTimeout(() => finish(null), 20_000)

    multiRoute.model.events.add('requestsuccess', () => {
      let best: number | null = null
      multiRoute.getRoutes().each((route) => {
        if (!routeMatchesMode(route, transport)) return
        const minutes = durationInMinutes(route)
        if (minutes !== null && (best === null || minutes < best)) best = minutes
      })
      finish(best)
    })

    multiRoute.model.events.add('requestfail', () => finish(null))
  })
}
