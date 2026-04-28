import { getBaselineQuotaRows } from "@/lib/data";
import { CurrentQuotas } from "@/components/current-quotas";

export const dynamic = "force-dynamic";

export default async function CurrentQuotasPage() {
  const rows = await getBaselineQuotaRows();
  return <CurrentQuotas rows={rows} />;
}
