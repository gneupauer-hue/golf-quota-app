import { access, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const GOOGLE_CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const DEFAULT_REFRESH_WINDOW_MS = 5 * 60 * 1000;

type TokenProvider = (audience: string) => Promise<string>;

type VercelAdcState = {
  adcPath: string;
  tokenExpiresAtMs: number;
  tokenPath: string;
};

type EnsureVercelAdcOptions = {
  nowMs?: number;
  refreshWindowMs?: number;
  tempDir?: string;
  tokenProvider?: TokenProvider;
};

let setupPromise: Promise<VercelAdcState> | null = null;
let setupState: VercelAdcState | null = null;

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing Firebase keyless auth environment variable: ${name}`);
  }

  return value;
}

export function isVercelRuntime() {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

export function getGoogleProviderAudience() {
  const projectNumber = requireEnv("GCP_PROJECT_NUMBER");
  const poolId = requireEnv("GCP_WORKLOAD_IDENTITY_POOL_ID");
  const providerId = requireEnv("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID");

  return `https://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
}

function getExternalAccountAudience(providerAudience: string) {
  return providerAudience.replace(/^https:\/\//, "//");
}

function getTempPaths(tempDir = tmpdir()) {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? "local";
  const safeDeploymentId = deploymentId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  const prefix = `irem-firebase-admin-${safeDeploymentId}-${process.pid}`;

  return {
    adcPath: path.join(tempDir, `${prefix}.adc.json`),
    tokenPath: path.join(tempDir, `${prefix}.subject.jwt`)
  };
}

function decodeJwtExpiresAtMs(token: string) {
  const parts = token.split(".");

  if (parts.length < 2) {
    throw new Error("Vercel OIDC token was not a valid JWT.");
  }

  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
    exp?: unknown;
  };

  if (typeof payload.exp !== "number") {
    throw new Error("Vercel OIDC token did not include an expiration.");
  }

  return payload.exp * 1000;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeFileAtomically(filePath: string, contents: string) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;

  try {
    await writeFile(tempPath, contents, { mode: 0o600 });
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

async function getDefaultTokenProvider(): Promise<TokenProvider> {
  const { getVercelOidcToken } = await import("@vercel/oidc");

  return (audience) => getVercelOidcToken({ audience });
}

async function createVercelApplicationDefaultCredentials(options: EnsureVercelAdcOptions = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const refreshWindowMs = options.refreshWindowMs ?? DEFAULT_REFRESH_WINDOW_MS;

  if (
    setupState &&
    process.env.GOOGLE_APPLICATION_CREDENTIALS === setupState.adcPath &&
    setupState.tokenExpiresAtMs - refreshWindowMs > nowMs &&
    (await fileExists(setupState.adcPath)) &&
    (await fileExists(setupState.tokenPath))
  ) {
    return setupState;
  }

  const providerAudience = getGoogleProviderAudience();
  const serviceAccountEmail = requireEnv("GCP_SERVICE_ACCOUNT_EMAIL");
  const tokenProvider = options.tokenProvider ?? (await getDefaultTokenProvider());
  const token = await tokenProvider(providerAudience);
  const tokenExpiresAtMs = decodeJwtExpiresAtMs(token);

  if (tokenExpiresAtMs <= nowMs) {
    throw new Error("Vercel OIDC token was already expired.");
  }

  const paths = getTempPaths(options.tempDir);
  const adcConfig = {
    type: "external_account",
    audience: getExternalAccountAudience(providerAudience),
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    credential_source: {
      file: paths.tokenPath
    },
    scopes: [GOOGLE_CLOUD_SCOPE]
  };

  await mkdir(path.dirname(paths.tokenPath), { recursive: true });
  await writeFileAtomically(paths.tokenPath, token);
  await writeFileAtomically(paths.adcPath, `${JSON.stringify(adcConfig)}\n`);

  process.env.GOOGLE_APPLICATION_CREDENTIALS = paths.adcPath;
  setupState = {
    ...paths,
    tokenExpiresAtMs
  };

  return setupState;
}

export async function ensureVercelApplicationDefaultCredentials(options: EnsureVercelAdcOptions = {}) {
  if (!isVercelRuntime()) {
    return null;
  }

  if (!setupPromise) {
    setupPromise = createVercelApplicationDefaultCredentials(options).finally(() => {
      setupPromise = null;
    });
  }

  return setupPromise;
}

export function resetVercelApplicationDefaultCredentialsForTests() {
  setupPromise = null;
  setupState = null;
}
