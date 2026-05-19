"use client";

import { useEffect, useState } from "react";

const refreshStorageKey = "lastAppRefreshAt";

function formatRefreshTime(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const elapsedMs = Date.now() - timestamp;
  if (elapsedMs >= 0 && elapsedMs < 60_000) {
    return "Last refreshed just now";
  }

  return `Last refreshed ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp))}`;
}

export function RefreshAppButton() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshLabel, setLastRefreshLabel] = useState<string | null>(null);

  useEffect(() => {
    setLastRefreshLabel(formatRefreshTime(window.localStorage.getItem(refreshStorageKey)));
  }, []);

  function handleRefresh() {
    setIsRefreshing(true);
    window.localStorage.setItem(refreshStorageKey, String(Date.now()));
    window.location.reload();
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        className="min-h-12 w-full rounded-2xl border border-mist bg-card px-4 py-3 text-sm font-bold text-pine shadow-card disabled:opacity-70"
        disabled={isRefreshing}
        onClick={handleRefresh}
      >
        {isRefreshing ? "Refreshing..." : "Refresh App"}
      </button>
      {lastRefreshLabel ? (
        <p className="text-center text-xs font-semibold text-ink/55">{lastRefreshLabel}</p>
      ) : null}
    </div>
  );
}
