import { describe, expect, it, vi } from 'vitest'
import { cancelScheduledFrame } from './animation-frame'

describe('animation frame lifecycle', () => {
  it('allows a new draw to be scheduled after StrictMode cleanup', () => {
    const frameRef = { current: 42 as number | null }
    const cancelFrame = vi.fn()

    cancelScheduledFrame(frameRef, cancelFrame)

    expect(cancelFrame).toHaveBeenCalledWith(42)
    expect(frameRef.current).toBeNull()

    if (frameRef.current === null) frameRef.current = 43
    expect(frameRef.current).toBe(43)
  })
})
