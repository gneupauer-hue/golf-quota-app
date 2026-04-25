import Link from "next/link";
import { SectionCard } from "@/components/section-card";

export default function NotFound() {
  return (
    <SectionCard className="text-center">
      <h2 className="text-2xl font-semibold tracking-tight">Round not found</h2>
      <p className="mt-2 text-sm text-ink/70">
        The round you tried to open does not exist anymore.
      </p>
      <Link
        href="/rounds"
        className="mt-4 inline-flex min-h-12 items-center justify-center rounded-2xl bg-pine px-5 text-sm font-semibold text-white"
      >
        Back to Rounds
      </Link>
    </SectionCard>
  );
}
