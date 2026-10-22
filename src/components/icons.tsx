import type { ReactNode } from "react";

/** Simple 24px stroke icons that take their colour from the text (currentColor). Drawn for this app. */
const paths: Record<string, ReactNode> = {
  games: (<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M12 5v14" /><circle cx="12" cy="12" r="2.2" /></>),
  standings: <path d="M5 20v-8M12 20V5M19 20V9" />,
  trends: <path d="M3 17l6-7 4 4 8-9M15 5h6v6" />,
  players: (<><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c.6-4 3.8-6 7.5-6s6.9 2 7.5 6" /></>),
  more: (<><circle cx="5.5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18.5" cy="12" r="1.2" /></>),
  nhlplus: (<><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>),
  edge: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  odds: (<><path d="M19 5L5 19" /><circle cx="7" cy="7" r="2.3" /><circle cx="17" cy="17" r="2.3" /></>),
  map: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18" /></>),
  chevron: <path d="M9 6l6 6-6 6" />,
  calendar: (<><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>),
  refresh: <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
