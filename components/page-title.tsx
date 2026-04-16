export function PageTitle({
  title,
  subtitle,
  action
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-ink">{title}</h2>
        <p className="mt-1 text-sm font-medium text-ink/85">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
