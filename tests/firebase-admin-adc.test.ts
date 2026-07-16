import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ensureVercelApplicationDefaultCredentials,
  resetVercelApplicationDefaultCredentialsForTests
} from "@/lib/firebase/vercel-adc";

const ORIGINAL_ENV = { ...process.env };

function makeJwt(expiresAtSeconds: number) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expiresAtSeconds })).toString("base64url");

  return `${header}.${payload}.signature`;
}

async function withVercelEnv(run: (tempDir: string) => Promise<void>) {
  resetVercelApplicationDefaultCredentialsForTests();
  process.env = {
    ...ORIGINAL_ENV,
    VERCEL: "1",
    VERCEL_DEPLOYMENT_ID: "test-deployment",
    GCP_PROJECT_NUMBER: "982405454170",
    GCP_SERVICE_ACCOUNT_EMAIL: "vercel-firebase-admin@irem-golf-quota-app.iam.gserviceaccount.com",
    GCP_WORKLOAD_IDENTITY_POOL_ID: "vercel",
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel"
  };

  const tempDir = await mkdtemp(path.join(tmpdir(), "irem-firebase-adc-test-"));

  try {
    await run(tempDir);
  } finally {
    resetVercelApplicationDefaultCredentialsForTests();
    process.env = { ...ORIGINAL_ENV };
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("Vercel Firebase Admin setup writes an external-account ADC file for applicationDefault", async () => {
  await withVercelEnv(async (tempDir) => {
    const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    const state = await ensureVercelApplicationDefaultCredentials({
      tempDir,
      tokenProvider: async () => token
    });

    assert.ok(state);
    assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, state.adcPath);

    const adcConfig = JSON.parse(await readFile(state.adcPath, "utf8")) as {
      audience: string;
      credential_source: { file: string };
      service_account_impersonation_url: string;
      type: string;
    };

    assert.equal(adcConfig.type, "external_account");
    assert.equal(
      adcConfig.audience,
      "//iam.googleapis.com/projects/982405454170/locations/global/workloadIdentityPools/vercel/providers/vercel"
    );
    assert.equal(adcConfig.credential_source.file, state.tokenPath);
    assert.match(
      adcConfig.service_account_impersonation_url,
      /vercel-firebase-admin@irem-golf-quota-app\.iam\.gserviceaccount\.com:generateAccessToken$/
    );
    assert.equal(await readFile(state.tokenPath, "utf8"), token);
    assert.equal(JSON.stringify(adcConfig).includes(token), false);
  });
});

test("Vercel Firebase Admin setup reuses fresh temp credentials", async () => {
  await withVercelEnv(async (tempDir) => {
    let tokenRequests = 0;
    const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    const tokenProvider = async () => {
      tokenRequests += 1;
      return token;
    };

    const first = await ensureVercelApplicationDefaultCredentials({ tempDir, tokenProvider });
    const second = await ensureVercelApplicationDefaultCredentials({ tempDir, tokenProvider });

    assert.equal(tokenRequests, 1);
    assert.deepEqual(first, second);
  });
});

test("Vercel Firebase Admin setup refreshes stale subject-token files", async () => {
  await withVercelEnv(async (tempDir) => {
    let tokenRequests = 0;
    const tokens = [
      makeJwt(Math.floor(Date.now() / 1000) + 60),
      makeJwt(Math.floor(Date.now() / 1000) + 3600)
    ];
    const tokenProvider = async () => {
      const token = tokens[tokenRequests] ?? tokens[tokens.length - 1];
      tokenRequests += 1;
      return token;
    };

    const first = await ensureVercelApplicationDefaultCredentials({ tempDir, tokenProvider });
    const second = await ensureVercelApplicationDefaultCredentials({ tempDir, tokenProvider });

    assert.equal(tokenRequests, 2);
    assert.equal(first?.adcPath, second?.adcPath);
    assert.equal(first?.tokenPath, second?.tokenPath);
    assert.equal(await readFile(second?.tokenPath ?? "", "utf8"), tokens[1]);
  });
});

test("Vercel Firebase Admin setup serializes concurrent credential refreshes", async () => {
  await withVercelEnv(async (tempDir) => {
    let tokenRequests = 0;
    const token = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    const tokenProvider = async () => {
      tokenRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return token;
    };

    const states = await Promise.all(
      Array.from({ length: 5 }, () =>
        ensureVercelApplicationDefaultCredentials({ tempDir, tokenProvider })
      )
    );

    assert.equal(tokenRequests, 1);
    assert.equal(new Set(states.map((state) => state?.adcPath)).size, 1);
    assert.equal(new Set(states.map((state) => state?.tokenPath)).size, 1);
  });
});
