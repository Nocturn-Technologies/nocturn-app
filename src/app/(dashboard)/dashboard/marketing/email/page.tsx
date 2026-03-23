"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Mail, ArrowLeft, Copy, Check, Send, Loader2 } from "lucide-react";
import Link from "next/link";
import { generatePostEventEmail, generatePromoEmail } from "@/app/actions/ai-email";
import { sendCampaignEmail } from "@/app/actions/send-campaign";

export default function EmailComposerPage() {
  const [eventId, setEventId] = useState("");
  const [emailType, setEmailType] = useState<"promo" | "recap">("promo");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [events, setEvents] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; total: number } | null>(null);

  // Load events on mount
  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch("/api/events/list");
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events ?? []);
        }
      } catch {
        // Events will load from API
      }
    }
    loadEvents();
  }, []);

  async function handleGenerate() {
    if (!eventId) return;
    setGenerating(true);
    setSendResult(null);

    const result =
      emailType === "recap"
        ? await generatePostEventEmail(eventId)
        : await generatePromoEmail(eventId);

    if (result.email) {
      setSubject(result.email.subject);
      setBody(result.email.body);
    }
    setGenerating(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSend() {
    if (!eventId || !subject || !body) return;
    setSending(true);
    setSendResult(null);

    const result = await sendCampaignEmail({
      eventId,
      subject,
      body,
    });

    if (result.error) {
      alert(result.error);
    } else {
      setSendResult({ sent: result.sent ?? 0, total: result.total ?? 0 });
    }
    setSending(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/marketing">
          <Button variant="ghost" size="icon" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Email Composer</h1>
          <p className="text-sm text-muted-foreground">
            AI-generated emails for your events
          </p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-xs">Event</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
              >
                <option value="">Select an event...</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} ({e.status})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Email Type</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={emailType}
                onChange={(e) => setEmailType(e.target.value as "promo" | "recap")}
              >
                <option value="promo">Event Promo / Announcement</option>
                <option value="recap">Post-Event Recap</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full bg-nocturn hover:bg-nocturn-light"
                onClick={handleGenerate}
                disabled={!eventId || generating}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {generating ? "Generating..." : "Generate Email"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email preview */}
      {(subject || body) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-nocturn" />
              Email Preview
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="mr-1 h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" />
                    Copy
                  </>
                )}
              </Button>
              <Button
                size="sm"
                className="bg-nocturn hover:bg-nocturn-light"
                onClick={handleSend}
                disabled={sending || !subject || !body}
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-1 h-3 w-3" />
                    Send to Attendees
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="font-medium"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Body</Label>
              <textarea
                className="w-full min-h-[300px] rounded-md border bg-background px-3 py-2 text-sm leading-relaxed"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Send result */}
      {sendResult && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
          <p className="font-semibold text-green-400">
            ✅ Email sent to {sendResult.sent} of {sendResult.total} attendees
          </p>
          {sendResult.sent < sendResult.total && (
            <p className="text-xs text-muted-foreground mt-1">
              {sendResult.total - sendResult.sent} failed — check Resend dashboard for details
            </p>
          )}
        </div>
      )}

      {!subject && !body && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Sparkles className="h-12 w-12 text-muted-foreground/50" />
            <div className="text-center">
              <p className="font-medium">Select an event and generate an email</p>
              <p className="text-sm text-muted-foreground">
                Choose promo for upcoming events, or recap for completed ones
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
