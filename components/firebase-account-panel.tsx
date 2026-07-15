"use client";

import { useState, useTransition } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { useFirebaseAuth } from "@/components/firebase-auth-provider";

export function FirebaseAccountPanel() {
  const { user, memberships, activeClubId, loading, authError, setActiveClubId, signOut } = useFirebaseAuth();
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [clubName, setClubName] = useState("Irem Golf Quota");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submitAuth() {
    startTransition(async () => {
      try {
        setMessage("");
        const auth = getFirebaseAuth();

        if (mode === "create") {
          const credential = await createUserWithEmailAndPassword(auth, email, password);
          if (displayName.trim()) {
            await updateProfile(credential.user, { displayName: displayName.trim() });
          }
          setMessage("Account created.");
        } else {
          await signInWithEmailAndPassword(auth, email, password);
          setMessage("Signed in.");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not sign in.");
      }
    });
  }

  function createClub() {
    startTransition(async () => {
      try {
        setMessage("");
        const currentUser = getFirebaseAuth().currentUser;
        if (!currentUser) {
          throw new Error("Sign in before creating a club.");
        }

        const idToken = await currentUser.getIdToken();
        const response = await fetch("/api/firebase/clubs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify({ name: clubName })
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not create club.");
        }

        await setActiveClubId(result.clubId);
        setMessage("Club created and selected.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not create club.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <PageTitle
        title="Account"
        subtitle="Firebase Phase 1: sign in and create the Irem club foundation. Existing scoring still runs on Prisma."
      />

      {authError ? (
        <SectionCard className="border border-danger/30 bg-danger/10">
          <p className="text-sm font-semibold text-danger">{authError}</p>
        </SectionCard>
      ) : null}

      {!user ? (
        <SectionCard className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={mode === "sign-in" ? "club-btn-primary min-h-11" : "club-btn-secondary min-h-11"}
              onClick={() => setMode("sign-in")}
            >
              Sign In
            </button>
            <button
              type="button"
              className={mode === "create" ? "club-btn-primary min-h-11" : "club-btn-secondary min-h-11"}
              onClick={() => setMode("create")}
            >
              Create
            </button>
          </div>
          {mode === "create" ? (
            <input
              className="club-input h-12 px-4"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Display name"
            />
          ) : null}
          <input
            className="club-input h-12 px-4"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            type="email"
          />
          <input
            className="club-input h-12 px-4"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
          />
          <button
            type="button"
            className="club-btn-primary min-h-12 w-full disabled:opacity-50"
            disabled={isPending || loading || !email || !password}
            onClick={submitAuth}
          >
            {mode === "create" ? "Create Account" : "Sign In"}
          </button>
        </SectionCard>
      ) : (
        <>
          <SectionCard className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Signed In</p>
              <p className="mt-1 text-lg font-bold text-ink">{user.displayName || user.email}</p>
              <p className="text-sm text-ink/70">{user.email}</p>
            </div>
            <button type="button" className="club-btn-secondary min-h-11 w-full" onClick={signOut}>
              Sign Out
            </button>
          </SectionCard>

          <SectionCard className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Active Club</p>
            {memberships.length ? (
              <div className="space-y-2">
                {memberships.map((membership) => (
                  <button
                    key={membership.clubId}
                    type="button"
                    className={membership.clubId === activeClubId ? "club-btn-primary min-h-12 w-full" : "club-btn-secondary min-h-12 w-full"}
                    onClick={() => setActiveClubId(membership.clubId)}
                  >
                    {membership.clubName} - {membership.role}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink/70">No clubs yet.</p>
            )}
          </SectionCard>

          <SectionCard className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Create Club</p>
            <input
              className="club-input h-12 px-4"
              value={clubName}
              onChange={(event) => setClubName(event.target.value)}
              placeholder="Club name"
            />
            <button
              type="button"
              className="club-btn-primary min-h-12 w-full disabled:opacity-50"
              disabled={isPending || !clubName.trim()}
              onClick={createClub}
            >
              Create Club
            </button>
          </SectionCard>
        </>
      )}

      {message ? (
        <p className="rounded-2xl border border-pine/20 bg-white px-4 py-3 text-sm font-semibold text-ink">
          {message}
        </p>
      ) : null}
    </div>
  );
}
