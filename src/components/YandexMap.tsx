import { useCallback, useEffect, useRef, useState } from 'react'
import { colorForMinutes } from '../lib/colors'
import { interpolateMinutes } from '../lib/grid'
import {
  loadYandexMaps,
  type YandexMapInstance,
  type YMapsApi,
} from '../lib/yandex'
import type { Coordinates, MapBounds, TravelSample } from '../types'

interface YandexMapProps {
  apiKey: string
  point: Coordinates | null
  samples: TravelSample[]
  onPointChange: (point: Coordinates) => void
  onBoundsChange: (bounds: MapBounds) => void
  onError: (message: string) => void
}

const MOSCOW: Coordinates = [55.751244, 37.618423]

export function YandexMap({
  apiKey,
  point,
  samples,
  onPointChange,
  onBoundsChange,
  onError,
}: YandexMapProps) {
  const mapNodeRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mapRef = useRef<YandexMapInstance | null>(null)
  const ymapsRef = useRef<YMapsApi | null>(null)
  const placemarkRef = useRef<unknown>(null)
  const samplesRef = useRef(samples)
  const [isReady, setIsReady] = useState(false)

  samplesRef.current = samples

  const publishBounds = useCallback(() => {
    const raw = mapRef.current?.getBounds?.() as [Coordinates, Coordinates] | undefined
    if (!raw) return
    onBoundsChange({ southWest: raw[0], northEast: raw[1] })
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

    const projection = map.options.get('projection')
    const zoom = map.getZoom()
    const projected = samplesRef.current.flatMap((sample) => {
      const global = projection.toGlobalPixels(sample.coordinates, zoom)
      const page = map.converter.globalToPage(global) as [number, number]
      return Number.isFinite(page[0]) && Number.isFinite(page[1])
        ? [{ ...sample, page }]
        : []
    })
    if (projected.length === 0) return

    const step = Math.max(6, Math.round(rect.width / 180))
    context.filter = 'blur(4px)'
    for (let y = -step; y < rect.height + step; y += step) {
      for (let x = -step; x < rect.width + step; x += step) {
        const minutes = interpolateMinutes([x, y], projected)
        if (minutes === null) continue
        context.fillStyle = colorForMinutes(minutes)
        context.fillRect(x, y, step + 1, step + 1)
      }
    }
    context.filter = 'none'
  }, [])

  useEffect(() => {
    let disposed = false
    let resizeObserver: ResizeObserver | null = null

    loadYandexMaps(apiKey)
      .then((ymaps) => {
        if (disposed || !mapNodeRef.current) return
        ymapsRef.current = ymaps
        const map = new ymaps.Map(
          mapNodeRef.current,
          {
            center: MOSCOW,
            zoom: 11,
            controls: ['zoomControl', 'geolocationControl'],
          },
          { suppressMapOpenBlock: true },
        )
        mapRef.current = map
        map.behaviors.enable(['drag', 'scrollZoom', 'dblClickZoom', 'multiTouch'])

        map.events.add('click', (event) => {
          const coordinates = event.get<Coordinates>('coords')
          onPointChange(coordinates)
        })
        map.events.add('boundschange', () => {
          publishBounds()
          drawHeat()
        })

        resizeObserver = new ResizeObserver(() => {
          map.container.fitToViewport()
          drawHeat()
        })
        resizeObserver.observe(mapNodeRef.current)
        publishBounds()
        setIsReady(true)
      })
      .catch((error: unknown) => {
        onError(error instanceof Error ? error.message : 'Не удалось открыть карту')
      })

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      mapRef.current?.destroy?.()
      mapRef.current = null
    }
  }, [apiKey, drawHeat, onError, onPointChange, publishBounds])

  useEffect(() => {
    const map = mapRef.current
    const ymaps = ymapsRef.current
    if (!map || !ymaps || !isReady) return

    if (placemarkRef.current) {
      map.geoObjects.remove(placemarkRef.current)
      placemarkRef.current = null
    }

    if (point) {
      placemarkRef.current = new ymaps.Placemark(
        point,
        { hintContent: 'Выбранная точка' },
        {
          preset: 'islands#darkBlueCircleDotIcon',
          zIndex: 1000,
        },
      )
      map.geoObjects.add(placemarkRef.current)
    }
  }, [isReady, point])

  useEffect(() => {
    drawHeat()
  }, [drawHeat, samples])

  return (
    <div className="map-stage">
      <div className="yandex-map" ref={mapNodeRef} aria-label="Карта выбора точки" />
      <canvas className="heat-canvas" ref={canvasRef} aria-hidden="true" />
      {!isReady ? <div className="map-loading">Загружаем карту…</div> : null}
    </div>
  )
}
