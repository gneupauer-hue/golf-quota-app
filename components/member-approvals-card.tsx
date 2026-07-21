"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { useFirebaseAuth } from "@/components/firebase-auth-provider";
import { SectionCard } from "@/components/section-card";

const IREM_CLUB_ID = "eO5PwRmRZrQJW0VbEp0B";
const IREM_PROJECT_ID = "irem-golf-quota-app";

type PendingRequest = {
  uid: string;
  displayName: string;
  phoneNumber: string | null;
};

type RosterPlayer = {
  prismaPlayerId: string;
  name: string;
};

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function MemberApprovalsCard() {
  const { user, memberships } = useFirebaseAuth();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Only the club owner can read the members collection (per Firestore rules).
  const isOwner = memberships.some(
    (membership) =>
      membership.clubId === IREM_CLUB_ID &&
      membership.status === "active" &&
      membership.role === "owner"
  );

  useEffect(() => {
    if (!user || !isOwner) {
      setRequests([]);
      return;
    }
    const db = getFirebaseDb();
    const pendingQuery = query(
      collection(db, "clubs", IREM_CLUB_ID, "members"),
      where("status", "==", "requested")
    );
    return onSnapshot(
      pendingQuery,
      (snapshot) => {
        setError("");
        setRequests(
          snapshot.docs.map((memberDoc) => {
            const data = memberDoc.data();
            return {
              uid: memberDoc.id,
              displayName: typeof data.displayName === "string" ? data.displayName : "(no name)",
              phoneNumber: typeof data.phoneNumber === "string" ? data.phoneNumber : null
            };
          })
        );
      },
      (snapshotError) => setError(snapshotError.message)
    );
  }, [user, isOwner]);

  useEffect(() => {
    if (!user || !isOwner) {
      return;
    }
    const db = getFirebaseDb();
    return onSnapshot(collection(db, "clubs", IREM_CLUB_ID, "players"), (snapshot) => {
      setPlayers(
        snapshot.docs
          .map((playerDoc) => {
            const data = playerDoc.data();
            return {
              prismaPlayerId:
                typeof data.prismaPlayerId === "string" ? data.prismaPlayerId : playerDoc.id,
              name: typeof data.name === "string" ? data.name : "(unnamed)"
            };
          })
          .sort((left, right) => left.name.localeCompare(right.name))
      );
    });
  }, [user, isOwner]);

  // Best-effort default: match a request's typed name to a roster player.
  const suggestedLinks = useMemo(() => {
    const byName = new Map(players.map((player) => [normalizeName(player.name), player.prismaPlayerId]));
    const next: Record<string, string> = {};
    for (const request of requests) {
      const match = byName.get(normalizeName(request.displayName));
      if (match) {
        next[request.uid] = match;
      }
    }
    return next;
  }, [players, requests]);

  function linkFor(uid: string) {
    return links[uid] ?? suggestedLinks[uid] ?? "";
  }

  async function approve(request: PendingRequest) {
    setError("");
    setInfo("");
    setBusyUid(request.uid);
    try {
      const currentUser = getFirebaseAuth().currentUser;
      if (!currentUser) {
        throw new Error("Sign in again.");
      }
      const idToken = await currentUser.getIdToken();
      const response = await fetch("/api/firebase/membership/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          clubId: IREM_CLUB_ID,
          expectedProjectId: IREM_PROJECT_ID,
          targetUid: request.uid,
          linkedPlayerId: linkFor(request.uid) || null
        })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Could not approve this member.");
      }
      setInfo(`${request.displayName} approved.`);
      // The pending query drops the row automatically once status flips to active.
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Could not approve this member.");
    } finally {
      setBusyUid(null);
    }
  }

  if (!user || !isOwner) {
    return null;
  }

  return (
    <SectionCard className="space-y-3 border border-pine/15">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Owner</p>
        <h3 className="mt-1 text-lg font-semibold text-ink">Member approvals</h3>
        <p className="mt-1 text-sm text-ink/65">
          Approve the golfers who requested to join. Link each one to their name on your roster.
        </p>
      </div>

      {requests.length === 0 ? (
        <p className="rounded-lg border border-pine/10 bg-white px-3 py-3 text-sm text-ink/60">
          No pending requests right now.
        </p>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.uid} className="rounded-lg border border-pine/15 bg-white px-3 py-3">
              <p className="text-base font-semibold text-ink">{request.displayName}</p>
              <p className="text-sm text-ink/60">{request.phoneNumber ?? "no phone on file"}</p>
              <label className="mt-2 block text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">
                Link to roster player
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-pine/20 bg-white px-3 py-2 text-base text-ink"
                value={linkFor(request.uid)}
                onChange={(event) =>
                  setLinks((current) => ({ ...current, [request.uid]: event.target.value }))
                }
              >
                <option value="">— No roster link —</option>
                {players.map((player) => (
                  <option key={player.prismaPlayerId} value={player.prismaPlayerId}>
                    {player.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="mt-3 min-h-11 w-full rounded-xl bg-pine px-4 font-semibold text-white disabled:opacity-50"
                disabled={busyUid === request.uid}
                onClick={() => approve(request)}
              >
                {busyUid === request.uid ? "Approving…" : "Approve"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {info ? <p className="text-sm font-semibold text-[#1B6B3A]">{info}</p> : null}
      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </SectionCard>
  );
}
