import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicLayout } from "@/components/PublicLayout";
import { pageHead } from "@/lib/metadata";
import { GraduationCap, Users, Building2, ArrowUpRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
export const Route = createFileRoute("/benefits")({
  head: () =>
    pageHead(
      "For Your Campus",
      "Personal success plans for students, actionable cohort insights for faculty and campus intelligence for administrators.",
    ),
  component: Benefits,
});
function Benefits() {
  return (
    <PublicLayout>
      <main className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <p className="eyebrow">BUILT AROUND PEOPLE</p>
        <h1 className="page-heading mt-4">
          A connected campus.
          <br />
          Support that feels personal.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
          The same evidence, organized for the people who can make a difference.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: GraduationCap,
              role: "Student",
              name: "My Success",
              list: [
                "Understand your score and improvement priorities",
                "Plan attendance recovery with exact class counts",
                "Track lessons, assignments and placement gaps",
              ],
              workspace: "student",
            },
            {
              icon: Users,
              role: "Faculty / Mentor",
              name: "My Students",
              list: [
                "See assigned students and cohort comparisons",
                "Understand risk reasons, not just a label",
                "Create and follow up on mentor interventions",
              ],
              workspace: "faculty",
            },
            {
              icon: Building2,
              role: "Administrator",
              name: "Campus Intelligence",
              list: [
                "Compare departments and semester trends",
                "Monitor integrated-source coverage and data quality",
                "Oversee support and accountable record changes",
              ],
              workspace: "admin",
            },
          ].map((x) => (
            <article key={x.role} className="flex flex-col rounded-lg border bg-card p-7">
              <x.icon className="size-8 text-primary motion-icon" />
              <p className="mt-6 text-xs font-semibold uppercase text-muted-foreground">{x.role}</p>
              <h2 className="mt-2 text-2xl font-semibold">{x.name}</h2>
              <ul className="my-6 space-y-4">
                {x.list.map((l) => (
                  <li key={l} className="flex gap-3 text-sm">
                    <Check className="size-4 shrink-0 text-success" />
                    {l}
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" className="mt-auto">
                <Link to="/auth" search={{ workspace: x.workspace }}>
                  Log in as {x.role.split(" ")[0].toLowerCase()} <ArrowUpRight />
                </Link>
              </Button>
            </article>
          ))}
        </div>
        <section className="mt-16 border-t pt-12">
          <p className="eyebrow">EXPECTED IMPACT</p>
          <h2 className="mt-3 text-3xl font-semibold">Earlier signals. More timely support.</h2>
          <p className="mt-5 max-w-3xl text-muted-foreground">
            Our aim is to reduce fragmented reporting, make support priorities easier to understand,
            and create a visible follow-up process. These are intended benefits, not measured
            outcome claims. Success scores remain advisory and open to review.
          </p>
          <Button asChild className="mt-6">
            <Link to="/contact">
              Connect with TEAM BIB <ArrowUpRight />
            </Link>
          </Button>
        </section>
      </main>
    </PublicLayout>
  );
}
