"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import type { RoundMode } from "@/lib/quota";

export function NewRoundForm() {
  const router = useRouter();
  const [roundMode, setRoundMode] = useState<RoundMode>("MATCH_QUOTA");
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

        <div className="rounded-[24px] border border-sand/60 bg-canvas/65 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">Scoring</p>
          <h3 className="mt-1 text-base font-semibold text-ink">Scorecard Entry</h3>
          <p className="mt-1 text-sm text-ink/65">
            Enter front 9, back 9, and skin holes. Individual Quota + Skins has no team match or side matches.
          </p>
        </div>

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
                body: JSON.stringify({
                  roundMode,
                  scoringEntryMode: "QUICK"
                })
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