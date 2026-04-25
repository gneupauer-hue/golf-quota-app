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
          router.push("/round-setup");
          router.refresh();
          return;
        }
        setMessage(result.error ?? "Could not create round.");
        return;
      }

      router.push("/round-setup");
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
        className="club-btn-primary min-h-14 w-full rounded-[24px] px-5 py-4 text-base disabled:opacity-60"
      >
        {isPending ? "Creating Round..." : "Open Round Setup"}
      </button>
      {message ? <p className="text-sm font-medium text-danger">{message}</p> : null}
    </div>
  );
}
