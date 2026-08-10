export interface HeatBand {
  maxMinutes: number
  color: string
  label: string
}

export const HEAT_BANDS: readonly HeatBand[] = [
  { maxMinutes: 6, color: '#66c75d', label: '0–6' },
  { maxMinutes: 12, color: '#8fd269', label: '6–12' },
  { maxMinutes: 18, color: '#b9d968', label: '12–18' },
  { maxMinutes: 24, color: '#dedb60', label: '18–24' },
  { maxMinutes: 30, color: '#f6d35b', label: '24–30' },
  { maxMinutes: 36, color: '#f6bc58', label: '30–36' },
  { maxMinutes: 42, color: '#f69d56', label: '36–42' },
  { maxMinutes: 48, color: '#f17e5b', label: '42–48' },
  { maxMinutes: 54, color: '#e86b69', label: '48–54' },
  { maxMinutes: 60, color: '#cf6285', label: '54–60' },
  { maxMinutes: Number.POSITIVE_INFINITY, color: '#ae65aa', label: '60+' },
] as const

export function heatBandForMinutes(minutes: number): HeatBand {
  const normalized = Math.max(0, minutes)
  return HEAT_BANDS.find((band) => normalized <= band.maxMinutes) ?? HEAT_BANDS.at(-1)!
}

export function colorForMinutes(minutes: number, alpha = 0.46): string {
  const color = heatBandForMinutes(minutes).color
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}
