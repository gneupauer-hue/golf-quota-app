"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SectionCard } from "@/components/section-card";

export function DeleteTestRoundButton({ roundId }: { roundId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function deleteTestRound() {
    if (
      !window.confirm(
        "Delete this test round? It's a test, so quotas and stats are not affected — this just clears it out."
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        setError("");
        const response = await fetch(`/api/rounds/${roundId}?force=1`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error ?? "Could not delete this test round.");
        }
        router.push("/past-games");
        router.refresh();
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Could not delete this test round.");
      }
    });
  }

  return (
    <SectionCard className="space-y-3 border border-danger/25 bg-[#FCE5E2]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-danger">Test Round</p>
        <p className="mt-1 text-sm text-ink/75">
          Reviewed everything? Delete it to clear it out. Quotas and season stats are not affected.
        </p>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={deleteTestRound}
        className="min-h-12 w-full rounded-2xl bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "Deleting…" : "Delete Test Round"}
      </button>
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
    </SectionCard>
  );
}
