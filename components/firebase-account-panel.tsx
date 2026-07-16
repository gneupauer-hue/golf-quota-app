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

const PLAYER_MIRROR_DRY_RUN_CLUB_ID = "eO5PwRmRZrQJW0VbEp0B";
const PLAYER_MIRROR_EXPECTED_PLAYER_COUNT = 61;
const PLAYER_MIRROR_PROJECT_ID = "irem-golf-quota-app";

type PlayerMirrorDryRunResult = {
  mode?: "dry-run" | "write";
  counts?: {
    prismaPlayers?: number;
    firestorePlayers?: number;
    created?: number;
    updated?: number;
    unchanged?: number;
    extra?: number;
  };
  writesPlanned?: number;
  writesApplied?: number;
  error?: string;
};

export function FirebaseAccountPanel() {
  const { user, memberships, activeClubId, loading, authError, setActiveClubId, signOut } = useFirebaseAuth();
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [clubName, setClubName] = useState("Irem Golf Quota");
  const [message, setMessage] = useState("");
  const [dryRunResult, setDryRunResult] = useState<PlayerMirrorDryRunResult | null>(null);
  const [dryRunError, setDryRunError] = useState("");
  const [syncConfirm, setSyncConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const activeOwnerMembership = memberships.find(
    (membership) =>
      membership.clubId === activeClubId &&
      membership.clubId === PLAYER_MIRROR_DRY_RUN_CLUB_ID &&
      membership.role === "owner" &&
      membership.status === "active"
  );

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

  function runPlayerMirrorDryRun() {
    startTransition(async () => {
      try {
        setDryRunError("");
        setDryRunResult(null);
        setSyncConfirm(false);
        setMessage("");

        const currentUser = getFirebaseAuth().currentUser;
        if (!currentUser || !activeOwnerMembership) {
          throw new Error("Sign in as the active club owner before running this audit.");
        }

        const idToken = await currentUser.getIdToken();
        const response = await fetch("/api/firebase/player-mirror/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify({
            clubId: PLAYER_MIRROR_DRY_RUN_CLUB_ID,
            mode: "dry-run",
            expectedProjectId: PLAYER_MIRROR_PROJECT_ID,
            expectedPrismaPlayerCount: PLAYER_MIRROR_EXPECTED_PLAYER_COUNT
          })
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not run player mirror dry-run.");
        }

        setDryRunResult(result);
        setMessage("Player mirror dry-run completed.");
      } catch (error) {
        setDryRunError(error instanceof Error ? error.message : "Could not run player mirror dry-run.");
      }
    });
  }

  function syncPlayerMirror() {
    startTransition(async () => {
      try {
        setDryRunError("");
        setMessage("");

        const currentUser = getFirebaseAuth().currentUser;
        if (!currentUser || !activeOwnerMembership) {
          throw new Error("Sign in as the active club owner before syncing this mirror.");
        }

        if (!syncConfirm || !canSyncPlayerMirror) {
          throw new Error("Run a clean dry-run and confirm before syncing.");
        }

        const idToken = await currentUser.getIdToken();
        const response = await fetch("/api/firebase/player-mirror/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify({
            clubId: PLAYER_MIRROR_DRY_RUN_CLUB_ID,
            mode: "write",
            expectedProjectId: PLAYER_MIRROR_PROJECT_ID,
            expectedPrismaPlayerCount: PLAYER_MIRROR_EXPECTED_PLAYER_COUNT,
            confirmProductionWrite: true,
            allowExtraFirestorePlayers: false
          })
        });
        const result = await response.json();

        setDryRunResult(result);

        if (!response.ok) {
          throw new Error(result.error ?? "Could not sync player mirror.");
        }

        setSyncConfirm(false);
        setMessage("Player mirror sync completed.");
      } catch (error) {
        setDryRunError(error instanceof Error ? error.message : "Could not sync player mirror.");
      }
    });
  }

  const dryRunCounts = dryRunResult?.counts;
  const canSyncPlayerMirror =
    dryRunResult?.mode === "dry-run" &&
    (dryRunCounts?.prismaPlayers ?? 0) === PLAYER_MIRROR_EXPECTED_PLAYER_COUNT &&
    (dryRunCounts?.extra ?? 0) === 0 &&
    ((dryRunCounts?.created ?? 0) > 0 || (dryRunCounts?.updated ?? 0) > 0) &&
    (dryRunCounts?.created ?? 0) + (dryRunCounts?.updated ?? 0) <= PLAYER_MIRROR_EXPECTED_PLAYER_COUNT;

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

          {activeOwnerMembership ? (
            <SectionCard className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">
                Phase 2 Player Mirror Audit
              </p>
              <button
                type="button"
                className="club-btn-primary min-h-12 w-full disabled:opacity-50"
                disabled={isPending || loading}
                onClick={runPlayerMirrorDryRun}
              >
                Run Player Mirror Dry-Run
              </button>
              {dryRunResult ? (
                <div className="grid grid-cols-2 gap-2 text-sm text-ink">
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Prisma players: <span className="font-bold">{dryRunResult.counts?.prismaPlayers ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Firestore players: <span className="font-bold">{dryRunResult.counts?.firestorePlayers ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Created: <span className="font-bold">{dryRunResult.counts?.created ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Updated: <span className="font-bold">{dryRunResult.counts?.updated ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Unchanged: <span className="font-bold">{dryRunResult.counts?.unchanged ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Extra: <span className="font-bold">{dryRunResult.counts?.extra ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Writes planned: <span className="font-bold">{dryRunResult.writesPlanned ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Writes applied: <span className="font-bold">{dryRunResult.writesApplied ?? 0}</span>
                  </p>
                </div>
              ) : null}
              {dryRunResult ? (
                <label className="flex items-start gap-3 rounded-lg border border-pine/15 bg-white px-3 py-3 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={syncConfirm}
                    disabled={!canSyncPlayerMirror || isPending || loading}
                    onChange={(event) => setSyncConfirm(event.target.checked)}
                  />
                  <span>
                    Confirm this dry-run result and allow the owner-only player mirror sync.
                  </span>
                </label>
              ) : null}
              <button
                type="button"
                className="club-btn-danger min-h-12 w-full disabled:opacity-50"
                disabled={!canSyncPlayerMirror || !syncConfirm || isPending || loading}
                onClick={syncPlayerMirror}
              >
                Sync Player Mirror
              </button>
              {dryRunError ? (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
                  {dryRunError}
                </p>
              ) : null}
            </SectionCard>
          ) : null}
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
