import { RoundResults } from "@/components/round-results";
import { SectionCard } from "@/components/section-card";
import { getRoundResultsData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function RoundResultsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getRoundResultsData(id).catch((error) => {
    console.error("[results] Could not load round results", { id, error });
    return null;
  });

  if (!data) {
    return (
      <SectionCard className="space-y-2 border border-danger/20 bg-[#FCE5E2]">
        <h3 className="text-base font-semibold text-danger">Results temporarily unavailable</h3>
        <p className="text-sm text-ink/75">Refresh in a moment. The page is protected from crashing while the database recovers.</p>
      </SectionCard>
    );
  }

  return <RoundResults data={data} />;
}
