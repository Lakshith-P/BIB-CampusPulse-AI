// The sample accounts and screens shown in the animated sign-in demo on the login page. Everything
// here is fictional presentation data: no credentials are collected and no request is made.

export const ROLE_KEYS = ["student", "faculty", "admin"];

export const ROLE_DURATION = 19000; // ms for one role: sign-in, then three portal pages

// Where each stage of a role's walkthrough starts, in ms.
export const STAGE_STARTS = [0, 2200, 3600, 4500, 5300, 8800, 12200, 15600];

export const stageAt = (time) => {
  for (let i = STAGE_STARTS.length - 1; i >= 0; i--) if (time >= STAGE_STARTS[i]) return i;
  return 0;
};

// Stage 4 is the dashboard; stages 5-7 are the role's three pages.
export const PAGE_STARTS = [5300, 8800, 12200, 15600];

export const SCENES = [
  {
    color: "#123c7a",
    light: "#5b9bff",
    greeting: "Hello, Aarav",
    subtitle: "A little clarity. A confident next step.",
    metricLabel: "Student success score",
    metric: "72",
    unit: "/ 100",
    listTitle: "Your connected picture",
    rows: [
      ["Academics", "A strong foundation", "82"],
      ["Attendance", "A gap worth discussing", "68%"],
      ["Placement readiness", "Your next opportunity", "60"],
    ],
    tip: "Your score is a starting point for support.",
  },
  {
    color: "#217567",
    light: "#4fd1b6",
    greeting: "Hello, Dr. Sharma",
    subtitle: "The right context for a thoughtful check-in.",
    metricLabel: "Assigned students · sample",
    metric: "24",
    unit: "students",
    listTitle: "Conversations to prioritise",
    rows: [
      ["Aarav", "Attendance below 75%", "68%"],
      ["Meera", "Placement readiness gap", "48"],
      ["Riya", "Progress check-in", "86"],
    ],
    tip: "Keep each intervention visible through follow-up.",
  },
  {
    color: "#5b57a0",
    light: "#a6a2ff",
    greeting: "Hello, Campus admin",
    subtitle: "A shared view. A more informed conversation.",
    metricLabel: "Connected data domains",
    metric: "07",
    unit: "domains",
    listTitle: "Campus management",
    rows: [
      ["Campus analytics", "Explore cohorts and filters", "↗"],
      ["CSV imports", "Review data quality", "↗"],
      ["Roles & assignments", "Manage access with purpose", "↗"],
    ],
    tip: "Review completeness before drawing conclusions.",
  },
];

export const TOUR_ROLES = [
  {
    name: "Student",
    account: "student@example.edu",
    nav: ["Overview", "Attendance", "Learning", "Placement"],
    pages: [
      {
        title: "Attendance planner",
        eyebrow: "LEARNING CONSISTENCY",
        metric: "68%",
        unit: "current attendance",
        note: "Below the sample 75% threshold",
        rows: [
          ["Computer Networks", "17 / 25 classes", "68%"],
          ["Operating Systems", "21 / 25 classes", "84%"],
          ["Cloud Computing", "20 / 25 classes", "80%"],
        ],
        callout: "Next step: discuss the gap with your mentor.",
      },
      {
        title: "My learning",
        eyebrow: "LMS & ASSIGNMENTS",
        metric: "75%",
        unit: "learning progress",
        note: "Example semester overview",
        rows: [
          ["Cloud fundamentals", "8 of 10 units complete", "80%"],
          ["Linux foundations", "6 of 8 units complete", "75%"],
          ["Networking quiz", "Due this week", "Open"],
        ],
        callout: "Open a unit, review your work and plan the next task.",
      },
      {
        title: "Placement readiness",
        eyebrow: "YOUR NEXT OPPORTUNITY",
        metric: "60",
        unit: "/ 100 readiness",
        note: "A sample readiness checklist",
        rows: [
          ["Resume review", "Update your latest project", "To do"],
          ["Aptitude practice", "Continue your practice plan", "66"],
          ["Drive eligibility", "Review the checklist", "View"],
        ],
        callout: "Readiness helps guide preparation, not guarantee selection.",
      },
    ],
  },
  {
    name: "Teacher",
    account: "teacher@example.edu",
    nav: ["Overview", "Students", "Profile", "Follow-up"],
    pages: [
      {
        title: "Assigned students",
        eyebrow: "YOUR MENTOR GROUP",
        metric: "24",
        unit: "assigned students",
        note: "Example list filtered by support need",
        rows: [
          ["Aarav · Year 3", "Attendance below 75%", "68%"],
          ["Meera · Year 3", "Placement readiness gap", "48"],
          ["Riya · Year 3", "Steady progress", "86"],
        ],
        callout: "Open a student to understand the reason behind a signal.",
      },
      {
        title: "Aarav’s profile",
        eyebrow: "CONTEXT BEFORE ACTION",
        metric: "72",
        unit: "/ 100 success score",
        note: "Monitor · sample student record",
        rows: [
          ["Academics", "A strong foundation", "82"],
          ["Attendance", "68% observed · 75% threshold", "Flag"],
          ["Placement", "Readiness score", "60"],
        ],
        callout: "Talk with the student before deciding on support.",
      },
      {
        title: "Support follow-up",
        eyebrow: "FROM SIGNAL TO SUPPORT",
        metric: "01",
        unit: "example support plan",
        note: "An illustrative intervention record",
        rows: [
          ["Owner", "Assigned faculty mentor", "Set"],
          ["Next step", "Discuss attendance recovery", "Plan"],
          ["Follow-up", "Within one week", "Due"],
        ],
        callout: "Record the conversation and review progress together.",
      },
    ],
  },
  {
    name: "Administrator",
    account: "admin@example.edu",
    nav: ["Overview", "Analytics", "Imports", "Access"],
    pages: [
      {
        title: "Campus analytics",
        eyebrow: "A CONNECTED CAMPUS VIEW",
        metric: "07",
        unit: "connected domains",
        note: "Sample cohort view · CSE / Year 3",
        rows: [
          ["Academics", "Subject and cohort overview", "View"],
          ["Attendance", "Review patterns and gaps", "View"],
          ["Placement", "Readiness across the cohort", "View"],
        ],
        callout: "Apply cohort filters before interpreting the bigger picture.",
      },
      {
        title: "Data import review",
        eyebrow: "QUALITY BEFORE INSIGHT",
        metric: "CSV",
        unit: "import workflow",
        note: "Sample preview only · no file uploaded",
        rows: [
          ["Student identity", "Check matching student IDs", "Step 1"],
          ["Field validation", "Review required columns", "Step 2"],
          ["Data-quality alerts", "Resolve missing values", "Step 3"],
        ],
        callout: "Review validation results before confirming a real import.",
      },
      {
        title: "Roles & access",
        eyebrow: "PERMISSIONS WITH PURPOSE",
        metric: "03",
        unit: "workspace roles",
        note: "Example access overview",
        rows: [
          ["Student", "Own learning records", "Scoped"],
          ["Teacher", "Assigned students", "Scoped"],
          ["Administrator", "Separately granted access", "Scoped"],
        ],
        callout: "Choosing a role never grants access. Permissions are checked.",
      },
    ],
  },
];

export const CAPTIONS = (role) => [
  "Typing sample email",
  "Typing masked password",
  "Signing in to the demo",
  "Opening the dashboard",
  "Exploring the dashboard",
  `Opening ${role.nav[1]}`,
  `Opening ${role.nav[2]}`,
  `Opening ${role.nav[3]}`,
];

/** The copy beside the phone, which follows what the phone is showing. */
export function sceneCopy(role, scene, stage, roleIndex) {
  const signIn = stage < 4;
  const page = stage >= 5 ? role.pages[stage - 5] : null;
  return {
    kicker: `0${roleIndex + 1} / ${role.name.toUpperCase()} · ${signIn ? "SIGN-IN WALKTHROUGH" : "INSIDE THE PORTAL"}`,
    title: signIn
      ? `Sign in as a ${role.name.toLowerCase()}.`
      : page
        ? `${page.title}.`
        : `${role.name} dashboard.`,
    description: signIn
      ? "Watch a sample account and masked password being entered, then follow the transition into the assigned workspace."
      : page
        ? page.callout
        : `After sign-in, ${role.name.toLowerCase()} users arrive at their own overview.`,
    points: signIn
      ? [
          ["Enter your account", "A fictional email and password are typed on screen."],
          ["Sign in securely", "This animation simulates the account check."],
          ["Go to your dashboard", "The assigned role determines which workspace opens."],
        ]
      : [
          [
            `Your ${role.nav[0].toLowerCase()}`,
            "Start with the information relevant to your role.",
          ],
          [
            `${role.nav[1]} & ${role.nav[2]}`,
            "Follow the highlighted navigation inside the phone.",
          ],
          [role.nav[3], "See the next step available in your own workspace."],
        ],
  };
}
