"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { formatDateInput, formatRoundNameFromDate } from "@/lib/utils";

export function NewRoundForm() {
  const router = useRouter();
  const [roundDate, setRoundDate] = useState(formatDateInput(new Date()));
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3.5">
      <PageTitle
        title="Round Setup"
        subtitle="Create the round first, then finish players, teams, and review here before live scoring starts."
      />

      <SectionCard className="space-y-0">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage("");

            startTransition(async () => {
              const response = await fetch("/api/rounds", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  roundName: formatRoundNameFromDate(roundDate),
                  roundDate,
                  notes
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
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Round date</span>
            <input
              required
              type="date"
              className="h-14 w-full rounded-2xl border border-ink/10 bg-canvas px-4 text-base outline-none"
              value={roundDate}
              onChange={(event) => setRoundDate(event.target.value)}
            />
          </label>

          <p className="text-sm text-ink/65">{`Round name will be ${formatRoundNameFromDate(roundDate)}`}</p>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Notes</span>
            <textarea
              rows={4}
              className="w-full rounded-2xl border border-ink/10 bg-canvas px-4 py-3 text-base outline-none"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes for the round"
            />
          </label>

          <button
            disabled={isPending}
            className="min-h-14 w-full rounded-[24px] bg-ink px-4 text-base font-semibold text-white disabled:opacity-60"
            type="submit"
          >
            {isPending ? "Creating..." : "Start Round Setup"}
          </button>

          {message ? <p className="text-sm font-medium text-danger">{message}</p> : null}
        </form>
      </SectionCard>
    </div>
  );
}
