import type { ComponentType, SVGProps } from 'react'
import {
  ClockIcon,
  CrosshairIcon,
  MetroIcon,
  PlusIcon,
  WalkIcon,
} from './icons'
import { colorForPoint } from '../lib/point-colors'
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
  showIsochrone: boolean
  isochroneOpacity: number
  points: Coordinates[]
  isAddingPoint: boolean
  isCalculating: boolean
  progress: CalculationProgress
  error: string | null
  isCollapsed: boolean
  onDirectionChange: (direction: Direction) => void
  onTransportChange: (transport: TransportMode) => void
  onDetailChange: (detail: DetailLevel) => void
  onHeatOpacityChange: (opacity: number) => void
  onTargetMinutesChange: (minutes: number) => void
  onShowIsochroneChange: (show: boolean) => void
  onIsochroneOpacityChange: (opacity: number) => void
  onAddingPointChange: (isAdding: boolean) => void
  onRemovePoint: (index: number) => void
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

const MIN_TARGET_MINUTES = 1
const MAX_TARGET_MINUTES = 120

function clampTargetMinutes(minutes: number): number {
  return Math.min(
    MAX_TARGET_MINUTES,
    Math.max(MIN_TARGET_MINUTES, Math.round(minutes)),
  )
}

export function ControlPanel({
  direction,
  transport,
  detail,
  heatOpacity,
  targetMinutes,
  showIsochrone,
  isochroneOpacity,
  points,
  isAddingPoint,
  isCalculating,
  progress,
  error,
  isCollapsed,
  onDirectionChange,
  onTransportChange,
  onDetailChange,
  onHeatOpacityChange,
  onTargetMinutesChange,
  onShowIsochroneChange,
  onIsochroneOpacityChange,
  onAddingPointChange,
  onRemovePoint,
  onCalculate,
}: ControlPanelProps) {
  const hasPoint = points.length > 0
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

      <section className="point-manager" aria-label="Выбранные точки">
        <div className="point-manager__header">
          <strong>Точки ({points.length})</strong>
          <button
            className={`add-point-button ${isAddingPoint ? 'is-active' : ''}`}
            type="button"
            aria-pressed={isAddingPoint}
            onClick={() => onAddingPointChange(!isAddingPoint)}
          >
            <PlusIcon />
            {isAddingPoint ? 'Отменить' : 'Добавить точку'}
          </button>
        </div>

        {points.length > 0 ? (
          <ol className="point-list">
            {points.map((point, index) => (
              <li key={`${point[0]}:${point[1]}:${index}`}>
                <span
                  className="point-number"
                  style={{ backgroundColor: colorForPoint(index) }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="point-coordinates">
                  {point[0].toFixed(5)}, {point[1].toFixed(5)}
                </span>
                <button
                  className="remove-point-button"
                  type="button"
                  aria-label={`Удалить точку ${index + 1}`}
                  onClick={() => onRemovePoint(index)}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="point-manager__empty">Нажмите на карту, чтобы выбрать точку</p>
        )}

        <small className={isAddingPoint ? 'is-active' : ''}>
          {isAddingPoint
            ? 'Нажмите на карту — новая точка добавится к существующим'
            : points.length > 1
              ? 'Итог клетки — самое долгое время среди всех точек'
              : 'Обычный клик по карте перемещает точку 1'}
        </small>
      </section>

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
            <span className="minutes-input">
              до
              <input
                type="number"
                min={MIN_TARGET_MINUTES}
                max={MAX_TARGET_MINUTES}
                step="1"
                value={targetMinutes}
                aria-label="Время границы вручную"
                onChange={(event) => {
                  const value = event.currentTarget.valueAsNumber
                  if (Number.isFinite(value)) {
                    onTargetMinutesChange(clampTargetMinutes(value))
                  }
                }}
              />
              мин
            </span>
          </span>
          <input
            type="range"
            min={MIN_TARGET_MINUTES}
            max={MAX_TARGET_MINUTES}
            step="1"
            value={targetMinutes}
            aria-label="Время границы доступности"
            onChange={(event) => onTargetMinutesChange(Number(event.target.value))}
          />
        </label>
        <label className="toggle-control">
          <input
            type="checkbox"
            checked={showIsochrone}
            onChange={(event) => onShowIsochroneChange(event.currentTarget.checked)}
          />
          <span className="toggle-control__track" aria-hidden="true">
            <span />
          </span>
          <span>Показывать выделение зоны</span>
        </label>
        <label className={`range-control ${showIsochrone ? '' : 'is-disabled'}`}>
          <span className="range-control__header">
            <span>Непрозрачность выделения</span>
            <output>{Math.round(isochroneOpacity * 100)}%</output>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isochroneOpacity}
            disabled={!showIsochrone}
            aria-label="Непрозрачность выделения зоны"
            onChange={(event) =>
              onIsochroneOpacityChange(Number(event.currentTarget.value))
            }
          />
        </label>
        <span className={`boundary-key ${showIsochrone ? '' : 'is-disabled'}`}>
          <span aria-hidden="true" />
          {showIsochrone
            ? 'Голубая линия показывает общую границу выбранной зоны'
            : 'Выделение зоны выключено'}
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
