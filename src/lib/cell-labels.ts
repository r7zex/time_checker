import type { TravelSample } from '../types'

export function cellLabelLines(
  sample: Pick<TravelSample, 'minutes' | 'pointMinutes'>,
  includeBreakdown: boolean,
): string[] {
  const summary = String(Math.round(sample.minutes))
  if (!includeBreakdown || sample.pointMinutes.length < 2) return [summary]

  return [
    summary,
    ...sample.pointMinutes.map((minutes, index) =>
      `(Т${index + 1} ${Math.round(minutes)})`,
    ),
  ]
}
