export const POINT_COLORS = [
  '#16366f',
  '#d64545',
  '#7a3fc0',
  '#008a72',
  '#d17a00',
  '#be3b83',
] as const

export function colorForPoint(index: number): string {
  return POINT_COLORS[index % POINT_COLORS.length]
}
