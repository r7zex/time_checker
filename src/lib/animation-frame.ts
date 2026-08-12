export function cancelScheduledFrame(
  frameRef: { current: number | null },
  cancelFrame: (frame: number) => void,
) {
  const scheduledFrame = frameRef.current
  if (scheduledFrame === null) return
  cancelFrame(scheduledFrame)
  frameRef.current = null
}
