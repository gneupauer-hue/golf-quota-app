"use client";

import { useEffect, useState } from "react";
import { SectionCard } from "@/components/section-card";

// Baked into THIS bundle at build time — a stale installed app keeps its old value.
const CLIENT_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";
const CLIENT_BUILT_AT = process.env.NEXT_PUBLIC_BUILD_TIME ?? null;

function formatBuilt(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function AppVersionBadge() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        const data = (await response.json()) as { sha?: string };
        if (!cancelled && data?.sha && CLIENT_SHA !== "dev" && data.sha !== CLIENT_SHA) {
          setUpdateAvailable(true);
        }
      } catch {
        // Offline or unreachable — leave as-is.
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const built = formatBuilt(CLIENT_BUILT_AT);

  return (
    <SectionCard className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink/45">App version</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {CLIENT_SHA}
            {built ? <span className="font-normal text-ink/55">{` · updated ${built}`}</span> : null}
          </p>
        </div>
        {!updateAvailable ? (
          <span className="shrink-0 rounded-full bg-[#EAF6EC] px-3 py-1.5 text-xs font-semibold text-[#1B6B3A]">
            Up to date
          </span>
        ) : null}
      </div>
      {updateAvailable ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 w-full rounded-xl bg-pine px-4 text-sm font-semibold text-white"
        >
          New version available — tap to update
        </button>
      ) : null}
    </SectionCard>
  );
}
