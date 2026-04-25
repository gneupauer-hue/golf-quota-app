import { CurrentQuotas } from "@/components/current-quotas";
import { getCurrentQuotaRows } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CurrentQuotasPage() {
  const rows = await getCurrentQuotaRows();
  return <CurrentQuotas rows={rows} />;
}
