export const metadata = {
  title: "Privacy Policy — Irem Golf",
  description: "How the Irem golf app collects and uses information, including text messaging."
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-1 py-2 text-ink">
      <div>
        <h1 className="text-2xl font-semibold">Privacy Policy</h1>
        <p className="mt-1 text-sm text-ink/60">Last updated: July 2026</p>
      </div>

      <p className="text-sm leading-relaxed text-ink/80">
        This app (the &ldquo;Irem golf app&rdquo;) is operated by More Calls NEPA for a private
        group of golfers. This policy explains what information we collect, how we use it, and how
        our text-message program works.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Information we collect</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink/80">
          <li>Your name.</li>
          <li>Your mobile phone number, if you choose to sign in or opt in to game texts.</li>
          <li>Golf information you or an organizer enter — scores, quotas, and game RSVPs.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">How we use your information</h2>
        <p className="text-sm leading-relaxed text-ink/80">
          We use your information only to run the golf group: signing you in, tracking scores and
          quotas, organizing games, and — for members who opt in — sending text messages about
          upcoming games, RSVP confirmations, game changes, and reminders.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Text messaging</h2>
        <p className="text-sm leading-relaxed text-ink/80">
          You opt in to text messages by checking &ldquo;Text me about upcoming games&rdquo; when
          you sign up in the app, or by texting the keyword <strong>GOLF</strong> to our number.
          Message frequency varies. Message and data rates may apply. You can reply{" "}
          <strong>STOP</strong> at any time to stop all messages, or <strong>HELP</strong> for help.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">We do not sell or share your information</h2>
        <p className="text-sm leading-relaxed text-ink/80">
          We do not sell, rent, or trade your personal information. We do not share your phone
          number or your mobile opt-in data with any third parties or affiliates for their own
          marketing or promotional purposes. Text-messaging consent is never shared.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Data storage</h2>
        <p className="text-sm leading-relaxed text-ink/80">
          Your information is stored on secure, access-controlled services and is used only to
          operate the golf group. We keep it only as long as needed for that purpose.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="text-sm leading-relaxed text-ink/80">
          Questions about this policy? Email{" "}
          <a href="mailto:gary@cmgnepa.com" className="font-semibold text-pine">
            gary@cmgnepa.com
          </a>
          .
        </p>
      </section>
    </div>
  );
}
