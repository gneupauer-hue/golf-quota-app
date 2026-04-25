"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { classNames } from "@/lib/utils";

const links = [
  { href: "/", lines: ["Home"] },
  { href: "/round-setup", lines: ["Round", "Setup"] },
  { href: "/current-round", lines: ["Current", "Round"] },
  { href: "/side-matches", lines: ["Side", "Matches"] },
  { href: "/past-games", lines: ["Past", "Games"] },
  { href: "/players", lines: ["Players"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideHeader =
    pathname === "/" ||
    pathname === "/round-setup" ||
    pathname === "/current-round" ||
    pathname.startsWith("/side-matches") ||
    pathname === "/past-games" ||
    pathname === "/players" ||
    (pathname.startsWith("/rounds/") &&
      (pathname.endsWith("/results") || pathname.split("/").filter(Boolean).length === 2));

  return (
    <div className="min-h-[100dvh] bg-hero text-ink">
      <div
        className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-3.5 sm:px-4"
        style={{
          paddingTop: "max(24px, calc(env(safe-area-inset-top) + 16px))",
          paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))"
        }}
      >
        {hideHeader ? null : (
          <header className="mb-3 rounded-[24px] border border-pine/20 bg-grove px-4 py-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sand/90">
              Golf Quota
            </p>
            <p className="mt-1 text-sm font-bold text-canvas/92">
              Fast phone-first scoring built for the course.
            </p>
          </header>
        )}

        <main className="flex-1">{children}</main>
      </div>

      <nav
        className="fixed left-1/2 z-40 w-[calc(100%-1rem)] max-w-md -translate-x-1/2 rounded-[26px] border border-mist bg-card p-1.5 shadow-card"
        style={{
          bottom: "max(8px, calc(env(safe-area-inset-bottom) + 4px))"
        }}
      >
        <ul className="grid grid-cols-6 gap-1.5">
          {links.map((link) => {
            const active = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));

            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={classNames(
                    "flex min-h-[56px] items-center justify-center rounded-2xl px-1 py-1.5 text-center text-[11px] font-bold leading-[1.05rem] transition sm:text-xs",
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
