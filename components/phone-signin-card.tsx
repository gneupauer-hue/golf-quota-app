"use client";

import { useEffect, useRef, useState } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase/client";
import { useFirebaseAuth } from "@/components/firebase-auth-provider";
import { SectionCard } from "@/components/section-card";

// Single-club app: these match the Irem club/project used across the Firebase routes.
const IREM_CLUB_ID = "eO5PwRmRZrQJW0VbEp0B";
const IREM_PROJECT_ID = "irem-golf-quota-app";

function normalizeUsPhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");

  if (trimmed.startsWith("+")) {
    if (digits.length < 8 || digits.length > 15) {
      throw new Error("Enter a valid phone number, including area code.");
    }
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  throw new Error("Enter your 10-digit phone number (area code + number).");
}

type Step = "phone" | "code" | "name" | "pending" | "approved";

export function PhoneSignInCard() {
  const { user, memberships } = useFirebaseAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);

  const isActiveMember = memberships.some(
    (membership) => membership.clubId === IREM_CLUB_ID && membership.status === "active"
  );

  // Once signed in, decide what to show: already approved, awaiting approval, or
  // still needs to submit their name.
  useEffect(() => {
    let cancelled = false;

    async function resolveState() {
      if (!user) {
        setStep("phone");
        return;
      }
      if (isActiveMember) {
        setStep("approved");
        return;
      }
      try {
        const snapshot = await getDoc(doc(getFirebaseDb(), "clubs", IREM_CLUB_ID, "members", user.uid));
        const status = snapshot.exists() ? (snapshot.data()?.status as string | undefined) : undefined;
        if (cancelled) return;
        setStep(status === "requested" ? "pending" : "name");
      } catch {
        if (!cancelled) setStep("name");
      }
    }

    void resolveState();
    return () => {
      cancelled = true;
    };
  }, [user, isActiveMember]);

  // While a member is waiting on the "Request sent" screen, watch their
  // membership doc live so it flips to "approved" the instant the owner approves
  // them — no need to reopen the app or ask "did you approve me yet?".
  useEffect(() => {
    if (!user || step !== "pending") {
      return;
    }
    const memberRef = doc(getFirebaseDb(), "clubs", IREM_CLUB_ID, "members", user.uid);
    const unsubscribe = onSnapshot(
      memberRef,
      (snapshot) => {
        const status = snapshot.exists() ? (snapshot.data()?.status as string | undefined) : undefined;
        if (status === "active") {
          setInfo("You're approved! You can enter scores now.");
          setStep("approved");
        }
      },
      () => {
        // Ignore listener errors; the next app open still resolves the state.
      }
    );
    return () => unsubscribe();
  }, [user, step]);

  function ensureVerifier() {
    if (!verifierRef.current && recaptchaContainerRef.current) {
      verifierRef.current = new RecaptchaVerifier(getFirebaseAuth(), recaptchaContainerRef.current, {
        size: "invisible"
      });
    }
    if (!verifierRef.current) {
      throw new Error("Verification is still loading. Try again in a moment.");
    }
    return verifierRef.current;
  }

  function resetVerifier() {
    try {
      verifierRef.current?.clear();
    } catch {
      // ignore
    }
    verifierRef.current = null;
  }

  async function sendCode() {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const e164 = normalizeUsPhone(phone);
      const confirmation = await signInWithPhoneNumber(getFirebaseAuth(), e164, ensureVerifier());
      confirmationRef.current = confirmation;
      setStep("code");
      setInfo("We texted you a 6-digit code.");
    } catch (submitError) {
      resetVerifier();
      setError(submitError instanceof Error ? submitError.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setError("");
    setBusy(true);
    try {
      if (!confirmationRef.current) {
        throw new Error("Request a new code.");
      }
      await confirmationRef.current.confirm(code.trim());
      setInfo("Signed in.");
      // The auth listener updates `user`, and the effect above advances the step.
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "That code didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRequest() {
    setError("");
    setBusy(true);
    try {
      const currentUser = getFirebaseAuth().currentUser;
      if (!currentUser) {
        throw new Error("Your sign-in expired. Start again.");
      }
      const idToken = await currentUser.getIdToken();
      const response = await fetch("/api/firebase/membership/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          clubId: IREM_CLUB_ID,
          expectedProjectId: IREM_PROJECT_ID,
          fullName,
          gameTextConsent: consent
        })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Could not submit your request.");
      }
      setStep(result.status === "already-member" ? "approved" : "pending");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not submit your request.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-pine/20 bg-white px-3 py-3 text-base text-ink";
  const primaryButtonClass =
    "min-h-12 w-full rounded-xl bg-pine px-4 font-semibold text-white disabled:opacity-50";

  // Approved members see a clear confirmation instead of a vanished card, so they
  // never have to ask "did you approve me yet?".
  if (step === "approved") {
    return (
      <SectionCard className="space-y-1.5 border border-pine/25 bg-[#EAF6EC]">
        <div ref={recaptchaContainerRef} />
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1B6B3A]">Members</p>
        <h3 className="text-lg font-semibold text-[#1B6B3A]">You&apos;re approved ✓</h3>
        <p className="text-sm text-ink/70">You can enter scores during rounds.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard className="space-y-3 border border-pine/15">
      <div ref={recaptchaContainerRef} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Members</p>
        <h3 className="mt-1 text-lg font-semibold text-ink">Sign in with your phone</h3>
        <p className="mt-1 text-sm text-ink/65">
          Enter scores once the club owner approves you.
        </p>
      </div>

      {step === "phone" ? (
        <div className="space-y-3">
          <input
            className={inputClass}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Phone number"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <button type="button" className={primaryButtonClass} disabled={busy} onClick={sendCode}>
            {busy ? "Sending…" : "Text me a code"}
          </button>
        </div>
      ) : null}

      {step === "code" ? (
        <div className="space-y-3">
          <input
            className={inputClass}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <button type="button" className={primaryButtonClass} disabled={busy} onClick={verifyCode}>
            {busy ? "Checking…" : "Verify code"}
          </button>
          <button
            type="button"
            className="w-full text-sm font-semibold text-pine"
            disabled={busy}
            onClick={() => {
              resetVerifier();
              setCode("");
              setStep("phone");
            }}
          >
            Use a different number
          </button>
        </div>
      ) : null}

      {step === "name" ? (
        <div className="space-y-3">
          <p className="text-sm text-ink/70">
            Almost there — tell us your name so the owner knows who to approve.
          </p>
          <input
            className={inputClass}
            type="text"
            autoComplete="name"
            placeholder="Your full name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
          <label className="flex items-start gap-3 rounded-lg border border-pine/15 bg-white px-3 py-3 text-sm text-ink">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>Text me about upcoming games (you can opt out anytime).</span>
          </label>
          <button type="button" className={primaryButtonClass} disabled={busy} onClick={submitRequest}>
            {busy ? "Sending…" : "Request approval"}
          </button>
        </div>
      ) : null}

      {step === "pending" ? (
        <p className="rounded-lg border border-pine/15 bg-[#EAF6EC] px-3 py-3 text-sm font-semibold text-[#1B6B3A]">
          Request sent. The club owner will approve you shortly — then you can enter scores.
        </p>
      ) : null}

      {info ? <p className="text-sm font-semibold text-ink/70">{info}</p> : null}
      {error ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </SectionCard>
  );
}
