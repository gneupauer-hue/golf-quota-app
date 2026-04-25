"use client";

import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
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
  disabled = false,
  compact = false
}: {
  value: number | null;
  onSelect: (value: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  function stopButtonPropagation(
    event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>
  ) {
    event.stopPropagation();
  }

  function handlePointerSelect(
    event: PointerEvent<HTMLButtonElement>,
    nextValue: number
  ) {
    event.preventDefault();
    event.stopPropagation();
    onSelect(nextValue);
  }

  function handleKeyboardSelect(
    event: KeyboardEvent<HTMLButtonElement>,
    nextValue: number
  ) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelect(nextValue);
  }

  return (
    <div
      className={classNames(
        "grid touch-manipulation",
        compact ? "grid-cols-6 gap-1.5" : "grid-cols-3 gap-3.5"
      )}
    >
      {scoreOptions.map((option) => {
        const selected = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onPointerDown={(event) => handlePointerSelect(event, option.value)}
            onClick={(event) => {
              stopButtonPropagation(event);
            }}
            onKeyDown={(event) => handleKeyboardSelect(event, option.value)}
            className={classNames(
              "border text-center transition active:scale-[0.98]",
              compact ? "min-h-[3.35rem] rounded-[18px] px-1 py-1.5" : "rounded-[22px] px-2 py-3.5 min-h-[4.9rem]",
              disabled
                ? "border-ink/5 bg-white/50 text-ink/30"
                : selected
                  ? "border-pine bg-pine text-white shadow-card ring-2 ring-pine/20"
                  : "border-ink/10 bg-canvas text-ink"
            )}
          >
            <span
              className={classNames(
                "block font-semibold leading-none",
                compact ? "text-[1.15rem]" : "text-[2rem]"
              )}
            >
              {option.value}
            </span>
            <span
              className={classNames(
                "block font-semibold uppercase tracking-[0.14em]",
                compact ? "mt-0.5 text-[8px] leading-none" : "mt-1 text-[10px]"
              )}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
