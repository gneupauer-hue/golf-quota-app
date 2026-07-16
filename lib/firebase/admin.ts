import "server-only";
import { applicationDefault, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { ensureVercelApplicationDefaultCredentials } from "@/lib/firebase/vercel-adc";

let adminAppPromise: Promise<App> | null = null;

export async function getFirebaseAdminApp() {
  await ensureVercelApplicationDefaultCredentials();

  const existing = getApps()[0];
  if (existing) {
    return existing;
  }

  if (adminAppPromise) {
    return adminAppPromise;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error("Missing Firebase Admin environment variable: FIREBASE_PROJECT_ID.");
  }

  adminAppPromise = Promise.resolve(
    initializeApp({
      credential: applicationDefault(),
      projectId
    })
  ).catch((error) => {
    adminAppPromise = null;
    throw error;
  });

  return adminAppPromise;
}

export async function getFirebaseAdminAuth() {
  return getAuth(await getFirebaseAdminApp());
}

export async function getFirebaseAdminDb() {
  return getFirestore(await getFirebaseAdminApp());
}
