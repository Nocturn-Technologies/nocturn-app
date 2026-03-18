"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { acceptInvitation } from "@/app/actions/members";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2, Users } from "lucide-react";

type InviteState =
  | "loading"
  | "not-found"
  | "expired"
  | "needs-login"
  | "ready"
  | "accepting"
  | "accepted"
  | "already-member"
  | "error";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const token = params.token as string;

  const [state, setState] = useState<InviteState>("loading");
  const [collectiveName, setCollectiveName] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    async function checkInvite() {
      // First check if user is logged in
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Redirect to login with return URL
        router.push(`/login?redirect=/invite/${token}`);
        return;
      }

      // Look up the invitation to show details
      const { data: invitation } = await supabase
        .from("invitations")
        .select("*, collectives(name)")
        .eq("token", token)
        .maybeSingle();

      if (!invitation) {
        setState("not-found");
        return;
      }

      if (invitation.status !== "pending") {
        setState(invitation.status === "expired" ? "expired" : "not-found");
        return;
      }

      if (new Date(invitation.expires_at) < new Date()) {
        setState("expired");
        return;
      }

      setCollectiveName(
        (invitation.collectives as { name: string } | null)?.name ?? "this collective"
      );
      setInviteRole(invitation.role);
      setState("ready");
    }

    checkInvite();
  }, [supabase, token, router]);

  async function handleAccept() {
    setState("accepting");
    const result = await acceptInvitation(token);

    if (result.error) {
      setErrorMessage(result.error);
      setState("error");
      return;
    }

    if (result.alreadyMember) {
      setState("already-member");
    } else {
      setState("accepted");
    }
  }

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-nocturn" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-nocturn">
            nocturn.
          </h1>
        </div>

        {state === "not-found" && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <XCircle className="h-12 w-12 text-muted-foreground" />
              <div className="text-center">
                <h2 className="text-lg font-bold">Invitation not found</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This invitation link is invalid or has already been used.
                </p>
              </div>
              <Button
                onClick={() => router.push("/dashboard")}
                className="bg-nocturn hover:bg-nocturn-light"
              >
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {state === "expired" && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <XCircle className="h-12 w-12 text-orange-500" />
              <div className="text-center">
                <h2 className="text-lg font-bold">Invitation expired</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This invitation has expired. Ask the collective admin to send
                  a new one.
                </p>
              </div>
              <Button
                onClick={() => router.push("/dashboard")}
                className="bg-nocturn hover:bg-nocturn-light"
              >
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {state === "ready" && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10 mb-2">
                <Users className="h-8 w-8 text-nocturn" />
              </div>
              <CardTitle>You&apos;re invited!</CardTitle>
              <CardDescription>
                You&apos;ve been invited to join{" "}
                <strong className="text-foreground">{collectiveName}</strong> as
                a <strong className="text-foreground">{inviteRole}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button
                onClick={handleAccept}
                className="w-full bg-nocturn hover:bg-nocturn-light"
              >
                Accept Invitation
              </Button>
              <Button
                variant="outline"
                onClick={() => router.push("/dashboard")}
                className="w-full"
              >
                Decline
              </Button>
            </CardContent>
          </Card>
        )}

        {state === "accepting" && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-nocturn" />
              <p className="text-sm text-muted-foreground">
                Accepting invitation...
              </p>
            </CardContent>
          </Card>
        )}

        {(state === "accepted" || state === "already-member") && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <CheckCircle className="h-12 w-12 text-emerald-500" />
              <div className="text-center">
                <h2 className="text-lg font-bold">
                  {state === "already-member"
                    ? "Already a member"
                    : "Welcome aboard!"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {state === "already-member"
                    ? `You're already a member of ${collectiveName}.`
                    : `You've joined ${collectiveName} as a ${inviteRole}.`}
                </p>
              </div>
              <Button
                onClick={() => router.push("/dashboard")}
                className="bg-nocturn hover:bg-nocturn-light"
              >
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {state === "error" && (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <XCircle className="h-12 w-12 text-red-500" />
              <div className="text-center">
                <h2 className="text-lg font-bold">Something went wrong</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {errorMessage}
                </p>
              </div>
              <Button
                onClick={() => setState("ready")}
                className="bg-nocturn hover:bg-nocturn-light"
              >
                Try again
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
