import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const APP_SHELL_SOURCE = readFileSync("components/app-shell.tsx", "utf8");

test("mobile navigation follows page content instead of floating over it", () => {
  assert.match(APP_SHELL_SOURCE, /flex min-h-\[100dvh\] flex-col/);
  assert.match(APP_SHELL_SOURCE, /className="mt-auto w-full px-2"/);
  assert.match(APP_SHELL_SOURCE, /mx-auto w-full max-w-md rounded-\[26px\]/);
  assert.match(APP_SHELL_SOURCE, /paddingBottom: "max\(8px, calc\(env\(safe-area-inset-bottom\) \+ 4px\)\)"/);
  assert.doesNotMatch(APP_SHELL_SOURCE, /fixed inset-x-0 bottom-0/);
  assert.doesNotMatch(APP_SHELL_SOURCE, /left-1\/2/);
  assert.doesNotMatch(APP_SHELL_SOURCE, /-translate-x-1\/2/);
});
