"use client";

export function RefreshAppButton() {
  return (
    <button
      type="button"
      className="min-h-12 w-full rounded-2xl border border-mist bg-card px-4 py-3 text-sm font-bold text-pine shadow-card"
      onClick={() => window.location.reload()}
    >
      Refresh App
    </button>
  );
}
