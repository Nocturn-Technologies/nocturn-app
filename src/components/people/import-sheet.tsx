"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TagInput } from "./tag-input";
import {
  Upload,
  ClipboardPaste,
  UserPlus,
  Loader2,
  CheckCircle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ImportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectiveId: string;
  contactType: "industry" | "fan";
  defaultTab?: TabKey;
  onImportComplete?: (result: { created: number; updated: number }) => void;
}

interface ParsedContact {
  email: string;
  name?: string;
  phone?: string;
  instagram?: string;
  isExisting?: boolean;
}

interface PreviewResult {
  contacts: ParsedContact[];
  total: number;
  existing: number;
  newCount: number;
}

type TabKey = "paste" | "csv" | "quick";

const INDUSTRY_ROLES = [
  "artist",
  "venue",
  "photographer",
  "videographer",
  "promoter",
  "sound_production",
  "lighting_production",
  "sponsor",
  "artist_manager",
  "booking_agent",
  "graphic_designer",
  "mc_host",
  "event_staff",
  "other",
] as const;

const ROLE_LABELS: Record<string, string> = {
  artist: "DJ / Artist",
  venue: "Venue",
  photographer: "Photographer",
  videographer: "Videographer",
  promoter: "Promoter",
  sound_production: "Sound / Production",
  lighting_production: "Lighting / Production",
  sponsor: "Sponsor",
  artist_manager: "Artist Manager",
  booking_agent: "Booking Agent",
  graphic_designer: "Graphic Designer",
  mc_host: "MC / Host",
  event_staff: "Event Staff",
  other: "Other",
};

const TABS: { key: TabKey; label: string; icon: typeof ClipboardPaste }[] = [
  { key: "paste", label: "Paste", icon: ClipboardPaste },
  { key: "csv", label: "Upload CSV", icon: Upload },
  { key: "quick", label: "Quick Add", icon: UserPlus },
];

// ── Email parser ────────────────────────────────────────────────────────────

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function parseContactsFromText(text: string): ParsedContact[] {
  const lines = text.split(/[\n\r]+/).filter((l) => l.trim());
  const seen = new Set<string>();
  const contacts: ParsedContact[] = [];

  for (const line of lines) {
    const emails = line.match(EMAIL_REGEX);
    if (!emails) continue;

    for (const email of emails) {
      const lower = email.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);

      // Try to extract name from the line (anything before the email)
      const beforeEmail = line.substring(0, line.indexOf(email)).trim();
      const name = beforeEmail
        .replace(/[,;|\t]+$/, "")
        .trim()
        .replace(/^["']|["']$/g, "");

      contacts.push({
        email: lower,
        name: name || undefined,
      });
    }
  }

  return contacts;
}

function parseCSVText(csvText: string): ParsedContact[] {
  const lines = csvText.split(/[\n\r]+/).filter((l) => l.trim());
  if (lines.length < 2) return parseContactsFromText(csvText);

  // Detect header row
  const header = lines[0].toLowerCase();
  const hasHeader =
    header.includes("email") ||
    header.includes("name") ||
    header.includes("phone");

  if (!hasHeader) return parseContactsFromText(csvText);

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
  const emailIdx = headers.findIndex((h) => h.includes("email"));
  const nameIdx = headers.findIndex(
    (h) => h === "name" || h === "full name" || h === "fullname" || h === "first name"
  );
  const lastNameIdx = headers.findIndex((h) => h === "last name" || h === "lastname");
  const phoneIdx = headers.findIndex((h) => h.includes("phone"));
  const igIdx = headers.findIndex(
    (h) => h.includes("instagram") || h.includes("ig") || h === "handle"
  );

  if (emailIdx === -1) return parseContactsFromText(csvText);

  const seen = new Set<string>();
  const contacts: ParsedContact[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parse (handles basic quoted fields)
    const cols = lines[i].match(/("([^"]*)"|[^,]*)/g)?.map((c) =>
      c.replace(/^["']|["']$/g, "").trim()
    ) ?? [];

    const email = cols[emailIdx]?.toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);

    let name = nameIdx >= 0 ? cols[nameIdx] : undefined;
    if (lastNameIdx >= 0 && cols[lastNameIdx]) {
      name = `${name || ""} ${cols[lastNameIdx]}`.trim();
    }

    contacts.push({
      email,
      name: name || undefined,
      phone: phoneIdx >= 0 ? cols[phoneIdx] || undefined : undefined,
      instagram: igIdx >= 0 ? cols[igIdx] || undefined : undefined,
    });
  }

  return contacts;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ImportSheet({
  open,
  onOpenChange,
  collectiveId,
  contactType,
  defaultTab,
  onImportComplete,
}: ImportSheetProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("paste");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ created: number; updated: number } | null>(null);

  // Paste tab state
  const [pasteText, setPasteText] = useState("");
  const [pasteTag, setPasteTag] = useState("");
  const [pasteRole, setPasteRole] = useState("");
  const [pastePreview, setPastePreview] = useState<PreviewResult | null>(null);

  // CSV tab state
  const [csvPreview, setCsvPreview] = useState<PreviewResult | null>(null);
  const [csvTag, setCsvTag] = useState("");
  const [csvRole, setCsvRole] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quick add state
  const [quickName, setQuickName] = useState("");
  const [quickEmail, setQuickEmail] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickInstagram, setQuickInstagram] = useState("");
  const [quickRole, setQuickRole] = useState("");
  const [quickTags, setQuickTags] = useState<string[]>([]);
  const [quickNotes, setQuickNotes] = useState("");

  // Error
  const [error, setError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab ?? "paste");
      setPasteText("");
      setPasteTag("");
      setPasteRole("");
      setPastePreview(null);
      setCsvPreview(null);
      setCsvTag("");
      setCsvRole("");
      setQuickName("");
      setQuickEmail("");
      setQuickPhone("");
      setQuickInstagram("");
      setQuickRole("");
      setQuickTags([]);
      setQuickNotes("");
      setSuccess(null);
      setError(null);
      setLoading(false);
    }
  }, [open]);

  // Auto-close after success
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        onOpenChange(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [success, onOpenChange]);

  // ── Paste handlers ──

  const handlePastePreview = useCallback(() => {
    const contacts = parseContactsFromText(pasteText);
    if (contacts.length === 0) {
      setError("No valid emails found. Paste emails (one per line) or a spreadsheet export.");
      return;
    }
    setError(null);
    // For now we treat all as new (server action will determine merge)
    setPastePreview({
      contacts,
      total: contacts.length,
      existing: 0,
      newCount: contacts.length,
    });
  }, [pasteText]);

  const handlePasteImport = useCallback(async () => {
    if (!pastePreview) return;
    setLoading(true);
    setError(null);
    try {
      // Call server action
      const { importContacts } = await import("@/app/actions/contacts");
      const result = await importContacts(collectiveId, {
        text: pastePreview.contacts.map((c) => `${c.name ?? ""} ${c.email}`).join("\n"),
        contactType,
        tags: pasteTag ? [pasteTag.trim().toLowerCase()] : [],
        role: contactType === "industry" && pasteRole ? pasteRole : undefined,
      });
      if (result.error) {
        setError(result.error);
      } else {
        const res = { created: result.result?.created ?? 0, updated: result.result?.updated ?? 0 };
        setSuccess(res);
        onImportComplete?.(res);
      }
    } catch {
      setError("Import failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [pastePreview, collectiveId, contactType, pasteTag, pasteRole, onImportComplete]);

  // ── CSV handlers ──

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setError(null);

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const contacts = parseCSVText(text);
        if (contacts.length === 0) {
          setError("No valid contacts found in CSV. Make sure there is an email column.");
          return;
        }
        setCsvPreview({
          contacts,
          total: contacts.length,
          existing: 0,
          newCount: contacts.length,
        });
      };
      reader.readAsText(file);
    },
    []
  );

  const handleCsvImport = useCallback(async () => {
    if (!csvPreview) return;
    setLoading(true);
    setError(null);
    try {
      const { importContacts } = await import("@/app/actions/contacts");
      const result = await importContacts(collectiveId, {
        text: csvPreview.contacts.map((c) => `${c.name ?? ""} ${c.email}`).join("\n"),
        contactType,
        tags: csvTag ? [csvTag.trim().toLowerCase()] : [],
        role: contactType === "industry" && csvRole ? csvRole : undefined,
      });
      if (result.error) {
        setError(result.error);
      } else {
        const res = { created: result.result?.created ?? 0, updated: result.result?.updated ?? 0 };
        setSuccess(res);
        onImportComplete?.(res);
      }
    } catch {
      setError("Import failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [csvPreview, collectiveId, contactType, csvTag, csvRole, onImportComplete]);

  // ── Quick add handler ──

  const handleQuickAdd = useCallback(async () => {
    if (!quickEmail.trim()) {
      setError("Email is required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { addContact } = await import("@/app/actions/contacts");
      const result = await addContact(collectiveId, {
        fullName: quickName.trim() || quickEmail.trim().toLowerCase(),
        email: quickEmail.trim().toLowerCase(),
        contactType,
        phone: quickPhone.trim() || undefined,
        instagram: quickInstagram.trim() || undefined,
        role: contactType === "industry" && quickRole ? quickRole : undefined,
        tags: quickTags,
        notes: quickNotes.trim() || undefined,
      });
      if (result.error) {
        setError(result.error);
      } else {
        const res = { created: 1, updated: 0 };
        setSuccess(res);
        onImportComplete?.(res);
      }
    } catch {
      setError("Failed to add contact. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [
    collectiveId,
    contactType,
    quickEmail,
    quickName,
    quickPhone,
    quickInstagram,
    quickRole,
    quickTags,
    quickNotes,
    onImportComplete,
  ]);

  // ── Success state ──

  if (success) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[60vh] rounded-t-2xl sm:max-w-lg sm:mx-auto">
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg text-foreground">
                {success.created + success.updated > 1
                  ? `${success.created + success.updated} contacts imported`
                  : "Contact added"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {success.created > 0 && `${success.created} new`}
                {success.created > 0 && success.updated > 0 && " · "}
                {success.updated > 0 && `${success.updated} updated`}
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // ── Main render ──

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] rounded-t-2xl sm:max-w-lg sm:mx-auto overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>
            Import {contactType === "industry" ? "Contacts" : "Fans"}
          </SheetTitle>
          <SheetDescription>
            Add contacts from a paste, CSV upload, or one at a time.
          </SheetDescription>
        </SheetHeader>

        {/* Tab bar */}
        <div className="flex gap-1 px-4 pb-2">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key);
                setError(null);
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === key
                  ? "bg-nocturn text-white"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-4 pb-6 space-y-4">
          {/* ── Paste tab ── */}
          {activeTab === "paste" && (
            <>
              <textarea
                value={pasteText}
                onChange={(e) => {
                  setPasteText(e.target.value);
                  setPastePreview(null);
                }}
                placeholder="Paste emails (one per line) or a full spreadsheet export from Eventbrite, Posh, or Google Sheets"
                rows={6}
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none dark:bg-input/30"
              />

              <div className="space-y-2">
                <Label>Tag all as:</Label>
                <Input
                  value={pasteTag}
                  onChange={(e) => setPasteTag(e.target.value)}
                  placeholder="e.g. summer-series, warehouse-crew"
                />
              </div>

              {contactType === "industry" && (
                <div className="space-y-2">
                  <Label>Role:</Label>
                  <select
                    value={pasteRole}
                    onChange={(e) => setPasteRole(e.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  >
                    <option value="">No role</option>
                    {INDUSTRY_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {pastePreview && (
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-sm">
                  <p className="text-foreground font-medium">
                    Found {pastePreview.total} contact
                    {pastePreview.total !== 1 ? "s" : ""}.
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {pastePreview.existing > 0 &&
                      `${pastePreview.existing} already exist (will merge). `}
                    {pastePreview.newCount} new.
                  </p>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              {!pastePreview ? (
                <Button
                  onClick={handlePastePreview}
                  disabled={!pasteText.trim()}
                  className="w-full bg-nocturn hover:bg-nocturn-light text-white min-h-[44px]"
                >
                  Preview
                </Button>
              ) : (
                <Button
                  onClick={handlePasteImport}
                  disabled={loading}
                  className="w-full bg-nocturn hover:bg-nocturn-light text-white min-h-[44px]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${pastePreview.total} Contact${pastePreview.total !== 1 ? "s" : ""}`
                  )}
                </Button>
              )}
            </>
          )}

          {/* ── CSV tab ── */}
          {activeTab === "csv" && (
            <>
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-white/[0.1] p-8 cursor-pointer hover:border-nocturn/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to upload a <span className="text-foreground font-medium">.csv</span> file
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              <div className="space-y-2">
                <Label>Tag all as:</Label>
                <Input
                  value={csvTag}
                  onChange={(e) => setCsvTag(e.target.value)}
                  placeholder="e.g. eventbrite-export"
                />
              </div>

              {contactType === "industry" && (
                <div className="space-y-2">
                  <Label>Role:</Label>
                  <select
                    value={csvRole}
                    onChange={(e) => setCsvRole(e.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  >
                    <option value="">No role</option>
                    {INDUSTRY_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {csvPreview && (
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-sm">
                  <p className="text-foreground font-medium">
                    Found {csvPreview.total} contact
                    {csvPreview.total !== 1 ? "s" : ""}.
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {csvPreview.existing > 0 &&
                      `${csvPreview.existing} already exist (will merge). `}
                    {csvPreview.newCount} new.
                  </p>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              {csvPreview && (
                <Button
                  onClick={handleCsvImport}
                  disabled={loading}
                  className="w-full bg-nocturn hover:bg-nocturn-light text-white min-h-[44px]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    `Import ${csvPreview.total} Contact${csvPreview.total !== 1 ? "s" : ""}`
                  )}
                </Button>
              )}
            </>
          )}

          {/* ── Quick Add tab ── */}
          {activeTab === "quick" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="quick-name">Name</Label>
                <Input
                  id="quick-name"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  placeholder="Full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-email">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="quick-email"
                  type="email"
                  value={quickEmail}
                  onChange={(e) => setQuickEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-phone">
                  Phone{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="quick-phone"
                  type="tel"
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(e.target.value)}
                  placeholder="+1 555 123 4567"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-ig">
                  Instagram{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="quick-ig"
                  value={quickInstagram}
                  onChange={(e) => setQuickInstagram(e.target.value)}
                  placeholder="@handle"
                />
              </div>

              {contactType === "industry" && (
                <div className="space-y-2">
                  <Label>Role:</Label>
                  <select
                    value={quickRole}
                    onChange={(e) => setQuickRole(e.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  >
                    <option value="">No role</option>
                    {INDUSTRY_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Tags</Label>
                <TagInput
                  tags={quickTags}
                  onChange={setQuickTags}
                  placeholder="Add tags..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quick-notes">
                  Notes{" "}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <textarea
                  id="quick-notes"
                  value={quickNotes}
                  onChange={(e) => setQuickNotes(e.target.value)}
                  placeholder="Any notes about this contact..."
                  rows={3}
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none dark:bg-input/30"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                onClick={handleQuickAdd}
                disabled={loading || !quickEmail.trim()}
                className="w-full bg-nocturn hover:bg-nocturn-light text-white min-h-[44px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Contact"
                )}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
