import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { OpenMap } from './OpenMap'

describe('OpenMap visual layer structure', () => {
  it('keeps the overlay canvas outside the DOM container owned by MapLibre', () => {
    const markup = renderToStaticMarkup(
      <OpenMap
        point={[55.758272, 37.611014]}
        samples={[]}
        detail="fast"
        heatOpacity={0.46}
        targetMinutes={30}
        onPointChange={vi.fn()}
        onBoundsChange={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(markup).toContain(
      'aria-label="Карта выбора точки"></div><canvas class="heat-canvas"',
    )
  })
})
