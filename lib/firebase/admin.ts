import "server-only";
import { applicationDefault, getApps, initializeApp, type Credential } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { ExternalAccountClient } from "google-auth-library";

const GOOGLE_CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing Firebase keyless auth environment variable: ${name}`);
  }

  return value;
}

function isVercelRuntime() {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

function getGoogleProviderAudience() {
  const projectNumber = requireEnv("GCP_PROJECT_NUMBER");
  const poolId = requireEnv("GCP_WORKLOAD_IDENTITY_POOL_ID");
  const providerId = requireEnv("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID");

  return `https://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
}

function getVercelOidcCredential(): Credential {
  const providerAudience = getGoogleProviderAudience();
  const serviceAccountEmail = requireEnv("GCP_SERVICE_ACCOUNT_EMAIL");
  const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: providerAudience.replace("https://", "//"),
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    scopes: [GOOGLE_CLOUD_SCOPE],
    subject_token_supplier: {
      getSubjectToken: async () => {
        const { getVercelOidcToken } = await import("@vercel/oidc");

        return getVercelOidcToken({ audience: providerAudience });
      }
    }
  });

  if (!authClient) {
    throw new Error("Could not initialize Firebase keyless auth client.");
  }

  return {
    async getAccessToken() {
      const accessToken = await authClient.getAccessToken();

      if (!accessToken.token) {
        throw new Error("Could not exchange Vercel OIDC token for a Google access token.");
      }

      return {
        access_token: accessToken.token,
        expires_in: 3600
      };
    }
  };
}

function getFirebaseCredential() {
  if (isVercelRuntime()) {
    return getVercelOidcCredential();
  }

  return applicationDefault();
}

export function getFirebaseAdminApp() {
  const existing = getApps()[0];
  if (existing) {
    return existing;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error("Missing Firebase Admin environment variable: FIREBASE_PROJECT_ID.");
  }

  return initializeApp({
    credential: getFirebaseCredential(),
    projectId
  });
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminDb() {
  return getFirestore(getFirebaseAdminApp());
}
