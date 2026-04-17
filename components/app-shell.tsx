"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { classNames } from "@/lib/utils";

const links = [
  { href: "/", lines: ["Home"] },
  { href: "/leaderboard", lines: ["Leader", "Board"] },
  { href: "/current-round", lines: ["Current", "Round"] },
  { href: "/past-games", lines: ["Past", "Games"] },
  { href: "/players", lines: ["Players"] },
  { href: "/season-stats", lines: ["Season"] }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-hero text-ink">
      <div className="mx-auto w-full max-w-md px-4 pb-24 pt-3">
        <header className="mb-3 rounded-[24px] border border-pine/20 bg-grove px-4 py-4 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sand/90">
            Golf Quota
          </p>
          <p className="mt-1 text-sm font-bold text-canvas/92">
            Fast phone-first scoring built for the course.
          </p>
        </header>

        <main>{children}</main>
      </div>

      <nav className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-[28px] border border-mist bg-card p-2 shadow-card">
        <ul className="grid grid-cols-6 gap-1.5">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/" && pathname.startsWith(link.href));

            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={classNames(
                    "flex min-h-[60px] items-center justify-center rounded-2xl px-1.5 py-2 text-center text-xs font-bold leading-tight transition sm:text-sm",
                    active ? "bg-pine text-canvas" : "bg-white text-ink"
                  )}
                >
                  <span className="flex flex-col items-center justify-center gap-0.5">
                    {link.lines.map((line) => (
                      <span key={`${link.href}-${line}`} className="block">
                        {line}
                      </span>
                    ))}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
