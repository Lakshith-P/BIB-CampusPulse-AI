import { createFileRoute } from "@tanstack/react-router";
import { PublicLayout } from "@/components/PublicLayout";
import { pageHead } from "@/lib/metadata";
import { ShieldCheck, LockKeyhole, UserCheck, FileSearch } from "lucide-react";
export const Route = createFileRoute("/privacy")({
  head: () =>
    pageHead(
      "Trust & Privacy",
      "How BIB InsightIQ protects private records, supports responsible human review.",
    ),
  component: Privacy,
});
function Privacy() {
  return (
    <PublicLayout>
      <main className="mx-auto max-w-5xl px-5 py-16">
        <p className="eyebrow">TRUST IS PART OF THE SYSTEM</p>
        <h1 className="page-heading mt-4">Support, not surveillance.</h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          A student is more than a score. We keep evidence visible, access limited, and decisions in
          human hands.
        </p>
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {[
            {
              icon: LockKeyhole,
              t: "Private accounts, limited access",
              d: "The account portal reads records through enforced access policies. Students see their own linked records, faculty see assigned records, and administrators require separately granted authority. Choosing a role at login does not grant access.",
            },
            {
              icon: ShieldCheck,
              t: "Your data stays yours",
              d: "Records live in the campus database and are only returned to the people allowed to see them. Passwords are hashed, sessions are signed, and every permission is re-checked on the server for every request. No live LPU, LMS or university integration is claimed.",
            },
            {
              icon: UserCheck,
              t: "Human review, always",
              d: "Scores and risk flags help prioritize support, not assign guilt or predict a future. Unverified engagement does not earn points. Complaints require confidential, authorized review; an allegation is not proof.",
            },
            {
              icon: FileSearch,
              t: "Explainable and correctable",
              d: "Missing sources are disclosed. Score components, weights and evidence remain visible. Private record changes are timestamped in an administrative audit trail. Context, barriers and unequal opportunities must be considered.",
            },
          ].map((x) => (
            <section key={x.t} className="border-t pt-6">
              <x.icon className="size-6 text-primary" />
              <h2 className="mt-4 text-xl font-semibold">{x.t}</h2>
              <p className="mt-3 text-muted-foreground">{x.d}</p>
            </section>
          ))}
        </div>
        <p className="mt-12 border-t pt-6 text-sm text-muted-foreground">
          The website assistant answers general product questions. Do not enter confidential
          complaints, passwords, resumes or private student information in chat.
        </p>
      </main>
    </PublicLayout>
  );
}
