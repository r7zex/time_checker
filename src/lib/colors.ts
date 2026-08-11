export interface HeatBand {
  maxMinutes: number
  color: string
  label: string
}

const COLOR_STOPS = [
  { minutes: 0, color: '#49b94f' },
  { minutes: 6, color: '#66c75d' },
  { minutes: 12, color: '#8fd269' },
  { minutes: 18, color: '#b9d968' },
  { minutes: 24, color: '#dedb60' },
  { minutes: 30, color: '#f6d35b' },
  { minutes: 36, color: '#f6bc58' },
  { minutes: 42, color: '#f69d56' },
  { minutes: 48, color: '#f17e5b' },
  { minutes: 54, color: '#e86b69' },
  { minutes: 60, color: '#cf6285' },
] as const

function interpolateHexColor(minutes: number): string {
  const upperIndex = COLOR_STOPS.findIndex((stop) => minutes <= stop.minutes)
  const upper = COLOR_STOPS[Math.max(1, upperIndex)]
  const lower = COLOR_STOPS[Math.max(0, upperIndex - 1)]
  const ratio = (minutes - lower.minutes) / (upper.minutes - lower.minutes)
  const channels = [1, 3, 5].map((offset) => {
    const from = Number.parseInt(lower.color.slice(offset, offset + 2), 16)
    const to = Number.parseInt(upper.color.slice(offset, offset + 2), 16)
    return Math.round(from + (to - from) * ratio)
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

export const HEAT_BANDS: readonly HeatBand[] = [
  ...Array.from({ length: 20 }, (_, index) => {
    const minMinutes = index * 3
    const maxMinutes = minMinutes + 3
    return {
      maxMinutes,
      color: interpolateHexColor(maxMinutes),
      label: `${minMinutes}–${maxMinutes}`,
    }
  }),
  { maxMinutes: Number.POSITIVE_INFINITY, color: '#ae65aa', label: '60+' },
]

export function heatBandForMinutes(minutes: number): HeatBand {
  const normalized = Math.max(0, minutes)
  return HEAT_BANDS.find((band) => normalized <= band.maxMinutes) ?? HEAT_BANDS.at(-1)!
}

export function rgbForMinutes(minutes: number): readonly [number, number, number] {
  const color = heatBandForMinutes(minutes).color
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ]
}

export function colorForMinutes(minutes: number, alpha = 0.46): string {
  const [red, green, blue] = rgbForMinutes(minutes)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
