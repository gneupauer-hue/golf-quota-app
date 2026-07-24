export const metadata = {
  title: "Terms of Service — Irem Golf",
  description: "Terms for using the Irem golf app and its text-message program."
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-1 py-2 text-ink">
      <div>
        <h1 className="text-2xl font-semibold">Terms of Service</h1>
        <p className="mt-1 text-sm text-ink/60">Last updated: July 2026</p>
      </div>

      <p className="text-sm leading-relaxed text-ink/80">
        The Irem golf app is provided by More Calls NEPA for the private use of our golf group. By
        using the app you agree to these terms.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Using the app</h2>
        <p className="text-sm leading-relaxed text-ink/80">
          The app is for organizing golf games and tracking scores and quotas among members. Access
          is limited to approved members. Please keep your login to yourself and enter information
          accurately.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Text messages</h2>
        <p className="text-sm leading-relaxed text-ink/80">
          Text messaging is optional. If you opt in (in the app or by texting{" "}
          <strong>GOLF</strong> to our number), you agree to receive texts about games, RSVPs, game
          changes, and reminders. Message frequency varies, and message and data rates may apply.
          Reply <strong>STOP</strong> to opt out at any time, or <strong>HELP</strong> for help.
          See our{" "}
          <a href="/privacy" className="font-semibold text-pine">
            Privacy Policy
          </a>{" "}
          for how we handle your information.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">No warranty</h2>
        <p className="text-sm leading-relaxed text-ink/80">
          The app is provided &ldquo;as is&rdquo; for the convenience of our group. Scores, quotas,
          and payouts shown in the app are for the group&rsquo;s own use.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="text-sm leading-relaxed text-ink/80">
          Questions? Email{" "}
          <a href="mailto:gary@cmgnepa.com" className="font-semibold text-pine">
            gary@cmgnepa.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
