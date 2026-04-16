import { CurrentQuotas } from "@/components/current-quotas";
import { getCurrentQuotaRows } from "@/lib/data";

export default async function CurrentQuotasPage() {
  const rows = await getCurrentQuotaRows();
  return <CurrentQuotas rows={rows} />;
}
