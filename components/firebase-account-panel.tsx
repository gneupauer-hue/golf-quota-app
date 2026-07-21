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
import type { FirebaseUserClubMembership } from "@/lib/firebase/types";

const PLAYER_MIRROR_DRY_RUN_CLUB_ID = "eO5PwRmRZrQJW0VbEp0B";
const PLAYER_MIRROR_EXPECTED_PLAYER_COUNT = 61;
const PLAYER_MIRROR_PROJECT_ID = "irem-golf-quota-app";
const SCORE_MIRROR_DRY_RUN_CLUB_ID = "eO5PwRmRZrQJW0VbEp0B";
const SCORE_MIRROR_PROJECT_ID = "irem-golf-quota-app";
const ROUND_MIRROR_CLUB_ID = "eO5PwRmRZrQJW0VbEp0B";
const ROUND_MIRROR_PROJECT_ID = "irem-golf-quota-app";

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

type ScoreMirrorDryRunResult = {
  ok?: boolean;
  status?: string;
  prismaRoundId?: string | null;
  firestoreRoundId?: string | null;
  scoringEntryMode?: string | null;
  roundMode?: string | null;
  scores?: {
    counts?: {
      created?: number;
      updated?: number;
      unchanged?: number;
      extra?: number;
    };
    created?: ScoreMirrorAuditDisplayItem[];
    updated?: ScoreMirrorAuditDisplayItem[];
    unchanged?: ScoreMirrorAuditDisplayItem[];
    extra?: ScoreMirrorAuditDisplayItem[];
  };
  writesPlanned?: number;
  writesApplied?: number;
  error?: string;
};

type ScoreMirrorAuditDisplayItem = {
  id?: string;
  name?: string | null;
};

type RoundMirrorAuditCounts = {
  created?: number;
  updated?: number;
  unchanged?: number;
  extra?: number;
};

type RoundMirrorAuditSection = {
  counts?: RoundMirrorAuditCounts;
  createdIds?: string[];
  updatedIds?: string[];
  unchangedIds?: string[];
  extraIds?: string[];
};

type RoundMirrorEntryAuditSection = {
  counts?: RoundMirrorAuditCounts;
  created?: ScoreMirrorAuditDisplayItem[];
  updated?: ScoreMirrorAuditDisplayItem[];
  unchanged?: ScoreMirrorAuditDisplayItem[];
  extra?: ScoreMirrorAuditDisplayItem[];
};

type RoundMirrorDryRunResult = {
  ok?: boolean;
  mode?: "dry-run" | "publish";
  status?: string;
  prismaRoundId?: string | null;
  firestoreRoundId?: string | null;
  round?: RoundMirrorAuditSection;
  entries?: RoundMirrorEntryAuditSection;
  activePointer?: RoundMirrorAuditSection;
  writesPlanned?: number;
  writesApplied?: number;
  error?: string;
};

type RoundMirrorPublishResult = RoundMirrorDryRunResult & {
  publishedRoundId?: string | null;
};

type ScoreMirrorPublishResult = {
  ok?: boolean;
  status?: string;
  publishedRoundId?: string | null;
  scoringEntryMode?: string | null;
  roundMode?: string | null;
  operationId?: string;
  scores?: {
    counts?: {
      created?: number;
      updated?: number;
      unchanged?: number;
      extra?: number;
    };
    created?: ScoreMirrorAuditDisplayItem[];
    updated?: ScoreMirrorAuditDisplayItem[];
    unchanged?: ScoreMirrorAuditDisplayItem[];
    extra?: ScoreMirrorAuditDisplayItem[];
  };
  writesPlanned?: number;
  writesApplied?: number;
  error?: string;
};

type ActiveRoundPreparationRepairResult = {
  ok?: boolean;
  status?: string;
  roundId?: string | null;
  operationId?: string;
  errorCode?: string;
  message?: string;
  round?: RoundMirrorAuditSection;
  entries?: RoundMirrorAuditSection;
  activePointer?: RoundMirrorAuditSection;
  scores?: {
    counts?: {
      created?: number;
      updated?: number;
      unchanged?: number;
      extra?: number;
    };
    created?: ScoreMirrorAuditDisplayItem[];
    updated?: ScoreMirrorAuditDisplayItem[];
    unchanged?: ScoreMirrorAuditDisplayItem[];
    extra?: ScoreMirrorAuditDisplayItem[];
  };
  writesPlanned?: number;
  writesApplied?: number;
  error?: string;
};

export function isActiveOwnerOrAdminMembership(
  membership: FirebaseUserClubMembership,
  clubId: string
) {
  return (
    membership.clubId === clubId &&
    membership.status === "active" &&
    (membership.role === "owner" || membership.role === "admin")
  );
}

export function buildScoreMirrorDryRunRequestBody(activePrismaRoundId: string | null) {
  return {
    clubId: SCORE_MIRROR_DRY_RUN_CLUB_ID,
    expectedProjectId: SCORE_MIRROR_PROJECT_ID,
    expectedPrismaRoundId: activePrismaRoundId
  };
}

export function buildRoundMirrorDryRunRequestBody(activePrismaRoundId: string | null) {
  return {
    clubId: ROUND_MIRROR_CLUB_ID,
    expectedProjectId: ROUND_MIRROR_PROJECT_ID,
    expectedPrismaRoundId: activePrismaRoundId
  };
}

export function shouldShowScoreMirrorValidationControls(input: {
  membership: FirebaseUserClubMembership | null | undefined;
  signedIn: boolean;
}) {
  return Boolean(
    input.signedIn &&
      input.membership &&
      isActiveOwnerOrAdminMembership(input.membership, SCORE_MIRROR_DRY_RUN_CLUB_ID)
  );
}

export function canPublishScoreMirror(input: {
  confirmed: boolean;
  dryRunError?: string;
  dryRunResult: ScoreMirrorDryRunResult | null;
  isBusy: boolean;
}) {
  const counts = input.dryRunResult?.scores?.counts;

  return Boolean(
    !input.isBusy &&
      input.confirmed &&
      !input.dryRunError &&
      input.dryRunResult?.ok !== false &&
      input.dryRunResult?.status === "active-round" &&
      input.dryRunResult?.prismaRoundId &&
      (counts?.extra ?? 0) === 0
  );
}

export function buildScoreMirrorPublishRequestBody(dryRunResult: ScoreMirrorDryRunResult) {
  if (!dryRunResult.prismaRoundId) {
    throw new Error("Run a successful dry-run with an active round before publishing.");
  }

  return {
    clubId: SCORE_MIRROR_DRY_RUN_CLUB_ID,
    expectedProjectId: SCORE_MIRROR_PROJECT_ID,
    expectedPrismaRoundId: dryRunResult.prismaRoundId,
    confirmPublish: true
  };
}

function hasRoundMirrorExtras(result: RoundMirrorDryRunResult | null) {
  return (
    (result?.round?.counts?.extra ?? 0) > 0 ||
    (result?.entries?.counts?.extra ?? 0) > 0 ||
    (result?.activePointer?.counts?.extra ?? 0) > 0
  );
}

export function canPublishRoundMirror(input: {
  activePrismaRoundId: string | null;
  confirmed: boolean;
  dryRunError?: string;
  dryRunResult: RoundMirrorDryRunResult | null;
  isBusy: boolean;
}) {
  return Boolean(
    !input.isBusy &&
      input.confirmed &&
      !input.dryRunError &&
      input.activePrismaRoundId &&
      input.dryRunResult?.ok !== false &&
      input.dryRunResult?.mode === "dry-run" &&
      input.dryRunResult?.prismaRoundId === input.activePrismaRoundId &&
      input.dryRunResult?.status !== "no-active-round" &&
      !hasRoundMirrorExtras(input.dryRunResult)
  );
}

export function buildRoundMirrorPublishRequestBody(input: {
  activePrismaRoundId: string | null;
  dryRunResult: RoundMirrorDryRunResult;
}) {
  if (!input.activePrismaRoundId || input.dryRunResult.prismaRoundId !== input.activePrismaRoundId) {
    throw new Error("Run a successful dry-run for the active round before publishing.");
  }

  return {
    clubId: ROUND_MIRROR_CLUB_ID,
    expectedProjectId: ROUND_MIRROR_PROJECT_ID,
    expectedPrismaRoundId: input.activePrismaRoundId,
    confirmPublish: true
  };
}

function renderScoreAuditItems(items: ScoreMirrorAuditDisplayItem[] | undefined) {
  if (!items?.length) {
    return null;
  }

  return (
    <ul className="space-y-1 rounded-lg border border-pine/15 bg-white px-3 py-2 text-xs text-ink/75">
      {items.map((item) => (
        <li key={item.id ?? item.name ?? "unknown"} className="break-words">
          <span className="font-semibold text-ink">{item.name ?? "Unnamed player"}</span>
          {item.id ? <span className="text-ink/60"> - {item.id}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function renderRoundAuditIds(label: string, ids: string[] | undefined) {
  if (!ids?.length) {
    return null;
  }

  return (
    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2 text-xs text-ink/75">
      <span className="font-semibold text-ink">{label}: </span>
      {ids.join(", ")}
    </p>
  );
}

export function FirebaseAccountPanel({
  activePrismaRoundId = null
}: {
  activePrismaRoundId?: string | null;
}) {
  const { user, memberships, activeClubId, loading, authError, setActiveClubId, signOut } = useFirebaseAuth();
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [clubName, setClubName] = useState("Irem Golf Quota");
  const [message, setMessage] = useState("");
  const [dryRunResult, setDryRunResult] = useState<PlayerMirrorDryRunResult | null>(null);
  const [dryRunError, setDryRunError] = useState("");
  const [scoreMirrorResult, setScoreMirrorResult] = useState<ScoreMirrorDryRunResult | null>(null);
  const [scoreMirrorError, setScoreMirrorError] = useState("");
  const [scoreMirrorPublishResult, setScoreMirrorPublishResult] = useState<ScoreMirrorPublishResult | null>(null);
  const [scoreMirrorPublishError, setScoreMirrorPublishError] = useState("");
  const [scoreMirrorPublishConfirm, setScoreMirrorPublishConfirm] = useState(false);
  const [roundMirrorResult, setRoundMirrorResult] = useState<RoundMirrorDryRunResult | null>(null);
  const [roundMirrorError, setRoundMirrorError] = useState("");
  const [roundMirrorPublishResult, setRoundMirrorPublishResult] = useState<RoundMirrorPublishResult | null>(null);
  const [roundMirrorPublishError, setRoundMirrorPublishError] = useState("");
  const [roundMirrorPublishConfirm, setRoundMirrorPublishConfirm] = useState(false);
  const [roundPrepRepairResult, setRoundPrepRepairResult] = useState<ActiveRoundPreparationRepairResult | null>(null);
  const [roundPrepRepairError, setRoundPrepRepairError] = useState("");
  const [roundPrepRepairConfirm, setRoundPrepRepairConfirm] = useState(false);
  const [syncConfirm, setSyncConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const activeOwnerMembership = memberships.find(
    (membership) =>
      membership.clubId === activeClubId &&
      membership.clubId === PLAYER_MIRROR_DRY_RUN_CLUB_ID &&
      membership.role === "owner" &&
      membership.status === "active"
  );
  const activeOwnerAdminMembership = memberships.find((membership) =>
    membership.clubId === activeClubId &&
    isActiveOwnerOrAdminMembership(membership, SCORE_MIRROR_DRY_RUN_CLUB_ID)
  );
  const showScoreMirrorControls = shouldShowScoreMirrorValidationControls({
    membership: activeOwnerAdminMembership,
    signedIn: Boolean(user)
  });

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

  function runRoundMirrorDryRun() {
    startTransition(async () => {
      try {
        setRoundMirrorError("");
        setRoundMirrorResult(null);
        setRoundMirrorPublishError("");
        setRoundMirrorPublishResult(null);
        setRoundMirrorPublishConfirm(false);
        setMessage("");

        const currentUser = getFirebaseAuth().currentUser;
        if (!currentUser || !activeOwnerAdminMembership) {
          throw new Error("Sign in as an active club owner or admin before running this audit.");
        }

        if (!activePrismaRoundId) {
          throw new Error("No active Prisma round is available to prepare.");
        }

        const idToken = await currentUser.getIdToken();
        const response = await fetch("/api/firebase/round-mirror/dry-run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify(buildRoundMirrorDryRunRequestBody(activePrismaRoundId))
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not run round shell dry-run.");
        }

        setRoundMirrorResult(result);
        setMessage("Round shell dry-run completed.");
      } catch (error) {
        setRoundMirrorError(error instanceof Error ? error.message : "Could not run round shell dry-run.");
      }
    });
  }

  function publishRoundMirror() {
    startTransition(async () => {
      try {
        setRoundMirrorPublishError("");
        setMessage("");

        const currentUser = getFirebaseAuth().currentUser;
        if (!currentUser || !activeOwnerAdminMembership) {
          throw new Error("Sign in as an active club owner or admin before publishing this mirror.");
        }

        if (!canPublishCurrentRoundMirror || !roundMirrorResult) {
          throw new Error("Run a successful dry-run for the active round before publishing.");
        }

        const idToken = await currentUser.getIdToken();
        const response = await fetch("/api/firebase/round-mirror/publish", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify(
            buildRoundMirrorPublishRequestBody({
              activePrismaRoundId,
              dryRunResult: roundMirrorResult
            })
          )
        });
        const result = await response.json();

        setRoundMirrorPublishResult(result);
        setRoundMirrorPublishConfirm(false);

        if (!response.ok) {
          throw new Error(result.error ?? "Could not publish round shell mirror.");
        }

        setMessage("Round shell mirror published.");
      } catch (error) {
        setRoundMirrorPublishConfirm(false);
        setRoundMirrorPublishError(error instanceof Error ? error.message : "Could not publish round shell mirror.");
      }
    });
  }

  function repairActiveRoundPreparation() {
    startTransition(async () => {
      try {
        setRoundPrepRepairError("");
        setRoundPrepRepairResult(null);
        setMessage("");

        const currentUser = getFirebaseAuth().currentUser;
        if (!currentUser || !activeOwnerAdminMembership) {
          throw new Error("Sign in as an active club owner or admin before repairing round preparation.");
        }
        if (!roundPrepRepairConfirm) {
          throw new Error("Confirm before repairing active round preparation.");
        }

        const idToken = await currentUser.getIdToken();
        const response = await fetch("/api/firebase/active-round-preparation/repair", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify({
            clubId: ROUND_MIRROR_CLUB_ID,
            expectedProjectId: ROUND_MIRROR_PROJECT_ID
          })
        });
        const result = await response.json();

        setRoundPrepRepairResult(result);
        setRoundPrepRepairConfirm(false);

        if (!response.ok) {
          throw new Error(result.error ?? result.message ?? "Could not repair active round preparation.");
        }

        setMessage("Active round realtime preparation repaired.");
      } catch (error) {
        setRoundPrepRepairConfirm(false);
        setRoundPrepRepairError(
          error instanceof Error ? error.message : "Could not repair active round preparation."
        );
      }
    });
  }

  function runScoreMirrorDryRun() {
    startTransition(async () => {
      try {
        setScoreMirrorError("");
        setScoreMirrorResult(null);
        setScoreMirrorPublishError("");
        setScoreMirrorPublishResult(null);
        setScoreMirrorPublishConfirm(false);
        setMessage("");

        const currentUser = getFirebaseAuth().currentUser;
        if (!currentUser || !activeOwnerAdminMembership) {
          throw new Error("Sign in as an active club owner or admin before running this audit.");
        }

        const idToken = await currentUser.getIdToken();
        const response = await fetch("/api/firebase/score-mirror/dry-run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify(buildScoreMirrorDryRunRequestBody(activePrismaRoundId))
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? "Could not run score mirror dry-run.");
        }

        setScoreMirrorResult(result);
        setMessage("Score mirror dry-run completed.");
      } catch (error) {
        setScoreMirrorError(error instanceof Error ? error.message : "Could not run score mirror dry-run.");
      }
    });
  }

  function publishScoreMirror() {
    startTransition(async () => {
      try {
        setScoreMirrorPublishError("");
        setMessage("");

        const currentUser = getFirebaseAuth().currentUser;
        if (!currentUser || !activeOwnerAdminMembership) {
          throw new Error("Sign in as an active club owner or admin before publishing this mirror.");
        }

        if (!canPublishCurrentScoreMirror) {
          throw new Error("Run a successful dry-run with an active round before publishing.");
        }

        const idToken = await currentUser.getIdToken();
        const response = await fetch("/api/firebase/score-mirror/publish", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify(buildScoreMirrorPublishRequestBody(scoreMirrorResult!))
        });
        const result = await response.json();

        setScoreMirrorPublishResult(result);
        setScoreMirrorPublishConfirm(false);

        if (!response.ok) {
          throw new Error(result.error ?? "Could not publish score mirror.");
        }

        setMessage("Score mirror publish completed.");
      } catch (error) {
        setScoreMirrorPublishConfirm(false);
        setScoreMirrorPublishError(error instanceof Error ? error.message : "Could not publish score mirror.");
      }
    });
  }

  const dryRunCounts = dryRunResult?.counts;
  const roundMirrorRoundCounts = roundMirrorResult?.round?.counts;
  const roundMirrorEntryCounts = roundMirrorResult?.entries?.counts;
  const roundMirrorPointerCounts = roundMirrorResult?.activePointer?.counts;
  const roundMirrorPublishRoundCounts = roundMirrorPublishResult?.round?.counts;
  const roundMirrorPublishEntryCounts = roundMirrorPublishResult?.entries?.counts;
  const roundMirrorPublishPointerCounts = roundMirrorPublishResult?.activePointer?.counts;
  const roundPrepRoundCounts = roundPrepRepairResult?.round?.counts;
  const roundPrepEntryCounts = roundPrepRepairResult?.entries?.counts;
  const roundPrepPointerCounts = roundPrepRepairResult?.activePointer?.counts;
  const roundPrepScoreCounts = roundPrepRepairResult?.scores?.counts;
  const scoreCounts = scoreMirrorResult?.scores?.counts;
  const publishScoreCounts = scoreMirrorPublishResult?.scores?.counts;
  const canSyncPlayerMirror =
    dryRunResult?.mode === "dry-run" &&
    (dryRunCounts?.prismaPlayers ?? 0) === PLAYER_MIRROR_EXPECTED_PLAYER_COUNT &&
    (dryRunCounts?.extra ?? 0) === 0 &&
    ((dryRunCounts?.created ?? 0) > 0 || (dryRunCounts?.updated ?? 0) > 0) &&
    (dryRunCounts?.created ?? 0) + (dryRunCounts?.updated ?? 0) <= PLAYER_MIRROR_EXPECTED_PLAYER_COUNT;
  const canPublishCurrentScoreMirror = canPublishScoreMirror({
    confirmed: scoreMirrorPublishConfirm,
    dryRunError: scoreMirrorError,
    dryRunResult: scoreMirrorResult,
    isBusy: isPending || loading
  });
  const canPublishCurrentRoundMirror = canPublishRoundMirror({
    activePrismaRoundId,
    confirmed: roundMirrorPublishConfirm,
    dryRunError: roundMirrorError,
    dryRunResult: roundMirrorResult,
    isBusy: isPending || loading
  });
  const roundPublishDisabledReason = activePrismaRoundId
    ? "Run a successful round shell dry-run and confirm before publishing."
    : "No active Prisma round is available to prepare.";
  const scorePublishDisabledReason =
    scoreMirrorResult?.status === "active-round"
      ? "Confirm the dry-run result before publishing."
      : "Run a successful dry-run with an active round before publishing.";

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

          {showScoreMirrorControls ? (
            <SectionCard className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">
                Phase 4 Round Shell Prep
              </p>
              <p className="text-sm text-ink/70">
                Active Prisma round: <span className="font-semibold text-ink">{activePrismaRoundId ?? "None"}</span>
              </p>
              <button
                type="button"
                className="club-btn-primary min-h-12 w-full disabled:opacity-50"
                disabled={isPending || loading || !activePrismaRoundId}
                onClick={runRoundMirrorDryRun}
              >
                Run Round Shell Dry-Run
              </button>
              {roundMirrorResult ? (
                <div className="space-y-2 text-sm text-ink">
                  <div className="grid grid-cols-2 gap-2">
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Status: <span className="font-bold">{roundMirrorResult.status ?? "unknown"}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Prisma round: <span className="font-bold">{roundMirrorResult.prismaRoundId ?? "None"}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Firestore round: <span className="font-bold">{roundMirrorResult.firestoreRoundId ?? "None"}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Round created: <span className="font-bold">{roundMirrorRoundCounts?.created ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Round updated: <span className="font-bold">{roundMirrorRoundCounts?.updated ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Round unchanged: <span className="font-bold">{roundMirrorRoundCounts?.unchanged ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Round extra: <span className="font-bold">{roundMirrorRoundCounts?.extra ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Entries created: <span className="font-bold">{roundMirrorEntryCounts?.created ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Entries updated: <span className="font-bold">{roundMirrorEntryCounts?.updated ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Entries unchanged: <span className="font-bold">{roundMirrorEntryCounts?.unchanged ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Entries extra: <span className="font-bold">{roundMirrorEntryCounts?.extra ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Pointer created: <span className="font-bold">{roundMirrorPointerCounts?.created ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Pointer updated: <span className="font-bold">{roundMirrorPointerCounts?.updated ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Pointer unchanged: <span className="font-bold">{roundMirrorPointerCounts?.unchanged ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Pointer extra: <span className="font-bold">{roundMirrorPointerCounts?.extra ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Writes planned: <span className="font-bold">{roundMirrorResult.writesPlanned ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Writes applied: <span className="font-bold">{roundMirrorResult.writesApplied ?? 0}</span>
                    </p>
                  </div>
                  {renderRoundAuditIds("Round extras", roundMirrorResult.round?.extraIds)}
                  {renderScoreAuditItems(roundMirrorResult.entries?.extra)}
                  {renderRoundAuditIds("Pointer extras", roundMirrorResult.activePointer?.extraIds)}
                </div>
              ) : null}
              <label className="flex items-start gap-3 rounded-lg border border-pine/15 bg-white px-3 py-3 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={roundMirrorPublishConfirm}
                  disabled={
                    isPending ||
                    loading ||
                    !roundMirrorResult?.prismaRoundId ||
                    roundMirrorResult.prismaRoundId !== activePrismaRoundId ||
                    Boolean(roundMirrorError) ||
                    hasRoundMirrorExtras(roundMirrorResult)
                  }
                  onChange={(event) => setRoundMirrorPublishConfirm(event.target.checked)}
                />
                <span>
                  I understand this prepares the active round shell in Firestore and does not change scoring.
                </span>
              </label>
              <p className="text-sm text-ink/70">{roundPublishDisabledReason}</p>
              <button
                type="button"
                className="club-btn-danger min-h-12 w-full disabled:opacity-50"
                disabled={!canPublishCurrentRoundMirror}
                onClick={publishRoundMirror}
              >
                Publish Round Shell
              </button>
              {roundMirrorPublishResult ? (
                <div className="space-y-2 text-sm text-ink">
                  <div className="grid grid-cols-2 gap-2">
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Status: <span className="font-bold">{roundMirrorPublishResult.status ?? "unknown"}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Published round: <span className="font-bold">{roundMirrorPublishResult.publishedRoundId ?? "None"}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Round created: <span className="font-bold">{roundMirrorPublishRoundCounts?.created ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Round updated: <span className="font-bold">{roundMirrorPublishRoundCounts?.updated ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Round unchanged: <span className="font-bold">{roundMirrorPublishRoundCounts?.unchanged ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Round extra: <span className="font-bold">{roundMirrorPublishRoundCounts?.extra ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Entries created: <span className="font-bold">{roundMirrorPublishEntryCounts?.created ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Entries updated: <span className="font-bold">{roundMirrorPublishEntryCounts?.updated ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Entries unchanged: <span className="font-bold">{roundMirrorPublishEntryCounts?.unchanged ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Entries extra: <span className="font-bold">{roundMirrorPublishEntryCounts?.extra ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Pointer created: <span className="font-bold">{roundMirrorPublishPointerCounts?.created ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Pointer updated: <span className="font-bold">{roundMirrorPublishPointerCounts?.updated ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Pointer unchanged: <span className="font-bold">{roundMirrorPublishPointerCounts?.unchanged ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Pointer extra: <span className="font-bold">{roundMirrorPublishPointerCounts?.extra ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Writes planned: <span className="font-bold">{roundMirrorPublishResult.writesPlanned ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Writes applied: <span className="font-bold">{roundMirrorPublishResult.writesApplied ?? 0}</span>
                    </p>
                  </div>
                  {renderRoundAuditIds("Round extras", roundMirrorPublishResult.round?.extraIds)}
                  {renderScoreAuditItems(roundMirrorPublishResult.entries?.extra)}
                  {renderRoundAuditIds("Pointer extras", roundMirrorPublishResult.activePointer?.extraIds)}
                </div>
              ) : null}
              {roundMirrorError ? (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
                  {roundMirrorError}
                </p>
              ) : null}
              {roundMirrorPublishError ? (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
                  {roundMirrorPublishError}
                </p>
              ) : null}
            </SectionCard>
          ) : null}

          {showScoreMirrorControls ? (
            <SectionCard className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">
                Active Round Realtime Repair
              </p>
              <p className="text-sm text-ink/70">
                Repairs the active round shell and missing baseline score mirrors. Existing score mirrors are preserved.
              </p>
              <label className="flex items-start gap-3 rounded-lg border border-pine/15 bg-white px-3 py-3 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={roundPrepRepairConfirm}
                  disabled={isPending || loading || !activePrismaRoundId}
                  onChange={(event) => setRoundPrepRepairConfirm(event.target.checked)}
                />
                <span>
                  I understand this repairs the active round realtime mirror and does not change Prisma scoring.
                </span>
              </label>
              <button
                type="button"
                className="club-btn-danger min-h-12 w-full disabled:opacity-50"
                disabled={isPending || loading || !activePrismaRoundId || !roundPrepRepairConfirm}
                onClick={repairActiveRoundPreparation}
              >
                Repair Active Round Realtime Prep
              </button>
              {roundPrepRepairResult ? (
                <div className="grid grid-cols-2 gap-2 text-sm text-ink">
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Status: <span className="font-bold">{roundPrepRepairResult.status ?? "unknown"}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Round: <span className="font-bold">{roundPrepRepairResult.roundId ?? "None"}</span>
                  </p>
                  {roundPrepRepairResult.errorCode ? (
                    <p className="col-span-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-danger">
                      Reason: <span className="font-bold">{roundPrepRepairResult.errorCode}</span>
                      {roundPrepRepairResult.message ? ` — ${roundPrepRepairResult.message}` : ""}
                    </p>
                  ) : null}
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Round created: <span className="font-bold">{roundPrepRoundCounts?.created ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Round updated: <span className="font-bold">{roundPrepRoundCounts?.updated ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Entries created: <span className="font-bold">{roundPrepEntryCounts?.created ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Entries updated: <span className="font-bold">{roundPrepEntryCounts?.updated ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Pointer updated: <span className="font-bold">{roundPrepPointerCounts?.updated ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Scores created: <span className="font-bold">{roundPrepScoreCounts?.created ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Scores unchanged: <span className="font-bold">{roundPrepScoreCounts?.unchanged ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Scores extra: <span className="font-bold">{roundPrepScoreCounts?.extra ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Writes planned: <span className="font-bold">{roundPrepRepairResult.writesPlanned ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Writes applied: <span className="font-bold">{roundPrepRepairResult.writesApplied ?? 0}</span>
                  </p>
                </div>
              ) : null}
              {roundPrepRepairError ? (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
                  {roundPrepRepairError}
                </p>
              ) : null}
            </SectionCard>
          ) : null}

          {showScoreMirrorControls ? (
            <SectionCard className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">
                Phase 4 Score Mirror Audit
              </p>
              <button
                type="button"
                className="club-btn-primary min-h-12 w-full disabled:opacity-50"
                disabled={isPending || loading}
                onClick={runScoreMirrorDryRun}
              >
                Run Score Mirror Dry-Run
              </button>
              {scoreMirrorResult ? (
                <div className="grid grid-cols-2 gap-2 text-sm text-ink">
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Status: <span className="font-bold">{scoreMirrorResult.status ?? "unknown"}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Prisma round: <span className="font-bold">{scoreMirrorResult.prismaRoundId ?? "None"}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Firestore round: <span className="font-bold">{scoreMirrorResult.firestoreRoundId ?? "None"}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Scoring mode: <span className="font-bold">{scoreMirrorResult.scoringEntryMode ?? "None"}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Round mode: <span className="font-bold">{scoreMirrorResult.roundMode ?? "None"}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Created: <span className="font-bold">{scoreCounts?.created ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Updated: <span className="font-bold">{scoreCounts?.updated ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Unchanged: <span className="font-bold">{scoreCounts?.unchanged ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Extra: <span className="font-bold">{scoreCounts?.extra ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Writes planned: <span className="font-bold">{scoreMirrorResult.writesPlanned ?? 0}</span>
                  </p>
                  <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                    Writes applied: <span className="font-bold">{scoreMirrorResult.writesApplied ?? 0}</span>
                  </p>
                </div>
              ) : null}
              {scoreMirrorError ? (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
                  {scoreMirrorError}
                </p>
              ) : null}
            </SectionCard>
          ) : null}

          {showScoreMirrorControls ? (
            <SectionCard className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">
                Phase 4 Score Mirror Publish
              </p>
              <p className="text-sm text-ink/70">
                {scorePublishDisabledReason}
              </p>
              <label className="flex items-start gap-3 rounded-lg border border-pine/15 bg-white px-3 py-3 text-sm text-ink">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={scoreMirrorPublishConfirm}
                  disabled={
                    isPending ||
                    loading ||
                    !scoreMirrorResult?.prismaRoundId ||
                    scoreMirrorResult.status !== "active-round" ||
                    Boolean(scoreMirrorError) ||
                    (scoreCounts?.extra ?? 0) > 0
                  }
                  onChange={(event) => setScoreMirrorPublishConfirm(event.target.checked)}
                />
                <span>
                  I understand this writes a Prisma score mirror to Firestore but does not change live scoring.
                </span>
              </label>
              <button
                type="button"
                className="club-btn-danger min-h-12 w-full disabled:opacity-50"
                disabled={!canPublishCurrentScoreMirror}
                onClick={publishScoreMirror}
              >
                Publish Score Mirror
              </button>
              {scoreMirrorPublishResult ? (
                <div className="space-y-2 text-sm text-ink">
                  <div className="grid grid-cols-2 gap-2">
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Status: <span className="font-bold">{scoreMirrorPublishResult.status ?? "unknown"}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Published round: <span className="font-bold">{scoreMirrorPublishResult.publishedRoundId ?? "None"}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Scoring mode: <span className="font-bold">{scoreMirrorPublishResult.scoringEntryMode ?? "None"}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Round mode: <span className="font-bold">{scoreMirrorPublishResult.roundMode ?? "None"}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Created: <span className="font-bold">{publishScoreCounts?.created ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Updated: <span className="font-bold">{publishScoreCounts?.updated ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Unchanged: <span className="font-bold">{publishScoreCounts?.unchanged ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Extra: <span className="font-bold">{publishScoreCounts?.extra ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Writes planned: <span className="font-bold">{scoreMirrorPublishResult.writesPlanned ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2">
                      Writes applied: <span className="font-bold">{scoreMirrorPublishResult.writesApplied ?? 0}</span>
                    </p>
                    <p className="rounded-lg border border-pine/15 bg-white px-3 py-2 col-span-2">
                      Operation ID: <span className="font-bold">{scoreMirrorPublishResult.operationId ?? "None"}</span>
                    </p>
                  </div>
                  {renderScoreAuditItems(scoreMirrorPublishResult.scores?.created)}
                  {renderScoreAuditItems(scoreMirrorPublishResult.scores?.updated)}
                  {renderScoreAuditItems(scoreMirrorPublishResult.scores?.unchanged)}
                  {renderScoreAuditItems(scoreMirrorPublishResult.scores?.extra)}
                </div>
              ) : null}
              {scoreMirrorPublishError ? (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
                  {scoreMirrorPublishError}
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
