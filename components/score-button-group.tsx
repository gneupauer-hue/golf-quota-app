"use client";

import { classNames } from "@/lib/utils";

const scoreOptions = [
  { value: 2, label: "Par" },
  { value: 1, label: "Bogey" },
  { value: 0, label: "Double+" },
  { value: 4, label: "Birdie" },
  { value: 6, label: "Eagle" },
  { value: -1, label: "Triple" }
] as const;

export function ScoreButtonGroup({
  value,
  onSelect,
  disabled = false
}: {
  value: number | null;
  onSelect: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {scoreOptions.map((option) => {
        const selected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className={classNames(
              "min-h-[4.75rem] rounded-[22px] border px-2 py-3 text-center transition",
              disabled
                ? "border-ink/5 bg-white/50 text-ink/30"
                : selected
                  ? "border-pine bg-pine text-white shadow-card ring-2 ring-pine/20"
                  : "border-ink/10 bg-canvas text-ink"
            )}
          >
            <span className="block text-[2rem] font-semibold leading-none">{option.value}</span>
            <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em]">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
