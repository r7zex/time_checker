import { useCallback, useRef } from 'react'
import type { Coordinates, TravelSample } from '../types'

interface DemoMapProps {
  point: Coordinates | null
  samples: TravelSample[]
  onPointChange: (point: Coordinates) => void
}

export function DemoMap({ point, samples, onPointChange }: DemoMapProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const bounds = surfaceRef.current?.getBoundingClientRect()
      if (!bounds) return
      const x = (event.clientX - bounds.left) / bounds.width
      const y = (event.clientY - bounds.top) / bounds.height
      onPointChange([55.9 - y * 0.35, 37.35 + x * 0.58])
    },
    [onPointChange],
  )

  return (
    <div
      className="demo-map"
      ref={surfaceRef}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Демонстрационная карта. Нажмите, чтобы выбрать точку"
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          onPointChange([55.7512, 37.6184])
        }
      }}
    >
      <svg viewBox="0 0 1200 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="1200" height="900" fill="#edf2ee" />
        <path className="demo-map__park" d="M80 80h260l80 190-110 150H50Z" />
        <path className="demo-map__park" d="m920 20 230 70-20 240-190 40-100-170Z" />
        <path className="demo-map__river" d="M-40 580c190-170 300-40 450-115s270-260 430-160 190 280 420 170" />
        {Array.from({ length: 15 }, (_, index) => (
          <path
            className="demo-map__road"
            d={`M-40 ${80 + index * 56} C300 ${10 + index * 64}, 760 ${160 + index * 42}, 1240 ${40 + index * 58}`}
            key={`h-${index}`}
          />
        ))}
        {Array.from({ length: 14 }, (_, index) => (
          <path
            className="demo-map__road demo-map__road--minor"
            d={`M${70 + index * 88} -30 C${10 + index * 80} 260, ${160 + index * 78} 620, ${40 + index * 90} 940`}
            key={`v-${index}`}
          />
        ))}
        <circle className="demo-map__ring" cx="620" cy="445" r="250" />
        <circle className="demo-map__ring" cx="620" cy="445" r="150" />
      </svg>

      {samples.length > 0 ? <div className="demo-heat" aria-hidden="true" /> : null}
      <span className="demo-label demo-label--one">ЦЕНТР</span>
      <span className="demo-label demo-label--two">СЕВЕРНЫЙ</span>
      <span className="demo-label demo-label--three">ПАРКОВЫЙ</span>
      {point ? <span className="selected-pin" aria-label="Выбранная точка" /> : null}
      <span className="demo-badge">Демо без API</span>
    </div>
  )
}
