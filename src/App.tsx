import { useCallback, useState } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { DemoMap } from './components/DemoMap'
import { HeatLegend } from './components/HeatLegend'
import { YandexMap } from './components/YandexMap'
import { SettingsIcon } from './components/icons'
import { createTravelCacheKey, getCachedMinutes, setCachedMinutes } from './lib/cache'
import { createAnchorGrid, detailPointCount, mapWithConcurrency } from './lib/grid'
import { calculateRouteMinutes, loadYandexMaps } from './lib/yandex'
import type {
  CalculationProgress,
  Coordinates,
  DetailLevel,
  Direction,
  MapBounds,
  TransportMode,
  TravelSample,
} from './types'

const EMPTY_PROGRESS: CalculationProgress = {
  completed: 0,
  total: 0,
  apiRequests: 0,
  cached: 0,
}

const FALLBACK_BOUNDS: MapBounds = {
  southWest: [55.58, 37.34],
  northEast: [55.91, 37.9],
}

const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY?.trim() ?? ''
const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

export default function App() {
  const [point, setPoint] = useState<Coordinates | null>(null)
  const [bounds, setBounds] = useState<MapBounds>(FALLBACK_BOUNDS)
  const [direction, setDirection] = useState<Direction>('to')
  const [transport, setTransport] = useState<TransportMode>('all')
  const [detail, setDetail] = useState<DetailLevel>('balanced')
  const [samples, setSamples] = useState<TravelSample[]>([])
  const [progress, setProgress] = useState<CalculationProgress>(EMPTY_PROGRESS)
  const [isCalculating, setIsCalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [controlsOpen, setControlsOpen] = useState(true)

  const handleConfigurationChange = useCallback(() => {
    setSamples([])
    setProgress(EMPTY_PROGRESS)
    setError(null)
  }, [])

  const handlePointChange = useCallback((coordinates: Coordinates) => {
    setPoint(coordinates)
    setSamples([])
    setProgress(EMPTY_PROGRESS)
    setError(null)
  }, [])

  const handleCalculate = useCallback(async () => {
    if (!point || isCalculating) return

    const anchors = createAnchorGrid(bounds, detail)
    setIsCalculating(true)
    setError(null)
    setSamples([])
    setProgress({ ...EMPTY_PROGRESS, total: anchors.length })

    if (isDemoMode) {
      const demoSamples = anchors.map((coordinates) => {
        const latitudeScale = (coordinates[0] - point[0]) * 111
        const longitudeScale =
          (coordinates[1] - point[1]) *
          111 *
          Math.cos((point[0] * Math.PI) / 180)
        const distance = Math.hypot(latitudeScale, longitudeScale)
        const multiplier = transport === 'walk' ? 12 : transport === 'all' ? 2.7 : 3.4
        return {
          coordinates,
          minutes: Math.max(2, Math.round(distance * multiplier)),
          fromCache: false,
        }
      })
      setSamples(demoSamples)
      setProgress({
        completed: anchors.length,
        total: anchors.length,
        apiRequests: 0,
        cached: 0,
      })
      setIsCalculating(false)
      return
    }

    try {
      const ymaps = await loadYandexMaps(apiKey)
      const result = await mapWithConcurrency(anchors, 4, async (anchor) => {
        const cacheKey = createTravelCacheKey(point, anchor, direction, transport)
        const cached = getCachedMinutes(cacheKey)
        if (cached !== null) {
          setProgress((current) => ({
            ...current,
            completed: current.completed + 1,
            cached: current.cached + 1,
          }))
          return { coordinates: anchor, minutes: cached, fromCache: true }
        }

        setProgress((current) => ({
          ...current,
          apiRequests: current.apiRequests + 1,
        }))
        const minutes = await calculateRouteMinutes(
          ymaps,
          anchor,
          point,
          direction,
          transport,
        )
        setProgress((current) => ({
          ...current,
          completed: current.completed + 1,
        }))

        if (minutes === null) return null
        setCachedMinutes(cacheKey, minutes)
        return { coordinates: anchor, minutes, fromCache: false }
      })

      const available = result.filter((sample): sample is TravelSample => sample !== null)
      setSamples(available)
      if (available.length < Math.ceil(anchors.length / 3)) {
        setError('Слишком мало подходящих маршрутов. Попробуйте другой вид транспорта.')
      }
    } catch (calculationError) {
      setError(
        calculationError instanceof Error
          ? calculationError.message
          : 'Не удалось рассчитать зоны',
      )
    } finally {
      setIsCalculating(false)
    }
  }, [bounds, detail, direction, isCalculating, point, transport])

  const missingKey = !apiKey && !isDemoMode

  return (
    <main className="app-shell">
      {missingKey ? (
        <div className="setup-state">
          <div className="setup-state__map" aria-hidden="true" />
          <section className="setup-state__panel">
            <span className="setup-state__number">1</span>
            <h1>Подключите карту</h1>
            <p>
              Создайте <code>.env.local</code> и добавьте ключ JavaScript API Яндекс Карт.
              Другие API для выбора точки и расчёта зон не нужны.
            </p>
            <pre>VITE_YANDEX_MAPS_API_KEY=ваш_ключ</pre>
            <p className="setup-state__hint">
              Для просмотра интерфейса без запросов можно временно указать{' '}
              <code>VITE_DEMO_MODE=true</code>.
            </p>
          </section>
        </div>
      ) : (
        <>
          {isDemoMode ? (
            <DemoMap point={point} samples={samples} onPointChange={handlePointChange} />
          ) : (
            <YandexMap
              apiKey={apiKey}
              point={point}
              samples={samples}
              onPointChange={handlePointChange}
              onBoundsChange={setBounds}
              onError={setError}
            />
          )}

          <div className="mobile-titlebar">
            <span>Время в пути</span>
            <button
              type="button"
              aria-label={controlsOpen ? 'Свернуть настройки' : 'Открыть настройки'}
              aria-expanded={controlsOpen}
              onClick={() => setControlsOpen((current) => !current)}
            >
              <SettingsIcon />
            </button>
          </div>

          <ControlPanel
            direction={direction}
            transport={transport}
            detail={detail}
            hasPoint={Boolean(point)}
            isCalculating={isCalculating}
            progress={progress.total ? progress : { ...progress, total: detailPointCount(detail) }}
            error={error}
            isCollapsed={!controlsOpen}
            onDirectionChange={(value) => {
              setDirection(value)
              handleConfigurationChange()
            }}
            onTransportChange={(value) => {
              setTransport(value)
              handleConfigurationChange()
            }}
            onDetailChange={(value) => {
              setDetail(value)
              handleConfigurationChange()
            }}
            onCalculate={handleCalculate}
          />
          <HeatLegend />
          <div className="accuracy-note">
            Карта показывает приблизительное время в пути
          </div>
        </>
      )}
    </main>
  )
}
