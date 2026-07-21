import assert from "node:assert/strict";
import test from "node:test";
import { getRoundSetupTeeButtonClass } from "../lib/tee-styles";

test("round setup tee buttons use their named tee colors", () => {
  assert.match(getRoundSetupTeeButtonClass("BLACK", false), /bg-\[#111827\] text-white/);
  assert.match(getRoundSetupTeeButtonClass("GREEN", false), /bg-\[#166534\] text-white/);
  assert.match(getRoundSetupTeeButtonClass("YELLOW", false), /bg-\[#FACC15\] text-\[#422006\]/);
  assert.match(getRoundSetupTeeButtonClass("WHITE", false), /bg-white text-ink/);
});

test("selected tee keeps its color and receives a clear selection ring", () => {
  const selectedYellow = getRoundSetupTeeButtonClass("YELLOW", true);

  assert.match(selectedYellow, /bg-\[#FACC15\]/);
  assert.match(selectedYellow, /ring-2 ring-\[#8B1E2D\]/);
  assert.doesNotMatch(selectedYellow, /opacity-65/);
});
