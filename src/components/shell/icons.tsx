const P: Record<string, string> = {
  today: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  orbit: 'M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M3 12c0-3 4-5 9-5s9 2 9 5-4 5-9 5-9-2-9-5z',
  watch: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  sources: 'M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M5 19m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
  ideas: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.5 1 .5 1.6h6c0-.6 0-1.2.5-1.6A6 6 0 0 0 12 3z',
  studio: 'M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4zM14 7l3 3',
  plan: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  formats: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  library: 'M5 4h4v16H5zM11 4h4v16h-4zM17.5 5.5l3.7 1-3.5 13.5-3.7-1',
  manager: 'M4 5h16v11H9l-5 4V5z',
  setup: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2.2.4-1.6-1.6L16.6 4l-3-1-1 2h-1.2l-1-2-3 1 .4 2.2-1.6 1.6L5 8l-3 1 1 2v1.2L1 13l1 3 2.2-.4 1.6 1.6L5.4 20l3 1 1-2h1.2l1 2 3-1-.4-2.2 1.6-1.6L21 16l-2-1z',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V4a3 3 0 0 0-3 0zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1',
  trainer: 'M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z',
  staff: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5M22 20c0-3-3-5-6-5M8 20c0-3 2-5 4-5s4 2 4 5',
  team: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7',
  billing: 'M3 6h18v12H3zM3 10h18M7 15h3',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 7m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8 17m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  theme: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
  out: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  more: 'M5 12m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M12 12m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M19 12m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  fold: 'M4 4h16v16H4zM9 4v16M15 9l-3 3 3 3',
  unfold: 'M4 4h16v16H4zM9 4v16M13 9l3 3-3 3',
}
export type IconName = keyof typeof P
export function Icon({ name, size = 18, active = false }: { name: IconName; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.1 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={P[name]} />
    </svg>
  )
}
