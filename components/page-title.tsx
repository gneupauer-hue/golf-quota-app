export function PageTitle({
  title,
  subtitle,
  action
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-end justify-between gap-3 pt-2">
      <div>
        <h2 className="text-2xl font-bold leading-tight tracking-tight text-ink">{title}</h2>
        {subtitle ? <p className="mt-2 text-sm font-medium leading-6 text-ink/85">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
