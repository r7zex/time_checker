import { HEAT_BANDS } from '../lib/colors'

export function HeatLegend() {
  return (
    <div className="heat-legend" aria-label="Легенда времени в пути">
      {HEAT_BANDS.map(({ color, label }) => (
        <div className="heat-legend__item" key={label}>
          <span className="heat-legend__swatch" style={{ background: color }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
