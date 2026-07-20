"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SectionCard } from "@/components/section-card";
import { useFirebaseAuth } from "@/components/firebase-auth-provider";
import {
  getScoreMirrorCollectionPath,
  subscribeToScoreMirrorCollection,
  type ScoreMirrorListenerSnapshot
} from "@/lib/firebase/score-listener";
import type { FirebaseUserClubMembership, MembershipStatus } from "@/lib/firebase/types";

type ListenerStatus = "idle" | "connecting" | "connected" | "error";

type ListenerState = {
  status: ListenerStatus;
  observedRoundId: string | null;
  scoreDocumentCount: number;
  malformedDocumentCount: number;
  lastSnapshotAt: string | null;
  errorMessage: string;
};

export type ScoreMirrorListenerActivationInput = {
  signedIn: boolean;
  activeClubId: string | null;
  roundId: string | null;
  membership: Pick<FirebaseUserClubMembership, "clubId" | "status"> | null | undefined;
};

export type ScoreMirrorDiagnosticVisibilityInput = {
  signedIn: boolean;
  membership: Pick<FirebaseUserClubMembership, "role" | "status"> | null | undefined;
};

const INITIAL_LISTENER_STATE: ListenerState = {
  status: "idle",
  observedRoundId: null,
  scoreDocumentCount: 0,
  malformedDocumentCount: 0,
  lastSnapshotAt: null,
  errorMessage: ""
};

export function isActiveMembershipStatus(status: MembershipStatus) {
  return status === "active";
}

export function shouldSubscribeToScoreMirrorPilot(input: ScoreMirrorListenerActivationInput) {
  return Boolean(
    input.signedIn &&
      input.activeClubId &&
      input.roundId &&
      input.membership &&
      input.membership.clubId === input.activeClubId &&
      isActiveMembershipStatus(input.membership.status)
  );
}

export function shouldShowScoreMirrorDiagnosticPanel(input: ScoreMirrorDiagnosticVisibilityInput) {
  return Boolean(
    input.signedIn &&
      input.membership &&
      input.membership.status === "active" &&
      (input.membership.role === "owner" || input.membership.role === "admin")
  );
}

export function buildScoreMirrorPilotSnapshotState(
  roundId: string,
  snapshot: ScoreMirrorListenerSnapshot,
  nowIso: string
): ListenerState {
  return {
    status: "connected",
    observedRoundId: roundId,
    scoreDocumentCount: snapshot.scores.length,
    malformedDocumentCount: snapshot.malformed.length,
    lastSnapshotAt: nowIso,
    errorMessage: ""
  };
}

function formatSnapshotTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getStatusTone(status: ListenerStatus) {
  if (status === "connected") {
    return "bg-[#EAF6EC] text-[#1B6B3A]";
  }
  if (status === "error") {
    return "bg-[#FCE5E2] text-danger";
  }
  if (status === "connecting") {
    return "bg-[#FFF1BF] text-ink";
  }
  return "bg-canvas text-ink/70";
}

export function ScoreMirrorListenerPilot({
  roundId,
  onSnapshot
}: {
  roundId: string | null;
  onSnapshot?: (snapshot: ScoreMirrorListenerSnapshot) => void;
}) {
  const { user, memberships, activeClubId } = useFirebaseAuth();
  const [state, setState] = useState<ListenerState>(INITIAL_LISTENER_STATE);
  const activeMembership = useMemo(
    () => memberships.find((membership) => membership.clubId === activeClubId) ?? null,
    [activeClubId, memberships]
  );
  const shouldSubscribe = shouldSubscribeToScoreMirrorPilot({
    signedIn: Boolean(user),
    activeClubId,
    roundId,
    membership: activeMembership
  });
  const shouldShowDiagnostics = shouldShowScoreMirrorDiagnosticPanel({
    signedIn: Boolean(user),
    membership: activeMembership
  });
  const latestSubscriptionKey = useRef("");
  const onSnapshotRef = useRef(onSnapshot);

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  useEffect(() => {
    if (!shouldSubscribe || !activeClubId || !roundId) {
      latestSubscriptionKey.current = "";
      setState(INITIAL_LISTENER_STATE);
      return;
    }

    const subscriptionKey = `${activeClubId}:${roundId}`;
    latestSubscriptionKey.current = subscriptionKey;
    setState({
      ...INITIAL_LISTENER_STATE,
      status: "connecting",
      observedRoundId: roundId
    });

    const unsubscribe = subscribeToScoreMirrorCollection({
      clubId: activeClubId,
      roundId,
      onNext: (snapshot) => {
        if (latestSubscriptionKey.current !== subscriptionKey) {
          return;
        }
        onSnapshotRef.current?.(snapshot);
        setState(buildScoreMirrorPilotSnapshotState(roundId, snapshot, new Date().toISOString()));
      },
      onError: (error) => {
        if (latestSubscriptionKey.current !== subscriptionKey) {
          return;
        }
        setState({
          status: "error",
          observedRoundId: roundId,
          scoreDocumentCount: 0,
          malformedDocumentCount: 0,
          lastSnapshotAt: null,
          errorMessage: error.message
        });
      }
    });

    return () => {
      latestSubscriptionKey.current = "";
      unsubscribe();
    };
  }, [activeClubId, roundId, shouldSubscribe]);

  if (!shouldShowDiagnostics) {
    return null;
  }

  return (
    <SectionCard className="space-y-3 border border-pine/15 bg-[#FBF7F0]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
            Phase 4 Score Mirror Pilot
          </p>
          <h3 className="mt-1 text-lg font-semibold text-ink">Read-only listener</h3>
          <p className="mt-1 text-sm text-ink/65">
            Observing Firestore score mirrors only. Prisma scoring remains the live display.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getStatusTone(state.status)}`}>
          {state.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        {[
          { label: "Round", value: state.observedRoundId ?? roundId ?? "-" },
          { label: "Score Docs", value: String(state.scoreDocumentCount) },
          { label: "Malformed", value: String(state.malformedDocumentCount) },
          { label: "Snapshot", value: formatSnapshotTime(state.lastSnapshotAt) }
        ].map((item) => (
          <div key={item.label} className="rounded-2xl bg-white/75 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">{item.label}</p>
            <p className="mt-1 break-words text-sm font-semibold text-ink">{item.value}</p>
          </div>
        ))}
      </div>

      {activeClubId && roundId ? (
        <p className="text-xs font-semibold text-ink/55">
          {getScoreMirrorCollectionPath(activeClubId, roundId)}
        </p>
      ) : (
        <p className="text-xs font-semibold text-ink/55">
          Listener idle until a signed-in active member opens a current round.
        </p>
      )}

      {state.errorMessage ? (
        <p className="rounded-2xl bg-[#FCE5E2] px-3 py-2 text-sm font-semibold text-danger">
          {state.errorMessage}
        </p>
      ) : null}
    </SectionCard>
  );
}
