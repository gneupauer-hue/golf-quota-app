import Link from "next/link";

export function QuickRoundLauncher({ label = "Set Up New Round" }: { label?: string }) {
  return (
    <div className="space-y-2">
      <Link
        href="/round-setup"
        className="club-btn-primary flex min-h-14 w-full items-center justify-center rounded-[24px] px-5 py-4 text-base"
      >
        {label}
      </Link>
    </div>
  );
}
