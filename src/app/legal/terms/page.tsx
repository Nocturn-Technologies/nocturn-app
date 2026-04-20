import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Nocturn",
  description: "Terms of Service for the Nocturn platform.",
};

export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-background overflow-x-hidden">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: March 23, 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">1. Agreement to Terms</h2>
            <p>By accessing or using Nocturn (&quot;the Platform&quot;), operated by Nocturn Technologies (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">2. Description of Service</h2>
            <p>Nocturn is an operations platform for music collectives and independent event promoters. The Platform provides event management, ticketing, financial settlement, team coordination, and AI-assisted marketing tools.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">3. Accounts</h2>
            <p>You must provide accurate information when creating an account. You are responsible for maintaining the security of your account and all activity under it. You must be at least 18 years old to create an account.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">4. Collectives</h2>
            <p>Collectives are organizational units on the Platform. The collective admin is responsible for managing members, events, and financial settings. Each collective&apos;s data is isolated and only accessible to its members.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">5. Ticketing and Payments</h2>
            <p>Ticket payments are processed by Stripe. A service fee of 7% + $0.50 per ticket is charged to the ticket buyer. Event organizers keep 100% of the ticket price they set. Nocturn does not guarantee event attendance or refunds — refund policies are set by individual event organizers.</p>
            <p className="mt-2">Free event registrations do not involve any payment processing.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">6. Settlements and Payouts</h2>
            <p>After an event is completed, Nocturn generates a settlement report showing revenue, fees, and expenses. Payouts to collectives are processed manually. Typical payout timing is within 7-14 business days after event completion, subject to verification.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">7. Data Ownership</h2>
            <p>You retain ownership of all content you upload to the Platform, including event information, flyers, and attendee data. Nocturn has a license to use this content solely for the purpose of providing the service. You may export your data at any time.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">8. AI Features</h2>
            <p>The Platform uses AI to generate content suggestions, financial forecasts, and marketing copy. AI-generated content is provided as-is and should be reviewed before use. Nocturn is not liable for decisions made based on AI-generated content.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">9. Prohibited Use</h2>
            <p>You may not use the Platform for illegal activities, to sell tickets to events you are not authorized to promote, to harass or spam attendees, or to circumvent our fee structure.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">10. Limitation of Liability</h2>
            <p>Nocturn is provided &quot;as is&quot; without warranties of any kind. We are not liable for indirect, incidental, or consequential damages. Our total liability shall not exceed the fees you paid in the 12 months prior to the claim.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">11. Termination</h2>
            <p>Either party may terminate this agreement at any time. Upon termination, your access to the Platform ceases, but you may request export of your data within 30 days. Outstanding payouts will be processed per the normal schedule.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">12. Changes to Terms</h2>
            <p>We may update these Terms from time to time. We will notify you of material changes via email or in-app notification. Continued use after changes constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">13. Contact</h2>
            <p>Questions about these Terms? Contact us at <a href="mailto:shawn@trynocturn.com" className="text-nocturn hover:underline">shawn@trynocturn.com</a>.</p>
          </section>

          <p className="pt-4 text-xs text-muted-foreground italic">
            These terms are not a substitute for legal advice. Consult a lawyer for your specific situation.
          </p>
        </div>
      </div>
    </div>
  );
}
