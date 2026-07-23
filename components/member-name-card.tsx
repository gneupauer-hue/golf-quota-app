"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { useFirebaseAuth } from "@/components/firebase-auth-provider";
import { SectionCard } from "@/components/section-card";

const IREM_CLUB_ID = "eO5PwRmRZrQJW0VbEp0B";

export function MemberNameCard() {
  const { user } = useFirebaseAuth();
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadName() {
      if (!user) {
        return;
      }
      try {
        const snapshot = await getDoc(doc(getFirebaseDb(), "clubs", IREM_CLUB_ID, "members", user.uid));
        const current = snapshot.exists() ? (snapshot.data()?.displayName as string | undefined) : undefined;
        if (!cancelled && current) {
          setName(current);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void loadName();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return null;
  }

  async function save() {
    setInfo("");
    setError("");
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Enter your name.");
      return;
    }
    setBusy(true);
    try {
      const currentUser = getFirebaseAuth().currentUser;
      if (!currentUser) {
        throw new Error("Sign in first.");
      }
      const idToken = await currentUser.getIdToken();
      const response = await fetch("/api/firebase/member-name", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ name: trimmed })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not save your name.");
      }
      setInfo("Saved. This is the name shown on the game board.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your name.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard className="space-y-2 border border-pine/15">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Your name</p>
        <p className="mt-1 text-sm text-ink/65">Shown when you RSVP to a game.</p>
      </div>
      <input
        className="w-full rounded-lg border border-pine/20 bg-white px-3 py-3 text-base text-ink"
        placeholder={loaded ? "Your full name" : "Loading…"}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <button
        type="button"
        className="min-h-11 w-full rounded-xl bg-pine px-4 text-sm font-semibold text-white disabled:opacity-50"
        disabled={busy}
        onClick={save}
      >
        {busy ? "Saving…" : "Save name"}
      </button>
      {info ? <p className="text-sm font-semibold text-[#1B6B3A]">{info}</p> : null}
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
    </SectionCard>
  );
}
