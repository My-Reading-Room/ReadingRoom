"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Icon paths from the legacy app (24×24, stroked).
const ICONS: Record<string, React.ReactNode> = {
  insights: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M7 16V12m5 4V8m5 8v-5" />
    </>
  ),
  recaps: (
    <>
      <path d="M12 2.5 14.5 9l6.5 2.5-6.5 2.5L12 20.5 9.5 14 3 11.5 9.5 9z" />
      <path d="m19 18 1 1-1 1-1-1z" />
    </>
  ),
  friends: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  library: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </>
  ),
  log: <path d="M12 5v14M5 12h14" />,
  shelf: (
    <>
      <path d="M4 21V4m16 17V4M4 7h16M4 20h16" />
      <path d="M8 8v12m5-12v12m4-12v12" />
    </>
  ),
  settings: (
    <>
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
      <path d="M4.5 10 3 12l1.5 2 1 3 3 1 3.5 3 3.5-3 3-1 1-3 1.5-2-1.5-2-1-3-3-1L12 3 8.5 6l-3 1z" />
    </>
  ),
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

const TOP = [
  ["insights", "/insights", "Insights"],
  ["recaps", "/recaps", "Replay"],
  ["friends", "/friends", "Friends"],
  ["library", "/library", "My Library"],
  ["log", "/log", "Log Reading"],
  ["shelf", "/shelf", "Bookshelf"],
  ["settings", "/settings", "Settings"],
] as const;
// Legacy phone order: logging sits in the middle as the main action.
const BOTTOM = [
  ["library", "/library", "Library"],
  ["shelf", "/shelf", "Shelf"],
  ["insights", "/insights", "Insights"],
  ["log", "/log", "Log"],
  ["recaps", "/recaps", "Replay"],
  ["friends", "/friends", "Friends"],
  ["settings", "/settings", "Settings"],
] as const;

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/** Top navigation on wide screens; a bottom tab bar on phones (legacy .bottom-nav). */
export function AppNav() {
  const pathname = usePathname();
  return (
    <>
      <nav className="top-nav" aria-label="Main">
        {TOP.map(([, href, label]) => (
          <Link
            key={href}
            href={href}
            className={isActive(pathname, href) ? "active" : ""}
            aria-current={isActive(pathname, href) ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <nav className="bottom-nav" aria-label="Main (mobile)">
        {BOTTOM.map(([icon, href, label]) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}
            >
              {icon === "log" ? (
                <span className="add-icon">
                  <Icon name="log" />
                </span>
              ) : (
                <Icon name={icon} />
              )}
              <span className={icon === "log" ? "add-label" : ""}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
