import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Map as MapLibreMap,
  NavigationControl,
  type MapMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { colorForMinutes } from '../lib/colors'
import type { Coordinates, MapBounds, TravelSample } from '../types'

interface OpenMapProps {
  point: Coordinates | null
  samples: TravelSample[]
  onPointChange: (point: Coordinates) => void
  onBoundsChange: (bounds: MapBounds) => void
  onError: (message: string) => void
}

const MOSCOW: [longitude: number, latitude: number] = [37.618423, 55.751244]

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

export function OpenMap({
  point,
  samples,
  onPointChange,
  onBoundsChange,
  onError,
}: OpenMapProps) {
  const mapNodeRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const samplesRef = useRef(samples)
  const pointRef = useRef(point)
  const [isReady, setIsReady] = useState(false)

  samplesRef.current = samples
  pointRef.current = point

  const publishBounds = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const bounds = map.getBounds()
    onBoundsChange({
      southWest: [bounds.getSouth(), bounds.getWest()],
      northEast: [bounds.getNorth(), bounds.getEast()],
    })
  }, [onBoundsChange])

  const drawHeat = useCallback(() => {
    const map = mapRef.current
    const canvas = canvasRef.current
    if (!map || !canvas) return

    const rect = canvas.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(rect.width * ratio)
    canvas.height = Math.round(rect.height * ratio)

    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, rect.width, rect.height)

    for (const sample of samplesRef.current) {
      const [south, west] = sample.cellBounds.southWest
      const [north, east] = sample.cellBounds.northEast
      const southWest = map.project([west, south])
      const northEast = map.project([east, north])
      const x = Math.floor(southWest.x)
      const y = Math.floor(northEast.y)
      const width = Math.ceil(northEast.x - southWest.x) + 1
      const height = Math.ceil(southWest.y - northEast.y) + 1

      if (
        x > rect.width ||
        y > rect.height ||
        x + width < 0 ||
        y + height < 0
      ) {
        continue
      }

      context.fillStyle = colorForMinutes(sample.minutes)
      context.fillRect(x, y, width, height)
    }

    if (pointRef.current) {
      const selected = map.project([pointRef.current[1], pointRef.current[0]])
      context.beginPath()
      context.arc(selected.x, selected.y, 9, 0, Math.PI * 2)
      context.fillStyle = '#16366f'
      context.fill()
      context.lineWidth = 4
      context.strokeStyle = '#ffffff'
      context.stroke()
    }
  }, [])

  useEffect(() => {
    const node = mapNodeRef.current
    if (!node) return

    let resizeObserver: ResizeObserver | null = null

    try {
      const map = new MapLibreMap({
        container: node,
        style: OPEN_STREET_MAP_STYLE,
        center: MOSCOW,
        zoom: 10.5,
        minZoom: 7,
        maxZoom: 18,
        attributionControl: { compact: true },
      })
      mapRef.current = map
      map.addControl(
        new NavigationControl({ showCompass: false }),
        'top-right',
      )

      map.on('click', (event: MapMouseEvent) => {
        onPointChange([event.lngLat.lat, event.lngLat.lng])
      })
      map.on('move', drawHeat)
      map.on('moveend', publishBounds)
      map.on('load', () => {
        const controls = node.querySelector('.maplibregl-control-container')
        if (controls && canvasRef.current) {
          node.insertBefore(canvasRef.current, controls)
        }
        publishBounds()
        drawHeat()
        setIsReady(true)
      })

      resizeObserver = new ResizeObserver(() => {
        map.resize()
        drawHeat()
      })
      resizeObserver.observe(node)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Не удалось открыть карту')
    }

    return () => {
      resizeObserver?.disconnect()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [drawHeat, onError, onPointChange, publishBounds])

  useEffect(() => {
    drawHeat()
  }, [drawHeat, isReady, point, samples])

  return (
    <div className="map-stage">
      <div className="open-map" ref={mapNodeRef} aria-label="Карта выбора точки">
        <canvas className="heat-canvas" ref={canvasRef} aria-hidden="true" />
      </div>
      {!isReady ? <div className="map-loading">Загружаем открытую карту…</div> : null}
    </div>
  )
}
