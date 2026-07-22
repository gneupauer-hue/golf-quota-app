"use client";

import type { ChangeEvent, MouseEvent } from "react";
import { classNames } from "@/lib/utils";

// Golf term first (how players think), points shown small, ordered best to worst
// like a scorecard. Albatross (8) is a double eagle — a 2 on a par 5 or a 1 on a
// par 4 (a par-4 hole-in-one).
const scoreOptions = [
  { value: 8, label: "Albatross · 8" },
  { value: 6, label: "Eagle · 6" },
  { value: 4, label: "Birdie · 4" },
  { value: 2, label: "Par · 2" },
  { value: 1, label: "Bogey · 1" },
  { value: 0, label: "Double bogey · 0" },
  { value: -1, label: "Triple+ · -1" }
] as const;

// A native <select> is deliberate: unlike tap buttons, a native picker can't be
// triggered by a finger brushing it while the list scrolls, which was entering
// wrong scores. You have to open it and choose.
export function ScoreDropdown({
  value,
  onSelect,
  disabled = false
}: {
  value: number | null;
  onSelect: (value: number | null) => void;
  disabled?: boolean;
}) {
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const raw = event.target.value;
    onSelect(raw === "" ? null : Number(raw));
  }

  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={handleChange}
      onClick={(event: MouseEvent<HTMLSelectElement>) => event.stopPropagation()}
      className={classNames(
        "min-h-12 w-full touch-manipulation rounded-2xl border border-mist bg-canvas px-3 text-base font-semibold text-ink",
        "appearance-none outline-none focus:border-pine disabled:opacity-50"
      )}
      aria-label="Hole score"
    >
      <option value="">Tap to enter score…</option>
      {scoreOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
