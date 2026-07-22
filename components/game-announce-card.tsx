"use client";

import { useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useFirebaseAuth } from "@/components/firebase-auth-provider";
import { SectionCard } from "@/components/section-card";

const IREM_CLUB_ID = "eO5PwRmRZrQJW0VbEp0B";
const MAX_LENGTH = 640;

export function GameAnnounceCard() {
  const { memberships } = useFirebaseAuth();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const isOwner = memberships.some(
    (membership) =>
      membership.clubId === IREM_CLUB_ID &&
      membership.status === "active" &&
      (membership.role === "owner" || membership.role === "admin")
  );
  if (!isOwner) {
    return null;
  }

  async function send() {
    setError("");
    setResult("");
    const text = message.trim();
    if (!text) {
      setError("Enter a message first.");
      return;
    }
    setBusy(true);
    try {
      const currentUser = getFirebaseAuth().currentUser;
      if (!currentUser) {
        throw new Error("Sign in first.");
      }
      const idToken = await currentUser.getIdToken();
      const response = await fetch("/api/firebase/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ message: text })
      });
      const data = (await response.json()) as {
        error?: string;
        sent?: number;
        failed?: number;
        total?: number;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not send the text.");
      }
      const failedNote = data.failed ? `, ${data.failed} failed` : "";
      setResult(`Sent to ${data.sent ?? 0} of ${data.total ?? 0} member(s)${failedNote}.`);
      setMessage("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send the text.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard className="space-y-3 border border-pine/15">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Owner</p>
        <h3 className="mt-1 text-lg font-semibold text-ink">Text the group</h3>
        <p className="mt-1 text-sm text-ink/65">
          Sends to every approved member who opted in to game texts.
        </p>
      </div>
      <textarea
        className="w-full rounded-lg border border-pine/20 bg-white px-3 py-3 text-base text-ink"
        rows={3}
        maxLength={MAX_LENGTH}
        placeholder="e.g. Sat 8am shotgun at Irem — who's in? Text Gary back."
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <button
        type="button"
        className="min-h-12 w-full rounded-xl bg-pine px-4 font-semibold text-white disabled:opacity-50"
        disabled={busy}
        onClick={send}
      >
        {busy ? "Sending…" : "Send text to members"}
      </button>
      {result ? (
        <p className="rounded-lg border border-pine/15 bg-[#EAF6EC] px-3 py-3 text-sm font-semibold text-[#1B6B3A]">
          {result}
        </p>
      ) : null}
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
    </SectionCard>
  );
}
