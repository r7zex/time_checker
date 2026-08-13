import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ControlPanel } from './ControlPanel'

describe('transport controls', () => {
  it('renders separate all-transit, metro-only and walking modes', () => {
    const markup = renderToStaticMarkup(
      <ControlPanel
        direction="to"
        transport="transit"
        detail="balanced"
        heatOpacity={0.46}
        targetMinutes={30}
        showIsochrone
        isochroneOpacity={1}
        points={[[55.758272, 37.611014]]}
        isAddingPoint={false}
        isCalculating={false}
        progress={{ completed: 0, total: 0, apiRequests: 0, cached: 0 }}
        error={null}
        isCollapsed={false}
        onDirectionChange={() => undefined}
        onTransportChange={() => undefined}
        onDetailChange={() => undefined}
        onHeatOpacityChange={() => undefined}
        onTargetMinutesChange={() => undefined}
        onShowIsochroneChange={() => undefined}
        onIsochroneOpacityChange={() => undefined}
        onAddingPointChange={() => undefined}
        onRemovePoint={() => undefined}
        onCalculate={() => undefined}
      />,
    )

    expect(markup).toContain('Весь транспорт + пешком')
    expect(markup).toContain('Только метро + пешком')
    expect(markup).toContain('Только пешком')
    expect(markup).toContain('Автобусы и трамваи учитываются только в первом режиме')
    expect(markup).toContain('aria-checked="true"')
  })
})
