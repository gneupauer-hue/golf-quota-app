"use client";

import type { ChangeEvent, MouseEvent } from "react";
import { classNames } from "@/lib/utils";

// Order requested by the owner: 6, 4, 2, 1, 0, -1.
const scoreOptions = [
  { value: 6, label: "6 · Eagle" },
  { value: 4, label: "4 · Birdie" },
  { value: 2, label: "2 · Par" },
  { value: 1, label: "1 · Bogey" },
  { value: 0, label: "0 · Double+" },
  { value: -1, label: "-1 · Triple+" }
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
