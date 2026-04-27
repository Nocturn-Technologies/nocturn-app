import * as React from "react";
import Layout from "./_layout";

export interface InvitationProps {
  inviterName: string;
  collectiveName: string;
  role: string;
  inviteLink: string;
}

export default function Invitation({
  inviterName,
  collectiveName,
  role,
  inviteLink,
}: InvitationProps) {
  return (
    <Layout
      preheader={`Join ${collectiveName} on Nocturn as a ${role}. Invite expires in 7 days.`}
      eyebrow="Invitation"
      headline={`Join ${collectiveName}.`}
      collectiveName={collectiveName}
      intro={
        <>
          <b style={{ color: "#FAFAFA" }}>{inviterName}</b> added you as a{" "}
          <b style={{ color: "#FAFAFA" }}>{role}</b>. Accept to start running
          nights together.
        </>
      }
      details={[
        { label: "Collective", value: collectiveName },
        { label: "Your role", value: role },
        { label: "Expires in", value: "7 days" },
      ]}
      cta={{ label: "Accept invitation  →", href: inviteLink }}
    />
  );
}
