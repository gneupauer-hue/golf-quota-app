import { classNames } from "@/lib/utils";

export function SectionCard({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={classNames(
        "h-auto min-h-0 rounded-[28px] border border-mist bg-white p-5 shadow-card",
        className
      )}
    >
      {children}
    </section>
  );
}
