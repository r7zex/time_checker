import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Map as MapLibreMap,
  NavigationControl,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { gridSize } from '../lib/grid'
import { createHeatPixelData } from '../lib/heat-raster'
import { createIsochroneBoundary, type IsochroneSegment } from '../lib/isochrone'
import {
  METRO_OVERLAY_STATIONS,
  METRO_ROUTE_SEGMENTS,
  type MetroRouteSegment,
} from '../lib/metro-overlay'
import type {
  Coordinates,
  DetailLevel,
  MapBounds,
  TravelSample,
} from '../types'

interface OpenMapProps {
  point: Coordinates | null
  samples: TravelSample[]
  detail: DetailLevel
  heatOpacity: number
  targetMinutes: number
  onPointChange: (point: Coordinates) => void
  onBoundsChange: (bounds: MapBounds) => void
  onError: (message: string) => void
}

interface HeatRasterCache {
  samples: TravelSample[]
  detail: DetailLevel
  columns: number
  rows: number
  bounds: MapBounds
  raster: HTMLCanvasElement
  boundaryTarget: number
  boundary: IsochroneSegment[]
}

interface RenderSettings {
  point: Coordinates | null
  samples: TravelSample[]
  detail: DetailLevel
  heatOpacity: number
  targetMinutes: number
}

const MOSCOW: [longitude: number, latitude: number] = [37.618423, 55.751244]
const LABEL_MIN_CELL_SIZE = 15
const PRIORITY_STATION = 'ЗИЛ'

const OPEN_STREET_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    openStreetMap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>',
    },
  },
  layers: [
    {
      id: 'openStreetMap',
      type: 'raster',
      source: 'openStreetMap',
    },
  ],
}

const METRO_ROUTE_GROUPS = (() => {
  const groups = new Map<string, MetroRouteSegment[]>()
  for (const segment of METRO_ROUTE_SEGMENTS) {
    const current = groups.get(segment.color)
    if (current) current.push(segment)
    else groups.set(segment.color, [segment])
  }
  return [...groups.entries()]
})()

const METRO_LABEL_STATIONS = [...METRO_OVERLAY_STATIONS].sort((left, right) => {
  if (left.name === PRIORITY_STATION) return -1
  if (right.name === PRIORITY_STATION) return 1
  if (left.isKey !== right.isKey) return left.isKey ? -1 : 1
  return left.name.localeCompare(right.name, 'ru')
})

function buildHeatRaster(
  samples: TravelSample[],
  detail: DetailLevel,
): HeatRasterCache | null {
  const [columns, rows] = gridSize(detail)
  if (samples.length !== columns * rows || samples.length === 0) return null

  const raster = document.createElement('canvas')
  raster.width = columns
  raster.height = rows
  const context = raster.getContext('2d')
  if (!context) return null

  const image = context.createImageData(columns, rows)
  image.data.set(createHeatPixelData(samples, [columns, rows]))
  context.putImageData(image, 0, 0)

  return {
    samples,
    detail,
    columns,
    rows,
    bounds: {
      southWest: samples[0].cellBounds.southWest,
      northEast: samples.at(-1)!.cellBounds.northEast,
    },
    raster,
    boundaryTarget: Number.NaN,
    boundary: [],
  }
}

function isVisible(
  [latitude, longitude]: Coordinates,
  bounds: ReturnType<MapLibreMap['getBounds']>,
): boolean {
  return (
    latitude >= bounds.getSouth() &&
    latitude <= bounds.getNorth() &&
    longitude >= bounds.getWest() &&
    longitude <= bounds.getEast()
  )
}

function appendMetroSegments(
  context: CanvasRenderingContext2D,
  map: MapLibreMap,
  segments: readonly MetroRouteSegment[],
) {
  for (const segment of segments) {
    const from = map.project([segment.from[1], segment.from[0]])
    const to = map.project([segment.to[1], segment.to[0]])
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
  }
}

function drawMetroOverlay(context: CanvasRenderingContext2D, map: MapLibreMap) {
  context.save()
  context.globalAlpha = 1
  context.lineCap = 'round'
  context.lineJoin = 'round'
  const zoom = map.getZoom()

  context.beginPath()
  appendMetroSegments(context, map, METRO_ROUTE_SEGMENTS)
  context.strokeStyle = 'rgba(255, 255, 255, 0.98)'
  context.lineWidth = zoom < 9 ? 6.8 : 8.2
  context.shadowColor = 'rgba(10, 31, 62, 0.28)'
  context.shadowBlur = 2
  context.stroke()
  context.shadowColor = 'transparent'

  for (const [color, segments] of METRO_ROUTE_GROUPS) {
    context.beginPath()
    appendMetroSegments(context, map, segments)
    context.strokeStyle = color
    context.lineWidth = zoom < 9 ? 3.5 : 4.4
    context.stroke()
  }

  const visibleBounds = map.getBounds()
  if (zoom >= 8) {
    for (const station of METRO_OVERLAY_STATIONS) {
      if (!isVisible(station.coordinates, visibleBounds)) continue
      const position = map.project([station.coordinates[1], station.coordinates[0]])
      context.beginPath()
      const radius = zoom >= 13 ? 3.6 : zoom >= 10 ? 2.7 : 1.8
      context.arc(position.x, position.y, radius, 0, Math.PI * 2)
      context.fillStyle = '#ffffff'
      context.fill()
      context.strokeStyle = station.color
      context.lineWidth = zoom >= 10 ? 1.8 : 1.2
      context.stroke()
    }
  }

  const occupied = new Set<string>()
  for (const station of METRO_LABEL_STATIONS) {
    const isPriority = station.name === PRIORITY_STATION
    const canShow =
      (isPriority && zoom >= 9.5) ||
      (station.isKey && zoom >= 11) ||
      zoom >= 13
    if (!canShow) continue
    if (!isVisible(station.coordinates, visibleBounds)) continue

    const position = map.project([station.coordinates[1], station.coordinates[0]])
    const key = `${Math.round(position.x / 86)}:${Math.round(position.y / 18)}`
    if (!isPriority && occupied.has(key)) continue
    occupied.add(key)

    context.font = `${isPriority ? 800 : 700} ${isPriority ? 13 : 10}px Inter, sans-serif`
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.lineWidth = isPriority ? 4.6 : 3.8
    context.strokeStyle = 'rgba(255, 255, 255, 0.98)'
    context.strokeText(station.name, position.x + 5, position.y - 5)
    context.fillStyle = isPriority ? '#0e315f' : '#253652'
    context.fillText(station.name, position.x + 5, position.y - 5)
  }

  context.restore()
}

function drawHeatRaster(
  context: CanvasRenderingContext2D,
  map: MapLibreMap,
  cache: HeatRasterCache,
  opacity: number,
) {
  if (opacity <= 0) return

  const [south, west] = cache.bounds.southWest
  const [north, east] = cache.bounds.northEast
  const latitudeStep = (north - south) / cache.rows
  const centerLatitude = (south + north) / 2
  const westX = map.project([west, centerLatitude]).x
  const eastX = map.project([east, centerLatitude]).x
  const width = eastX - westX

  context.save()
  context.globalAlpha = opacity
  context.imageSmoothingEnabled = false

  for (let sourceRow = 0; sourceRow < cache.rows; sourceRow += 1) {
    const gridRow = cache.rows - sourceRow - 1
    const rowSouth = south + latitudeStep * gridRow
    const rowNorth = rowSouth + latitudeStep
    const top = map.project([west, rowNorth]).y
    const bottom = map.project([west, rowSouth]).y
    context.drawImage(
      cache.raster,
      0,
      sourceRow,
      cache.columns,
      1,
      westX,
      top,
      width,
      Math.max(0.75, bottom - top + 0.35),
    )
  }

  context.restore()
}

function drawCellLabels(
  context: CanvasRenderingContext2D,
  map: MapLibreMap,
  cache: HeatRasterCache,
) {
  const [south, west] = cache.bounds.southWest
  const [north, east] = cache.bounds.northEast
  const topLeft = map.project([west, north])
  const bottomRight = map.project([east, south])
  const cellWidth = Math.abs(bottomRight.x - topLeft.x) / cache.columns
  const cellHeight = Math.abs(bottomRight.y - topLeft.y) / cache.rows
  const cellSize = Math.min(cellWidth, cellHeight)
  if (cellSize < LABEL_MIN_CELL_SIZE) return

  const visible = map.getBounds()
  const columnStart = Math.max(
    0,
    Math.floor(((visible.getWest() - west) / (east - west)) * cache.columns),
  )
  const columnEnd = Math.min(
    cache.columns - 1,
    Math.ceil(((visible.getEast() - west) / (east - west)) * cache.columns),
  )
  const rowStart = Math.max(
    0,
    Math.floor(((visible.getSouth() - south) / (north - south)) * cache.rows),
  )
  const rowEnd = Math.min(
    cache.rows - 1,
    Math.ceil(((visible.getNorth() - south) / (north - south)) * cache.rows),
  )

  const alpha = Math.min(0.4, 0.14 + (cellSize - LABEL_MIN_CELL_SIZE) / 80)
  const fontSize = Math.min(11, Math.max(7, cellSize * 0.36))
  context.save()
  context.font = `650 ${fontSize}px Inter, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = `rgba(13, 30, 61, ${alpha})`
  context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.82})`
  context.lineWidth = 2

  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let column = columnStart; column <= columnEnd; column += 1) {
      const sample = cache.samples[row * cache.columns + column]
      const position = map.project([sample.coordinates[1], sample.coordinates[0]])
      const label = String(Math.round(sample.minutes))
      context.strokeText(label, position.x, position.y)
      context.fillText(label, position.x, position.y)
    }
  }

  context.restore()
}

function drawIsochrone(
  context: CanvasRenderingContext2D,
  map: MapLibreMap,
  boundary: readonly IsochroneSegment[],
) {
  if (boundary.length === 0) return

  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  for (const segment of boundary) {
    const from = map.project([segment.from[1], segment.from[0]])
    const to = map.project([segment.to[1], segment.to[0]])
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
  }
  context.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  context.lineWidth = 6
  context.stroke()
  context.strokeStyle = '#168bff'
  context.lineWidth = 2.8
  context.stroke()
  context.restore()
}

function drawSelectedPoint(
  context: CanvasRenderingContext2D,
  map: MapLibreMap,
  point: Coordinates | null,
) {
  if (!point) return
  const selected = map.project([point[1], point[0]])
  context.beginPath()
  context.arc(selected.x, selected.y, 9, 0, Math.PI * 2)
  context.fillStyle = '#16366f'
  context.fill()
  context.lineWidth = 4
  context.strokeStyle = '#ffffff'
  context.stroke()
}

export function OpenMap({
  point,
  samples,
  detail,
  heatOpacity,
  targetMinutes,
  onPointChange,
  onBoundsChange,
  onError,
}: OpenMapProps) {
  const mapNodeRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const frameRef = useRef<number | null>(null)
  const heatCacheRef = useRef<HeatRasterCache | null>(null)
  const renderSettingsRef = useRef<RenderSettings>({
    point,
    samples,
    detail,
    heatOpacity,
    targetMinutes,
  })
  const [isReady, setIsReady] = useState(false)

  renderSettingsRef.current = {
    point,
    samples,
    detail,
    heatOpacity,
    targetMinutes,
  }

  const publishBounds = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const bounds = map.getBounds()
    onBoundsChange({
      southWest: [bounds.getSouth(), bounds.getWest()],
      northEast: [bounds.getNorth(), bounds.getEast()],
    })
  }, [onBoundsChange])

  const drawScene = useCallback(() => {
    const map = mapRef.current
    const canvas = canvasRef.current
    if (!map || !canvas) return

    const rect = canvas.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const pixelWidth = Math.round(rect.width * ratio)
    const pixelHeight = Math.round(rect.height * ratio)
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth
      canvas.height = pixelHeight
    }

    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, rect.width, rect.height)

    const settings = renderSettingsRef.current
    let cache = heatCacheRef.current
    if (
      settings.samples.length > 0 &&
      (!cache || cache.samples !== settings.samples || cache.detail !== settings.detail)
    ) {
      cache = buildHeatRaster(settings.samples, settings.detail)
      heatCacheRef.current = cache
    } else if (settings.samples.length === 0) {
      cache = null
      heatCacheRef.current = null
    }

    if (cache) {
      if (cache.boundaryTarget !== settings.targetMinutes) {
        cache.boundaryTarget = settings.targetMinutes
        cache.boundary = createIsochroneBoundary(
          cache.samples,
          [cache.columns, cache.rows],
          settings.targetMinutes,
        )
      }
      drawHeatRaster(context, map, cache, settings.heatOpacity)
    }

    drawMetroOverlay(context, map)
    if (cache) {
      drawCellLabels(context, map, cache)
      drawIsochrone(context, map, cache.boundary)
    }
    drawSelectedPoint(context, map, settings.point)
  }, [])

  const scheduleDraw = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      drawScene()
    })
  }, [drawScene])

  useEffect(() => {
    const node = mapNodeRef.current
    if (!node) return

    let resizeObserver: ResizeObserver | null = null
    let pointerStart: { x: number; y: number } | null = null
    let handlePointerDown: ((event: PointerEvent) => void) | null = null
    let handleMapClick: ((event: MouseEvent) => void) | null = null

    try {
      const map = new MapLibreMap({
        container: node,
        style: OPEN_STREET_MAP_STYLE,
        center: MOSCOW,
        zoom: 10.5,
        minZoom: 7,
        maxZoom: 18,
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: { compact: true },
      })
      mapRef.current = map
      map.touchZoomRotate.disableRotation()
      map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

      handlePointerDown = (event: PointerEvent) => {
        pointerStart = { x: event.clientX, y: event.clientY }
      }
      handleMapClick = (event: MouseEvent) => {
        const target = event.target
        if (
          target instanceof Element &&
          target.closest('.maplibregl-control-container')
        ) {
          return
        }
        if (
          pointerStart &&
          Math.hypot(
            event.clientX - pointerStart.x,
            event.clientY - pointerStart.y,
          ) > 8
        ) {
          pointerStart = null
          return
        }

        pointerStart = null
        const rect = node.getBoundingClientRect()
        const longitudeLatitude = map.unproject([
          event.clientX - rect.left,
          event.clientY - rect.top,
        ])
        onPointChange([longitudeLatitude.lat, longitudeLatitude.lng])
      }

      node.addEventListener('pointerdown', handlePointerDown, {
        capture: true,
        passive: true,
      })
      node.addEventListener('click', handleMapClick, true)
      map.on('move', scheduleDraw)
      map.on('moveend', publishBounds)
      map.on('load', () => {
        publishBounds()
        scheduleDraw()
        setIsReady(true)
      })

      resizeObserver = new ResizeObserver(() => {
        map.resize()
        scheduleDraw()
      })
      resizeObserver.observe(node)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось открыть карту')
    }

    return () => {
      resizeObserver?.disconnect()
      if (handlePointerDown) {
        node.removeEventListener('pointerdown', handlePointerDown, true)
      }
      if (handleMapClick) node.removeEventListener('click', handleMapClick, true)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [onError, onPointChange, publishBounds, scheduleDraw])

  useEffect(() => {
    scheduleDraw()
  }, [detail, heatOpacity, isReady, point, samples, scheduleDraw, targetMinutes])

  return (
    <div className="map-stage">
      <div className="open-map" ref={mapNodeRef} aria-label="Карта выбора точки" />
      <canvas className="heat-canvas" ref={canvasRef} aria-hidden="true" />
      {!isReady ? <div className="map-loading">Загружаем открытую карту…</div> : null}
    </div>
  )
}
