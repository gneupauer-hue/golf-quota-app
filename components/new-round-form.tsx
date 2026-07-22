"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import type { RoundMode, ScoringEntryMode } from "@/lib/quota";

export function buildCreateRoundRequestBody(
  roundMode: RoundMode,
  isTestRound: boolean,
  roundDate?: string,
  scoringEntryMode: ScoringEntryMode = "QUICK"
) {
  return {
    roundMode,
    scoringEntryMode,
    isTestRound,
    ...(roundDate ? { roundDate } : {})
  };
}

// Local "today" as YYYY-MM-DD for the date input (avoids UTC day-shift).
function todayInputValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function NewRoundForm() {
  const router = useRouter();
  const [roundMode, setRoundMode] = useState<RoundMode>("MATCH_QUOTA");
  const [isTestRound, setIsTestRound] = useState(false);
  // Quick entry is disabled for now — every new round is hole-by-hole.
  const entryMode: ScoringEntryMode = "DETAILED";
  const [gameDate, setGameDate] = useState(todayInputValue());
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3.5">
      <PageTitle
        title="Round Setup"
        subtitle="Choose Match + Quota or Individual Quota + Skins, then start setup."
      />

      <SectionCard className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Game Type</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">Choose how this round will be played</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className={roundMode === "MATCH_QUOTA" ? "club-btn-primary min-h-12 text-sm" : "club-btn-secondary min-h-12 text-sm"}
            onClick={() => setRoundMode("MATCH_QUOTA")}
          >
            Match + Quota
          </button>
          <button
            type="button"
            className={roundMode === "SKINS_ONLY" ? "club-btn-primary min-h-12 text-sm" : "club-btn-secondary min-h-12 text-sm"}
            onClick={() => setRoundMode("SKINS_ONLY")}
          >
            Individual Quota + Skins
          </button>
        </div>


        <label className="block">
          <span className="mb-2 block text-sm font-semibold">Game date</span>
          <input
            type="date"
            value={gameDate}
            onChange={(event) => setGameDate(event.target.value)}
            className="h-14 w-full rounded-2xl border border-ink/10 bg-canvas px-4 text-base outline-none"
          />
          <span className="mt-1 block text-xs text-ink/60">
            The day this game is played. You can set one up for a future date — it keeps this date when posted.
          </span>
        </label>

        <label className="flex items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-canvas px-4 py-3">
          <span>
            <span className="block text-sm font-semibold">Test Round</span>
            <span className="mt-1 block text-xs text-ink/60">
              Test rounds are excluded from quota history and season statistics.
            </span>
          </span>
          <input
            type="checkbox"
            checked={isTestRound}
            onChange={(event) => setIsTestRound(event.target.checked)}
            className="h-5 w-5 accent-pine"
          />
        </label>

        <button
          disabled={isPending}
          className="min-h-14 w-full rounded-[24px] bg-ink px-4 text-base font-semibold text-white disabled:opacity-60"
          type="button"
          onClick={() => {
            setMessage("");
            startTransition(async () => {
              const response = await fetch("/api/rounds", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify(buildCreateRoundRequestBody(roundMode, isTestRound, gameDate, entryMode))
              });

              const result = await response.json();

              if (!response.ok) {
                setMessage(result.error ?? "Could not create round.");
                return;
              }

              router.push("/round-setup");
            });
          }}
        >
          {isPending ? "Starting..." : "Start Round"}
        </button>

        {message ? <p className="text-sm font-medium text-danger">{message}</p> : null}
      </SectionCard>
    </div>
  );
}
