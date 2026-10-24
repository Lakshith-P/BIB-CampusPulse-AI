import { createFileRoute } from "@tanstack/react-router";
import { SkillsPage } from "@/components/portal/StudentPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/skills")({
  head: () => pageHead("Skills", "Skills in your SLQG workspace."),
  component: SkillsPage,
});
