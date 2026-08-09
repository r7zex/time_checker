interface ColorStop {
  minutes: number
  color: readonly [number, number, number]
}

const STOPS: readonly ColorStop[] = [
  { minutes: 0, color: [118, 211, 103] },
  { minutes: 15, color: [176, 218, 91] },
  { minutes: 30, color: [246, 211, 91] },
  { minutes: 45, color: [246, 157, 86] },
  { minutes: 60, color: [232, 107, 105] },
  { minutes: 90, color: [174, 101, 170] },
]

export function colorForMinutes(minutes: number, alpha = 0.42): string {
  const clamped = Math.max(0, Math.min(90, minutes))
  let lower = STOPS[0]
  let upper = STOPS[STOPS.length - 1]

  for (let index = 1; index < STOPS.length; index += 1) {
    if (clamped <= STOPS[index].minutes) {
      lower = STOPS[index - 1]
      upper = STOPS[index]
      break
    }
  }

  const span = upper.minutes - lower.minutes || 1
  const ratio = (clamped - lower.minutes) / span
  const channels = lower.color.map((channel, index) =>
    Math.round(channel + (upper.color[index] - channel) * ratio),
  )

  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`
}
