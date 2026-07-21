import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const APP_SHELL_SOURCE = readFileSync("components/app-shell.tsx", "utf8");

test("mobile navigation uses a stable viewport anchor without centering transforms", () => {
  assert.match(APP_SHELL_SOURCE, /fixed inset-x-0 bottom-0/);
  assert.match(APP_SHELL_SOURCE, /pointer-events-auto mx-auto w-full max-w-md/);
  assert.match(APP_SHELL_SOURCE, /paddingBottom: "max\(8px, calc\(env\(safe-area-inset-bottom\) \+ 4px\)\)"/);
  assert.doesNotMatch(APP_SHELL_SOURCE, /left-1\/2/);
  assert.doesNotMatch(APP_SHELL_SOURCE, /-translate-x-1\/2/);
});
