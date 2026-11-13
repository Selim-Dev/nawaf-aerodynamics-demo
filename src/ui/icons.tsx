import type { ReactNode, SVGProps } from 'react'

/** Line icons drawn inline, so nothing is fetched and they take the text colour. */
const paths = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  volume: (
    <>
      <path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4z" />
      <path d="M15.5 9a4.2 4.2 0 010 6M18.2 6.5a7.8 7.8 0 010 11" />
    </>
  ),
  mute: (
    <>
      <path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  exitFullscreen: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  reset: (
    <>
      <path d="M4 4.5V10h5.5" />
      <path d="M4.8 14.5A7.8 7.8 0 106.4 6.6L4 10" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </>
  ),
  frames: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="5.5" />
      <path d="M9 6.5v11M15 6.5v11" />
    </>
  ),
  flow: <path d="M3 9c3-3 6 3 9 0s6-3 9 0M3 15c3-3 6 3 9 0s6-3 9 0" />,
  cutaway: (
    <>
      <path d="M12 4.2a7.8 7.8 0 100 15.6" />
      <path d="M12 2.5v19" strokeDasharray="2.2 2.6" />
      <path d="M15.5 8.5l3.5 3.5-3.5 3.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </>
  ),
  moon: <path d="M20 14.2A8 8 0 019.8 4 7.4 7.4 0 1020 14.2z" />,
  pin: (
    <>
      <path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0113 0c0 4.9-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  focus: (
    <>
      <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  mouse: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="5" />
      <path d="M12 7v3.2" />
    </>
  ),
  zoom: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5M11 8.2v5.6M8.2 11h5.6" />
    </>
  ),
  move: <path d="M12 3v18M3 12h18M12 3l-2.6 2.6M12 3l2.6 2.6M12 21l-2.6-2.6M12 21l2.6-2.6M3 12l2.6-2.6M3 12l2.6 2.6M21 12l-2.6-2.6M21 12l-2.6 2.6" />,
  rotate: (
    <>
      <path d="M20 12a8 8 0 01-13.7 5.6M4 12a8 8 0 0113.7-5.6" />
      <path d="M17.5 3v3.6H14M6.5 21v-3.6H10" />
    </>
  ),
  pulse: <path d="M3 12h4l2.2-6 4.2 12 2.4-6H21" />,
  shape: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
  spark: <path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7z" fill="currentColor" stroke="none" />,
  hand: <path d="M9 11V5.2a1.6 1.6 0 013.2 0V10m0-1.2a1.6 1.6 0 013.2 0V11m0-.6a1.6 1.6 0 013.1.4v4.4A6.2 6.2 0 0112.3 21h-.6a6 6 0 01-5-2.7l-2.9-4.5a1.5 1.5 0 012.4-1.8L9 14.5" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {paths[name]}
    </svg>
  )
}

/** The brand mark: an airliner seen from above. */
export function PlaneMark({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M12 1.8c.85 0 1.45 1 1.45 2.4v4.5l7.75 4.7v2.1l-7.75-2.4v4.6l2.5 1.85v1.7L12 20.2l-3.95 1.05v-1.7l2.5-1.85v-4.6L2.8 15.5v-2.1l7.75-4.7V4.2c0-1.4.6-2.4 1.45-2.4z" />
    </svg>
  )
}
