import { createFileRoute } from "@tanstack/react-router";
import { AiInterviewPage } from "@/components/portal/InterviewPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/interview")({
  head: () =>
    pageHead(
      "AI Interview",
      "Practice interviews on camera with spoken questions, instant feedback and a downloadable report.",
    ),
  component: AiInterviewPage,
});
