import { lazy, Suspense, useCallback, useState } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { HeatLegend } from './components/HeatLegend'
import { SettingsIcon } from './components/icons'
import { detailPointCount } from './lib/grid'
import { calculateTravelSamples } from './lib/travel'
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

const CENTRAL_TELEGRAPH: Coordinates = [55.758272, 37.611014]
const OpenMap = lazy(() =>
  import('./components/OpenMap').then((module) => ({ default: module.OpenMap })),
)

export default function App() {
  const [point, setPoint] = useState<Coordinates | null>(CENTRAL_TELEGRAPH)
  const [bounds, setBounds] = useState<MapBounds>(FALLBACK_BOUNDS)
  const [direction, setDirection] = useState<Direction>('to')
  const [transport, setTransport] = useState<TransportMode>('metro')
  const [detail, setDetail] = useState<DetailLevel>('balanced')
  const [heatOpacity, setHeatOpacity] = useState(0.46)
  const [targetMinutes, setTargetMinutes] = useState(30)
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

    const total = detailPointCount(detail)
    setIsCalculating(true)
    setError(null)
    setSamples([])
    setProgress({ ...EMPTY_PROGRESS, total })

    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      const calculated = calculateTravelSamples(point, bounds, detail, transport)
      setSamples(calculated)
      setProgress({
        completed: calculated.length,
        total: calculated.length,
        apiRequests: 0,
        cached: 0,
      })
    } catch (calculationError) {
      setError(
        calculationError instanceof Error
          ? calculationError.message
          : 'Не удалось рассчитать зоны',
      )
    } finally {
      setIsCalculating(false)
    }
  }, [bounds, detail, isCalculating, point, transport])

  return (
    <main className="app-shell">
      <Suspense fallback={<div className="map-loading">Загружаем открытую карту…</div>}>
        <OpenMap
          point={point}
          samples={samples}
          detail={detail}
          heatOpacity={heatOpacity}
          targetMinutes={targetMinutes}
          onPointChange={handlePointChange}
          onBoundsChange={setBounds}
          onError={setError}
        />
      </Suspense>

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
        heatOpacity={heatOpacity}
        targetMinutes={targetMinutes}
        point={point}
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
        onHeatOpacityChange={setHeatOpacity}
        onTargetMinutesChange={setTargetMinutes}
        onCalculate={handleCalculate}
      />
      <HeatLegend />
      <div className="accuracy-note">
        Метро считается по открытому графу станций; пешие участки — приближённо
      </div>
    </main>
  )
}
