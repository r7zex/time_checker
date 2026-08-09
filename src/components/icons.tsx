import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const baseProps: IconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export function TransitIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="5" y="3" width="14" height="15" rx="3" />
      <path d="M8 7h8M7 13h10M8 18l-1 3M16 18l1 3" />
      <circle cx="8.5" cy="15.5" r=".6" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r=".6" fill="currentColor" />
    </svg>
  )
}

export function MetroIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 19 8.3 5l3.7 7.2L15.7 5 21 19h-4.2l-1.5-4.2L12 20l-3.3-5.2L7.2 19H3Z" />
    </svg>
  )
}

export function BusIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="5" y="3" width="14" height="16" rx="3" />
      <path d="M7 9h10M7 14h10M8 19v2M16 19v2" />
    </svg>
  )
}

export function TramIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m9 3 3-2 3 2M8 5h8" />
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="M7 11h10M8 19l-2 3M16 19l2 3" />
    </svg>
  )
}

export function WalkIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="13" cy="4" r="2" />
      <path d="m10 22 2-7-3-3 2-5 4 3 3 1M12 15l4 3 1 4M9 12l-3 4" />
    </svg>
  )
}

export function PinIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

export function CrosshairIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10M4 12h4M12 12h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
      <circle cx="10" cy="12" r="2" />
    </svg>
  )
}
