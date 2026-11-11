import { History, Bell, Bookmark, BriefcaseMedical, Star, Settings, Calendar, ChevronRight, Ellipsis, Globe, House, ListOrdered, Moon, Percent, RefreshCw, Search, Settings2, Target, TrendingUp, Trophy, User, Users, Zap, CirclePlus, X, type LucideIcon } from "lucide-react";

/** Lucide icons under this app's own names, so every screen draws the same set. They take their colour from the text (currentColor). */
const icons = {
  home: House,
  games: Trophy,
  standings: ListOrdered,
  teams: Users,
  team: Users,
  more: Ellipsis,
  trends: TrendingUp,
  players: User,
  nhlplus: CirclePlus,
  edge: Zap,
  injury: BriefcaseMedical,
  picks: Target,
  odds: Percent,
  map: Globe,
  chevron: ChevronRight,
  calendar: Calendar,
  search: Search,
  night: Moon,
  refresh: RefreshCw,
  preferences: Settings2,
  settings: Settings,
  star: Star,
  bell: Bell,
  bookmark: Bookmark,
  close: X,
  history: History,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  const Glyph = icons[name];
  return <Glyph className="icon" size={size} strokeWidth={1.8} aria-hidden="true" focusable="false" />;
}
