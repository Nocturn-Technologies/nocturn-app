import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Nocturn",
  description: "Privacy Policy for the Nocturn platform.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background overflow-x-hidden">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: March 23, 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">1. Information We Collect</h2>
            <p><strong className="text-foreground">Account information:</strong> Name, email address, and optional profile details when you create an account.</p>
            <p className="mt-2"><strong className="text-foreground">Collective information:</strong> Collective name, city, description, social media handles, and member details.</p>
            <p className="mt-2"><strong className="text-foreground">Event data:</strong> Event titles, dates, venues, ticket tiers, pricing, and flyer images.</p>
            <p className="mt-2"><strong className="text-foreground">Payment information:</strong> Processed securely by Stripe. We do not store credit card numbers. We receive transaction confirmations including amounts and buyer email addresses.</p>
            <p className="mt-2"><strong className="text-foreground">Attendee data:</strong> Email addresses of ticket purchasers, check-in status, and attendance history.</p>
            <p className="mt-2"><strong className="text-foreground">Usage data:</strong> Pages visited, features used, and interactions with the Platform for improving the service.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">2. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide and maintain the Platform</li>
              <li>To process ticket purchases and settlements</li>
              <li>To send transactional emails (ticket confirmations, settlement reports)</li>
              <li>To power AI features (content suggestions, financial forecasts)</li>
              <li>To improve the Platform based on usage patterns</li>
              <li>To communicate updates about the service</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">3. Data Isolation</h2>
            <p>Each collective&apos;s data is isolated using row-level security in our database. Members of one collective cannot access another collective&apos;s data unless explicitly shared (e.g., co-hosted events).</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">4. Third-Party Services</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Stripe</strong> — Payment processing (<a href="https://stripe.com/privacy" className="text-nocturn hover:underline" target="_blank" rel="noopener">Stripe Privacy Policy</a>)</li>
              <li><strong className="text-foreground">Supabase</strong> — Database and authentication hosting</li>
              <li><strong className="text-foreground">Vercel</strong> — Application hosting and analytics</li>
              <li><strong className="text-foreground">Resend</strong> — Transactional email delivery</li>
              <li><strong className="text-foreground">Anthropic</strong> — AI features (no personal data sent to AI models)</li>
              <li><strong className="text-foreground">Sentry</strong> — Error monitoring (no personal data included in error reports)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">5. Data Retention</h2>
            <p>We retain your data for as long as your account is active. You may request deletion at any time by contacting us. Event and financial records may be retained for up to 7 years for tax and legal compliance.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">6. Your Rights</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Access:</strong> Request a copy of your data at any time</li>
              <li><strong className="text-foreground">Export:</strong> Export your event, attendee, and financial data</li>
              <li><strong className="text-foreground">Deletion:</strong> Request deletion of your account and associated data</li>
              <li><strong className="text-foreground">Correction:</strong> Update or correct your information</li>
              <li><strong className="text-foreground">Opt-out:</strong> Unsubscribe from marketing communications</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">7. Security</h2>
            <p>We use industry-standard security measures including encrypted connections (TLS), row-level security for data isolation, secure authentication, and encrypted payment processing via Stripe. No system is 100% secure, and we cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">8. Cookies</h2>
            <p>We use essential cookies for authentication and session management. We use Vercel Analytics for aggregate usage data. We do not use third-party advertising cookies.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">9. Children</h2>
            <p>The Platform is not directed to children under 18. We do not knowingly collect personal information from minors.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">10. Changes</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes via email or in-app notification.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">11. Contact</h2>
            <p>Questions about your privacy? Contact us at <a href="mailto:shawn@trynocturn.com" className="text-nocturn hover:underline">shawn@trynocturn.com</a>.</p>
          </section>

          <p className="pt-4 text-xs text-muted-foreground italic">
            This policy is not a substitute for legal advice. Consult a lawyer for your specific situation.
          </p>
        </div>
      </div>
    </div>
  );
}
