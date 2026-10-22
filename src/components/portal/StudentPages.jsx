import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/widgets";
import { PageTitle, RoleGate } from "@/components/portal/PortalShell";
import { AnnouncementsFeed } from "@/components/portal/Announcements";
import { SectionTitle } from "@/components/widgets";
import { PlacementOverview } from "@/components/portal/PlacementOverview";
import { LearningPath } from "@/components/portal/LearningPath";
import {
  LiveEngagement,
  LivePlacement,
  LiveSkills,
  StudentHeader,
} from "@/components/student-profile/LiveStudentProfile";
import { Attendance } from "@/components/student-profile/shared";
import { StaffCategory } from "@/components/portal/CategoryView";
import {
  MarkAttendance,
  MyAttendanceLog,
  Timetable,
  TimetableCoverage,
} from "@/components/portal/AttendanceTools";
import { StaffDrives, StudentDrives } from "@/components/portal/PlacementPages";
import { Opportunities } from "@/components/portal/EngagementPages";
import { StudentFeedbackCentre, SubjectReviewSummary } from "@/components/portal/FeedbackPages";
import { SkillProgress, StaffSkills } from "@/components/portal/SkillsPages";
import { useCampus } from "@/lib/use-campus";

/** Frame for the student-only pages: handles "no record linked yet" in one place. */
function StudentFrame({ title, sub, header = false, children }) {
  const { myRow } = useCampus();
  return (
    <RoleGate allow={["student"]}>
      <PageTitle title={title} sub={sub} />
      {!myRow ? (
        <div>
          <EmptyState
            title="No student record is linked to your account yet"
            hint="An administrator links your record and assigns your teacher. This page fills in once that is done."
          />
          <Button asChild variant="outline" className="mt-4">
            <Link to="/portal/profile">Complete my profile meanwhile</Link>
          </Button>
        </div>
      ) : (
        <>
          {header && <StudentHeader s={myRow.s} isOwner />}
          <div className={header ? "mt-4" : ""}>{children(myRow.s)}</div>
        </>
      )}
    </RoleGate>
  );
}

/** Teacher and administrator pages with two views side by side. */
function StaffTabs({ title, sub, tabs }) {
  const [tab, setTab] = useState(tabs[0][0]);
  return (
    <RoleGate allow={["faculty", "admin"]}>
      <PageTitle title={title} sub={sub} />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label={title}>
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            size="sm"
            variant={tab === key ? "default" : "outline"}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      {tabs.find(([key]) => key === tab)[2]}
    </RoleGate>
  );
}

export function LearningPage() {
  return (
    <StudentFrame title="Learning path" sub="Your courses this semester and what to do next">
      {(s) => <LearningPath s={s} />}
    </StudentFrame>
  );
}

export function AttendancePage() {
  const { role } = useCampus();
  if (role !== "student")
    return (
      <StaffTabs
        title="Attendance"
        sub="Mark classes, set the timetable and watch attendance shortages"
        tabs={[
          ["mark", "Mark attendance", <MarkAttendance key="a" />],
          [
            "timetable",
            "Timetable",
            <div key="b" className="space-y-8">
              <Timetable canEdit />
              <TimetableCoverage />
            </div>,
          ],
          ["overview", "Overview", <StaffCategory key="c" category="attendance" embedded />],
        ]}
      />
    );
  return (
    <StudentFrame title="Attendance" sub="Where you stand and how many classes you need">
      {(s) => (
        <div className="space-y-8">
          <Attendance s={s} />
          <MyAttendanceLog subjects={s.subjects.map((x) => x.subject)} />
          <Timetable canEdit={false} />
        </div>
      )}
    </StudentFrame>
  );
}

export { LmsPage } from "@/components/portal/LmsPages";

export function SkillsPage() {
  const { role } = useCampus();
  if (role !== "student")
    return (
      <StaffTabs
        title="Skills"
        sub="Record assessments and see each student's progress"
        tabs={[
          ["record", "Assessments and progress", <StaffSkills key="a" />],
          ["overview", "Class overview", <StaffCategory key="b" category="skills" embedded />],
        ]}
      />
    );
  return (
    <StudentFrame title="Skills" sub="Your assessment scores, history and what to practise next">
      {(s) => (
        <div className="space-y-6">
          <LiveSkills s={s} />
          <SkillProgress />
        </div>
      )}
    </StudentFrame>
  );
}

export function PlacementPage() {
  const { role } = useCampus();
  if (role !== "student")
    return (
      <>
        <PlacementOverview />
        <div className="mt-8">
          <StaffDrives />
        </div>
      </>
    );
  return (
    <StudentFrame title="Placement" sub="Readiness and the roles you are aiming for">
      {(s) => (
        <>
          <section className="mb-8">
            <SectionTitle sub="Companies visiting campus and openings posted by your placement cell">
              Current placements
            </SectionTitle>
            <AnnouncementsFeed
              categories={["placement"]}
              empty="No placement drives have been posted yet. Check back soon."
            />
          </section>
          <SectionTitle sub="Where you stand against what employers ask for">
            Your readiness
          </SectionTitle>
          <LivePlacement s={s} isOwner />
          <div className="mt-8">
            <StudentDrives s={s} />
          </div>
        </>
      )}
    </StudentFrame>
  );
}

export function EngagementPage() {
  const { role } = useCampus();
  if (role !== "student")
    return (
      <StaffTabs
        title="Engagement"
        sub="Post opportunities and verify what students complete"
        tabs={[
          ["opportunities", "Opportunities and verification", <Opportunities key="a" staff />],
          ["overview", "Class overview", <StaffCategory key="b" category="engagement" embedded />],
        ]}
      />
    );
  return (
    <StudentFrame title="Engagement" sub="Clubs, events, hackathons and certifications">
      {(s) => (
        <>
          <LiveEngagement s={s} />
          <Opportunities />
        </>
      )}
    </StudentFrame>
  );
}

export function FeedbackPage() {
  const { role } = useCampus();
  if (role !== "student")
    return (
      <>
        <StaffCategory category="feedback" />
        <SubjectReviewSummary />
      </>
    );
  return (
    <StudentFrame
      title="Feedback centre"
      sub="Rate your experience, read teacher feedback, or raise a confidential complaint"
    >
      {(s) => <StudentFeedbackCentre s={s} />}
    </StudentFrame>
  );
}
