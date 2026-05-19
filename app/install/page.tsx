import { PageTitle } from "@/components/page-title";
import { SectionCard } from "@/components/section-card";
import { ShareAppLinkButton } from "@/components/share-app-link-button";

const iphoneSteps = [
  "Open the app in Safari",
  "Tap the Share button",
  "Tap Add to Home Screen",
  "Tap Add"
];

const androidSteps = [
  "Open the app in Chrome",
  "Tap the three-dot menu",
  "Tap Add to Home screen",
  "Tap Add"
];

function InstallSteps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <SectionCard className="space-y-3">
      <h3 className="text-lg font-extrabold text-pine">{title}</h3>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm font-semibold text-ink/80">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pine text-xs font-extrabold text-white">
              {index + 1}
            </span>
            <span className="pt-1">{step}</span>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

export default function InstallPage() {
  return (
    <div className="space-y-4">
      <PageTitle
        title="Add This App To Your Phone"
        subtitle="Save the Irem Golf Quota App to your home screen or send the link to another player."
      />

      <SectionCard className="space-y-4 border border-pine/20 bg-[#FBF7F0]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pine">Share</p>
          <h3 className="mt-1 text-xl font-extrabold text-ink">Text the app link</h3>
        </div>
        <ShareAppLinkButton />
      </SectionCard>

      <InstallSteps title="iPhone" steps={iphoneSteps} />
      <InstallSteps title="Android" steps={androidSteps} />
    </div>
  );
}
