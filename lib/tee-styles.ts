import type { Tee } from "@/lib/tees";

const teeButtonColors: Record<Tee, string> = {
  BLACK: "border-[#111827] bg-[#111827] text-white",
  GREEN: "border-[#166534] bg-[#166534] text-white",
  YELLOW: "border-[#B45309]/35 bg-[#FACC15] text-[#422006]",
  WHITE: "border-ink/25 bg-white text-ink"
};

export function getRoundSetupTeeButtonClass(tee: Tee, isSelected: boolean) {
  return [
    teeButtonColors[tee],
    isSelected
      ? "ring-2 ring-[#8B1E2D] ring-offset-2 opacity-100"
      : "opacity-65 hover:opacity-100"
  ].join(" ");
}
