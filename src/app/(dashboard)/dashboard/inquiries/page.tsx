"use client";

import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function InquiriesPage() {
  return (
    <div className="space-y-6 overflow-x-hidden max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold font-heading">Inquiries</h1>
        <p className="text-sm text-muted-foreground">
          Messages from collectives and promoters who want to work with you
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-nocturn/10 flex items-center justify-center mb-4">
          <MessageSquare className="h-6 w-6 text-nocturn" />
        </div>
        <h3 className="font-semibold font-heading text-lg mb-1">Inquiries moved to Messages</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
          Connect with other collectives and promoters directly through the Messages tab.
        </p>
        <Link href="/dashboard/chat">
          <Button className="bg-nocturn hover:bg-nocturn-light">
            Go to Messages
          </Button>
        </Link>
      </div>
    </div>
  );
}
