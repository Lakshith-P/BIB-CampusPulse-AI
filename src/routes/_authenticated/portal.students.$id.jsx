import { createFileRoute } from "@tanstack/react-router";
import { StudentDetailPage } from "@/components/portal/StaffPages";
import { pageHead } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/portal/students/$id")({
  head: () => pageHead("Student", "A student's profile in your BIB InsightIQ workspace."),
  component: StudentDetail,
});

function StudentDetail() {
  const { id } = Route.useParams();
  return <StudentDetailPage id={id} />;
}
