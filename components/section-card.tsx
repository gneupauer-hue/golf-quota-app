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
        "h-auto min-h-0 rounded-[28px] border border-white/70 bg-white/85 p-4 shadow-card backdrop-blur",
        className
      )}
    >
      {children}
    </section>
  );
}
