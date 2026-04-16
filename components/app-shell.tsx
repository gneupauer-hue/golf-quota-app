"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { classNames } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/current-round", label: "Current Round" },
  { href: "/past-games", label: "Past Games" },
  { href: "/players", label: "Players" }
];

export function AppShell({
  children,
  appMode
}: {
  children: React.ReactNode;
  appMode: "demo" | "live";
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-hero text-ink">
      <div className="mx-auto w-full max-w-md px-4 pb-24 pt-3">
        <header className="mb-3 rounded-[24px] border border-white/60 bg-white/80 px-4 py-3 shadow-card backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pine/70">
              Golf Quota
            </p>
            <span
              className={classNames(
                "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                appMode === "demo"
                  ? "bg-[#FFF1BF] text-ink"
                  : "bg-[#E2F4E6] text-pine"
              )}
            >
              {appMode === "demo" ? "Demo Mode" : "Live Mode"}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-ink/72">Fast phone-first scoring built for the course.</p>
        </header>

        <main>{children}</main>
      </div>

      <nav className="fixed bottom-3 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-[28px] border border-ink/10 bg-white/92 p-2 shadow-card backdrop-blur">
        <ul className="grid grid-cols-5 gap-2">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href !== "/" && pathname.startsWith(link.href));

            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={classNames(
                    "flex min-h-12 items-center justify-center rounded-2xl px-3 text-sm font-semibold transition",
                    active ? "bg-pine text-white" : "bg-canvas text-ink/75"
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
