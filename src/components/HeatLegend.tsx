const legend = [
  ['#76d367', 'до 15 мин', '≤15'],
  ['#f6d35b', '15–30', '15–30'],
  ['#f69d56', '30–45', '30–45'],
  ['#e86b69', '45–60', '45–60'],
  ['#ae65aa', '60+', '60+ мин'],
] as const

export function HeatLegend() {
  return (
    <div className="heat-legend" aria-label="Легенда времени в пути">
      {legend.map(([color, desktop, mobile]) => (
        <div className="heat-legend__item" key={desktop}>
          <span className="heat-legend__swatch" style={{ background: color }} />
          <span className="heat-legend__desktop-label">{desktop}</span>
          <span className="heat-legend__mobile-label">{mobile}</span>
        </div>
      ))}
    </div>
  )
}
