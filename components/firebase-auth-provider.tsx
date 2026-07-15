"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { User } from "firebase/auth";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import type { FirebaseUserClubMembership } from "@/lib/firebase/types";

type FirebaseAuthContextValue = {
  user: User | null;
  memberships: FirebaseUserClubMembership[];
  activeClubId: string | null;
  loading: boolean;
  authError: string;
  setActiveClubId: (clubId: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | null>(null);

export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<FirebaseUserClubMembership[]>([]);
  const [activeClubId, setActiveClubIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let unsubscribe = () => {};

    try {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (nextUser) => {
        try {
          setUser(nextUser);
          setLoading(false);

          if (!nextUser) {
            setMemberships([]);
            setActiveClubIdState(null);
            await fetch("/api/firebase/session", { method: "DELETE" });
            return;
          }

          const idToken = await nextUser.getIdToken();
          const sessionResponse = await fetch("/api/firebase/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken })
          });
          const sessionResult = await sessionResponse.json();

          if (!sessionResponse.ok) {
            throw new Error(sessionResult.error ?? "Could not sync Firebase session.");
          }

          const db = getFirebaseDb();
          await setDoc(
            doc(db, "users", nextUser.uid),
            {
              uid: nextUser.uid,
              email: nextUser.email,
              displayName: nextUser.displayName,
              photoURL: nextUser.photoURL,
              updatedAt: new Date()
            },
            { merge: true }
          );

          const userSnapshot = await getDoc(doc(db, "users", nextUser.uid));
          const defaultClubId = userSnapshot.data()?.defaultClubId;
          setActiveClubIdState(typeof defaultClubId === "string" ? defaultClubId : null);
        } catch (error) {
          setAuthError(error instanceof Error ? error.message : "Could not sync Firebase account.");
        }
      });
    } catch (error) {
      setLoading(false);
      setAuthError(error instanceof Error ? error.message : "Firebase is not configured.");
    }

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const db = getFirebaseDb();
    const membershipsQuery = query(
      collection(db, "userClubMemberships"),
      where("uid", "==", user.uid),
      where("status", "==", "active")
    );

    return onSnapshot(
      membershipsQuery,
      (snapshot) => {
        const nextMemberships = snapshot.docs.map((membershipDoc) => ({
          ...(membershipDoc.data() as FirebaseUserClubMembership)
        }));
        setMemberships(nextMemberships);
        setActiveClubIdState((current) => {
          if (current && nextMemberships.some((membership) => membership.clubId === current)) {
            return current;
          }

          return nextMemberships[0]?.clubId ?? null;
        });
      },
      (error) => {
        setAuthError(error.message);
      }
    );
  }, [user]);

  const value = useMemo<FirebaseAuthContextValue>(
    () => ({
      user,
      memberships,
      activeClubId,
      loading,
      authError,
      setActiveClubId: async (clubId: string) => {
        if (!user) {
          throw new Error("Sign in before selecting a club.");
        }

        await updateDoc(doc(getFirebaseDb(), "users", user.uid), {
          defaultClubId: clubId,
          updatedAt: new Date()
        });
        setActiveClubIdState(clubId);
      },
      signOut: async () => {
        await firebaseSignOut(getFirebaseAuth());
        await fetch("/api/firebase/session", { method: "DELETE" });
      }
    }),
    [activeClubId, authError, loading, memberships, user]
  );

  return (
    <FirebaseAuthContext.Provider value={value}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}

export function useFirebaseAuth() {
  const value = useContext(FirebaseAuthContext);

  if (!value) {
    throw new Error("useFirebaseAuth must be used inside FirebaseAuthProvider.");
  }

  return value;
}
