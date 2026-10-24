import { createFileRoute } from "@tanstack/react-router";
import { AiLessonsPage } from "@/components/portal/AiLessonPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/ai-lessons")({
  head: () =>
    pageHead(
      "Personalised AI Lessons",
      "Narrated lessons, quizzes and boss battles written for how you learn.",
    ),
  component: AiLessonsPage,
});
