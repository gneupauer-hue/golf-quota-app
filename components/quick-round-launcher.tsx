"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDateInput, formatRoundNameFromDate } from "@/lib/utils";

export function QuickRoundLauncher() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");

  async function createRound() {
    if (isPending) {
      return;
    }

    setIsPending(true);
    setMessage("");

    const roundDate = formatDateInput(new Date());
    const roundName = formatRoundNameFromDate(roundDate);

    try {
      const response = await fetch("/api/rounds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roundName,
          roundDate,
          notes: ""
        })
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409 && result.activeRoundId) {
          router.push(`/rounds/${result.activeRoundId}`);
          router.refresh();
          return;
        }
        setMessage(result.error ?? "Could not create round.");
        return;
      }

      router.push(`/rounds/${result.round.id}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create round.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={isPending}
        onClick={createRound}
        className="flex min-h-14 w-full items-center justify-center rounded-[24px] bg-pine px-5 py-4 text-base font-semibold text-white shadow-card disabled:opacity-60"
      >
        {isPending ? "Creating Round..." : "+ New Round"}
      </button>
      {message ? <p className="text-sm text-[#A53B2A]">{message}</p> : null}
    </div>
  );
}
