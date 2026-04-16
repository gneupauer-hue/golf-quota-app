import { notFound, redirect } from "next/navigation";
import { RoundEditor } from "@/components/round-editor";
import { getRoundEditorData } from "@/lib/data";

export default async function RoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getRoundEditorData(id);

  if (!data) {
    notFound();
  }

  if (data.round.canceledAt) {
    redirect("/");
  }

  if (data.round.completedAt) {
    redirect(`/rounds/${id}/results`);
  }

  return (
    <RoundEditor
      round={data.round}
      players={data.players}
      quotaSnapshot={data.quotaSnapshot}
      groups={data.groups}
    />
  );
}
