import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

const APP_URL = "https://app.trynocturn.com";

const colors = {
  bg: "#09090B",
  surface: "#18181B",
  border: "#27272A",
  text: "#FAFAFA",
  body: "#A1A1AA",
  muted: "#71717A",
  faint: "#52525B",
  purple: "#7B2FF7",
  purpleLight: "#9D5CFF",
  purpleGlow: "#E9DEFF",
  green: "#10B981",
  amber: "#F59E0B",
  red: "#EF4444",
} as const;

const fonts = {
  heading: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  body: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

export type DetailRow = { label: string; value: string };
export type EyebrowVariant = "default" | "green" | "amber" | "red";

export interface LayoutProps {
  preheader: string;
  eyebrow?: string;
  eyebrowVariant?: EyebrowVariant;
  headline: string;
  intro?: React.ReactNode;
  collectiveName?: string;
  hero?: React.ReactNode;
  details?: DetailRow[];
  cta?: { label: string; href: string };
  secondaryLink?: { label: string; href: string };
  dynamic?: React.ReactNode;
  footerVariant?: "transactional" | "promotional";
  unsubscribeUrl?: string;
  preferencesUrl?: string;
  children?: React.ReactNode;
}

const eyebrowColor = (v: EyebrowVariant | undefined): string => {
  switch (v) {
    case "green":
      return colors.green;
    case "amber":
      return colors.amber;
    case "red":
      return colors.red;
    default:
      return colors.purple;
  }
};

export default function Layout({
  preheader,
  eyebrow,
  eyebrowVariant = "default",
  headline,
  intro,
  collectiveName,
  hero,
  details,
  cta,
  secondaryLink,
  dynamic,
  footerVariant = "transactional",
  unsubscribeUrl,
  preferencesUrl = `${APP_URL}/dashboard/settings`,
  children,
}: LayoutProps) {
  const eyeColor = eyebrowColor(eyebrowVariant);

  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700;800&family=DM+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Preview>{preheader}</Preview>
      <Body
        style={{
          margin: 0,
          padding: 0,
          background: colors.bg,
          fontFamily: fonts.body,
          color: colors.text,
        }}
      >
        <Container
          style={{
            maxWidth: "480px",
            margin: "0 auto",
            padding: "40px 24px",
          }}
        >
          {/* HEADER */}
          <Section
            style={{ paddingBottom: "24px", borderBottom: `1px solid ${colors.border}` }}
          >
            <Link
              href={APP_URL}
              style={{
                color: colors.text,
                fontFamily: fonts.heading,
                fontSize: "26px",
                fontWeight: 700,
                letterSpacing: "-0.5px",
                textDecoration: "none",
              }}
            >
              nocturn<span style={{ color: colors.purple }}>.</span>
            </Link>
            {collectiveName && (
              <Text
                style={{
                  color: colors.muted,
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "1.4px",
                  margin: "8px 0 0",
                  fontWeight: 500,
                }}
              >
                for {collectiveName}
              </Text>
            )}
          </Section>

          {/* HEADLINE */}
          <Section style={{ paddingTop: "32px", paddingBottom: "8px" }}>
            {eyebrow && (
              <Text
                style={{
                  color: eyeColor,
                  fontFamily: fonts.heading,
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "1.6px",
                  textTransform: "uppercase",
                  margin: "0 0 12px",
                }}
              >
                {eyebrow}
              </Text>
            )}
            <Text
              style={{
                fontFamily: fonts.heading,
                color: colors.text,
                fontSize: "26px",
                lineHeight: 1.2,
                fontWeight: 700,
                letterSpacing: "-0.4px",
                margin: 0,
              }}
            >
              {headline}
            </Text>
            {intro && (
              <Text
                style={{
                  color: colors.body,
                  fontSize: "15px",
                  lineHeight: 1.6,
                  margin: "16px 0 0",
                }}
              >
                {intro}
              </Text>
            )}
          </Section>

          {/* HERO */}
          {hero && (
            <Section
              style={{
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: "14px",
                padding: "20px",
                margin: "24px 0",
              }}
            >
              {hero}
            </Section>
          )}

          {/* DETAILS */}
          {details && details.length > 0 && (
            <Section style={{ margin: "24px 0" }}>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "1.6px",
                  textTransform: "uppercase",
                  margin: "0 0 12px",
                }}
              >
                Details
              </Text>
              {details.map((d) => (
                <table
                  key={d.label}
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{
                    borderBottom: `1px solid ${colors.border}`,
                    margin: 0,
                  }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          color: colors.muted,
                          fontSize: "13px",
                          padding: "12px 0",
                        }}
                      >
                        {d.label}
                      </td>
                      <td
                        style={{
                          color: colors.text,
                          fontSize: "14px",
                          fontWeight: 500,
                          padding: "12px 0",
                          textAlign: "right",
                        }}
                      >
                        {d.value}
                      </td>
                    </tr>
                  </tbody>
                </table>
              ))}
            </Section>
          )}

          {/* CTA */}
          {cta && (
            <Section style={{ textAlign: "center", margin: "28px 0 16px" }}>
              <Link
                href={cta.href}
                style={{
                  display: "inline-block",
                  background: colors.purple,
                  color: "#FFFFFF",
                  fontFamily: fonts.heading,
                  fontWeight: 600,
                  fontSize: "15px",
                  padding: "14px 28px",
                  borderRadius: "10px",
                  textDecoration: "none",
                }}
              >
                {cta.label}
              </Link>
              {secondaryLink && (
                <Text style={{ margin: "14px 0 0" }}>
                  <Link
                    href={secondaryLink.href}
                    style={{
                      color: colors.body,
                      fontSize: "13px",
                      textDecoration: "underline",
                    }}
                  >
                    {secondaryLink.label}
                  </Link>
                </Text>
              )}
            </Section>
          )}

          {/* DYNAMIC BLOCK */}
          {dynamic && <Section style={{ margin: "20px 0" }}>{dynamic}</Section>}

          {/* CHILDREN ESCAPE HATCH (rare — for emails that need fully custom mid-section content) */}
          {children}

          {/* FOOTER */}
          <Hr style={{ borderColor: colors.border, margin: "32px 0 24px" }} />
          <Section>
            <Text
              style={{
                fontFamily: fonts.heading,
                color: colors.text,
                fontSize: "16px",
                fontWeight: 700,
                margin: 0,
              }}
            >
              nocturn<span style={{ color: colors.purple }}>.</span>
            </Text>
            <Text
              style={{
                color: colors.muted,
                fontSize: "12px",
                fontStyle: "italic",
                margin: "4px 0 0",
              }}
            >
              You run the night. Nocturn runs the business.
            </Text>
            <Text
              style={{
                color: colors.body,
                fontSize: "13px",
                margin: "16px 0 0",
                lineHeight: 1.5,
              }}
            >
              Reply directly to this email — we read every one.
            </Text>
            <Text
              style={{
                color: colors.muted,
                fontSize: "11px",
                margin: "16px 0 0",
              }}
            >
              <Link
                href={preferencesUrl}
                style={{ color: colors.muted, textDecoration: "underline" }}
              >
                Manage notifications
              </Link>
              {footerVariant === "promotional" && unsubscribeUrl && (
                <>
                  {" · "}
                  <Link
                    href={unsubscribeUrl}
                    style={{ color: colors.muted, textDecoration: "underline" }}
                  >
                    Unsubscribe
                  </Link>
                </>
              )}
            </Text>
            <Text
              style={{
                color: colors.faint,
                fontSize: "11px",
                margin: "12px 0 0",
              }}
            >
              © 2026 Nocturn · Brooklyn, NY
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ───────────────── Shared sub-components ─────────────────

export function HeroCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: colors.surface,
        padding: "20px",
      }}
    >
      {children}
    </div>
  );
}

export function HeroQR({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          background: "#FFFFFF",
          padding: "16px",
          borderRadius: "12px",
          display: "inline-block",
        }}
      >
        <img src={src} alt={alt} width={220} height={220} style={{ display: "block" }} />
      </div>
      {caption && (
        <Text
          style={{
            color: colors.muted,
            fontSize: "12px",
            margin: "12px 0 0",
            letterSpacing: "0.4px",
          }}
        >
          {caption}
        </Text>
      )}
    </div>
  );
}

export function HeroStat({
  value,
  context,
}: {
  value: React.ReactNode;
  context?: React.ReactNode;
}) {
  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <Text
        style={{
          fontFamily: fonts.heading,
          fontSize: "44px",
          fontWeight: 700,
          color: colors.text,
          margin: 0,
          lineHeight: 1,
          letterSpacing: "-1.2px",
        }}
      >
        {value}
      </Text>
      {context && (
        <Text
          style={{
            color: colors.body,
            fontSize: "13px",
            margin: "10px 0 0",
          }}
        >
          {context}
        </Text>
      )}
    </div>
  );
}

export function HeroPercent({
  percent,
  caption,
}: {
  percent: number;
  caption?: string;
}) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <Text
        style={{
          fontFamily: fonts.heading,
          fontSize: "44px",
          fontWeight: 700,
          color: colors.purple,
          margin: 0,
          lineHeight: 1,
          letterSpacing: "-1.2px",
        }}
      >
        {pct}%
      </Text>
      {caption && (
        <Text
          style={{
            color: colors.body,
            fontSize: "13px",
            margin: "10px 0 0",
          }}
        >
          {caption}
        </Text>
      )}
      <div
        style={{
          height: "5px",
          background: colors.border,
          borderRadius: "999px",
          margin: "16px 0 0",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: colors.purple,
            borderRadius: "999px",
          }}
        />
      </div>
    </div>
  );
}

export function DynamicBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderLeft: `3px solid ${colors.purple}`,
        borderRadius: "10px",
        padding: "16px 18px",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.heading,
          fontSize: "13px",
          fontWeight: 600,
          color: colors.text,
          margin: "0 0 8px",
        }}
      >
        {title}
      </Text>
      <div
        style={{
          color: colors.body,
          fontSize: "13.5px",
          lineHeight: 1.6,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export { colors as emailColors, fonts as emailFonts };
