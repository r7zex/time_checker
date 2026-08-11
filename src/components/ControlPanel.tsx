import type { ComponentType, SVGProps } from 'react'
import {
  ClockIcon,
  CrosshairIcon,
  MetroIcon,
  PinIcon,
  WalkIcon,
} from './icons'
import type {
  CalculationProgress,
  DetailLevel,
  Direction,
  TransportMode,
} from '../types'

interface ControlPanelProps {
  direction: Direction
  transport: TransportMode
  detail: DetailLevel
  hasPoint: boolean
  isCalculating: boolean
  progress: CalculationProgress
  error: string | null
  isCollapsed: boolean
  onDirectionChange: (direction: Direction) => void
  onTransportChange: (transport: TransportMode) => void
  onDetailChange: (detail: DetailLevel) => void
  onCalculate: () => void
}

interface TransportOption {
  value: TransportMode
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const transportOptions: TransportOption[] = [
  { value: 'metro', label: 'Метро + пешком', Icon: MetroIcon },
  { value: 'walk', label: 'Только пешком', Icon: WalkIcon },
]

const detailOptions: Array<{ value: DetailLevel; label: string }> = [
  { value: 'fast', label: 'Быстро' },
  { value: 'balanced', label: 'Баланс' },
  { value: 'precise', label: 'Точно' },
]

export function ControlPanel({
  direction,
  transport,
  detail,
  hasPoint,
  isCalculating,
  progress,
  error,
  isCollapsed,
  onDirectionChange,
  onTransportChange,
  onDetailChange,
  onCalculate,
}: ControlPanelProps) {
  const progressPercent = progress.total
    ? Math.round((progress.completed / progress.total) * 100)
    : 0
  const status = isCalculating
    ? `Считаем ${progress.total} точек локально`
    : progress.total
      ? `${progress.total} точек · без маршрутных API-запросов`
      : 'Расчёт начнётся после выбора точки'

  return (
    <aside
      className={`control-panel ${isCollapsed ? 'control-panel--collapsed' : ''}`}
      aria-label="Настройки расчёта"
    >
      <div className="control-panel__handle" aria-hidden="true" />
      <div className="brand">
        <ClockIcon />
        <span>Время в пути</span>
      </div>

      <div className={`point-prompt ${hasPoint ? 'point-prompt--ready' : ''}`}>
        <PinIcon />
        <span>{hasPoint ? 'Точка выбрана' : 'Выберите точку на карте'}</span>
      </div>

      <fieldset className="control-group">
        <legend>Направление</legend>
        <div className="segmented" role="radiogroup" aria-label="Направление">
          <button
            className={direction === 'to' ? 'is-selected' : ''}
            type="button"
            role="radio"
            aria-checked={direction === 'to'}
            onClick={() => onDirectionChange('to')}
          >
            К точке
          </button>
          <button
            className={direction === 'from' ? 'is-selected' : ''}
            type="button"
            role="radio"
            aria-checked={direction === 'from'}
            onClick={() => onDirectionChange('from')}
          >
            От точки
          </button>
        </div>
      </fieldset>

      <fieldset className="control-group">
        <legend>Транспорт</legend>
        <div className="transport-list" role="radiogroup" aria-label="Транспорт">
          {transportOptions.map(({ value, label, Icon }) => (
            <button
              className={transport === value ? 'is-selected' : ''}
              type="button"
              role="radio"
              aria-checked={transport === value}
              onClick={() => onTransportChange(value)}
              key={value}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="control-group control-group--detail">
        <legend>Детализация</legend>
        <div className="segmented segmented--three" role="radiogroup" aria-label="Детализация">
          {detailOptions.map(({ value, label }) => (
            <button
              className={detail === value ? 'is-selected' : ''}
              type="button"
              role="radio"
              aria-checked={detail === value}
              onClick={() => onDetailChange(value)}
              key={value}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        className="calculate-button"
        type="button"
        disabled={!hasPoint || isCalculating}
        onClick={onCalculate}
      >
        <CrosshairIcon />
        {isCalculating ? 'Рассчитываем…' : 'Рассчитать зоны'}
      </button>

      <div className="calculation-status" aria-live="polite">
        <span>{error ?? status}</span>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <small>OSM-карта · открытый граф метро Wikidata</small>
      </div>
    </aside>
  )
}
