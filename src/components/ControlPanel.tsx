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
  Coordinates,
  DetailLevel,
  Direction,
  TransportMode,
} from '../types'

interface ControlPanelProps {
  direction: Direction
  transport: TransportMode
  detail: DetailLevel
  heatOpacity: number
  targetMinutes: number
  point: Coordinates | null
  isCalculating: boolean
  progress: CalculationProgress
  error: string | null
  isCollapsed: boolean
  onDirectionChange: (direction: Direction) => void
  onTransportChange: (transport: TransportMode) => void
  onDetailChange: (detail: DetailLevel) => void
  onHeatOpacityChange: (opacity: number) => void
  onTargetMinutesChange: (minutes: number) => void
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
  heatOpacity,
  targetMinutes,
  point,
  isCalculating,
  progress,
  error,
  isCollapsed,
  onDirectionChange,
  onTransportChange,
  onDetailChange,
  onHeatOpacityChange,
  onTargetMinutesChange,
  onCalculate,
}: ControlPanelProps) {
  const hasPoint = point !== null
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
        <span className="point-prompt__copy">
          <strong>
            {point
              ? `${point[0].toFixed(5)}, ${point[1].toFixed(5)}`
              : 'Выберите точку на карте'}
          </strong>
          {point ? <small>Нажмите на карту, чтобы изменить</small> : null}
        </span>
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

      <fieldset className="control-group display-controls">
        <legend>Отображение</legend>
        <label className="range-control">
          <span className="range-control__header">
            <span>Непрозрачность heatmap</span>
            <output>{Math.round(heatOpacity * 100)}%</output>
          </span>
          <input
            type="range"
            min="0"
            max="0.8"
            step="0.05"
            value={heatOpacity}
            aria-label="Непрозрачность heatmap"
            onChange={(event) => onHeatOpacityChange(Number(event.target.value))}
          />
        </label>
        <label className="range-control">
          <span className="range-control__header">
            <span>Граница доступности</span>
            <output>до {targetMinutes} мин</output>
          </span>
          <input
            type="range"
            min="3"
            max="60"
            step="3"
            value={targetMinutes}
            aria-label="Время границы доступности"
            onChange={(event) => onTargetMinutesChange(Number(event.target.value))}
          />
        </label>
        <span className="boundary-key">
          <span aria-hidden="true" />
          Голубая линия показывает общую границу выбранной зоны
        </span>
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
