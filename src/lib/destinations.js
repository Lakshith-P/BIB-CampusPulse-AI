// Where a person can land after signing in, and the features the search bar can jump to.
// These only choose a page to open; the server still decides what each person may see.

export const LANDING = {
  student: [
    { to: "/portal", label: "Overview (default)" },
    { to: "/portal/results", label: "Academic results" },
    { to: "/portal/placement", label: "Placement" },
    { to: "/portal/attendance", label: "Attendance" },
    { to: "/portal/chat", label: "Chats" },
    { to: "/portal/learning", label: "Learning path" },
    { to: "/portal/updates", label: "Announcements" },
  ],
  faculty: [
    { to: "/portal", label: "Overview (default)" },
    { to: "/portal/students", label: "My students" },
    { to: "/portal/results", label: "Class results" },
    { to: "/portal/placement", label: "Placement overview" },
    { to: "/portal/interventions", label: "Interventions" },
    { to: "/portal/updates", label: "Announcements" },
    { to: "/portal/chat", label: "Chats" },
  ],
  admin: [
    { to: "/portal", label: "Overview (default)" },
    { to: "/portal/students", label: "All students" },
    { to: "/portal/results", label: "Campus results" },
    { to: "/portal/placement", label: "Placement overview" },
    { to: "/portal/assign", label: "Assign students" },
    { to: "/portal/updates", label: "Announcements" },
    { to: "/portal/chat", label: "Chats" },
  ],
};

export const landingFor = (workspace, value) =>
  (LANDING[workspace] ?? LANDING.student).some((o) => o.to === value) ? value : "/portal";

// Everything the search panel lists, grouped like a menu. Each entry is [label, page, extra
// words people might type]. Every page of a workspace appears in at least one group.
export const SEARCH_GROUPS = {
  student: [
    [
      "Dashboard",
      [
        ["Dashboard", "/portal", "overview home score band alerts"],
        ["Notifications", "/portal/notifications", "alerts unread bell reminders"],
        [
          "Announcements",
          "/portal/updates",
          "announcement notice event poster news happening campus update",
        ],
        ["Section and private chats", "/portal/chat", "group messages chat teacher student"],
        ["Notices and posters", "/portal/updates", "board circular"],
      ],
    ],
    [
      "Examination System",
      [
        ["Academic Result", "/portal/results", "cgpa sgpa marks grades transcript semester"],
        ["Marks by subject", "/portal/results", "subject marks grade pass"],
        ["Backlogs and re-exam", "/portal/results", "arrear clear supplementary failed"],
        ["Print or save result as PDF", "/portal/results", "download printout"],
        ["Learning path", "/portal/learning", "courses subjects syllabus plan semester"],
      ],
    ],
    [
      "Attendance",
      [
        ["Attendance", "/portal/attendance", "percentage classes held attended"],
        ["Classes needed to reach 75%", "/portal/attendance", "shortage planner target"],
      ],
    ],
    [
      "LMS and Assignments",
      [
        ["LMS lessons and units", "/portal/lms", "learning management lessons"],
        [
          "Personalised AI lessons",
          "/portal/ai-lessons",
          "ai video lesson quiz boss battle learning style generate topic",
        ],
        ["Assignment deadlines", "/portal/lms", "submit due homework pending"],
      ],
    ],
    [
      "Skills and Assessments",
      [
        ["Skills profile", "/portal/skills", "coding aptitude analytical verbal communication"],
        ["Assessment scores", "/portal/skills", "test result practice"],
      ],
    ],
    [
      "Placement",
      [
        ["Placement Portal", "/portal/placement", "jobs company recruit drive interview offer"],
        ["Current placement drives", "/portal/placement", "openings companies visiting campus"],
        ["Placement readiness", "/portal/placement", "aptitude coding resume assessments"],
        ["Resume and target roles", "/portal/profile", "cv career roles linkedin github"],
      ],
    ],
    [
      "Engagement",
      [
        ["Clubs, events and hackathons", "/portal/engagement", "activity participation"],
        ["Certifications", "/portal/engagement", "certificate course verified"],
      ],
    ],
    [
      "Feedback and Support",
      [
        ["Feedback to my mentor", "/portal/feedback", "message teacher concern note"],
        ["Confidential complaint", "/portal/feedback", "grievance report private"],
        ["Rate my satisfaction", "/portal/feedback", "survey rating review"],
        ["Messages from teachers", "/portal/feedback", "inbox mentor"],
        ["Contact support", "/contact", "help query message"],
      ],
    ],
    [
      "Profile and Security",
      [
        ["My profile", "/portal/profile", "personal details phone address bio"],
        ["Change password", "/reset-password", "security account"],
      ],
    ],
  ],
  faculty: [
    [
      "Dashboard",
      [
        ["Dashboard", "/portal", "overview home students at a glance"],
        ["Notifications", "/portal/notifications", "alerts unread bell reminders"],
        ["Announcements", "/portal/updates", "announcement notice event poster news campus update"],
        ["Post an announcement", "/portal/updates", "announce publish notice poster drive update"],
        ["Section and private chats", "/portal/chat", "group messages chat teacher student"],
      ],
    ],
    [
      "Students",
      [
        ["My students", "/portal/students", "list assigned class mentees"],
        ["Students who need help", "/portal/students", "risk attention high priority at risk"],
        ["Compare students", "/portal/students", "comparison side by side"],
      ],
    ],
    [
      "Examination System",
      [
        ["Class results", "/portal/results", "cgpa marks grades toppers"],
        ["Top performers", "/portal/results", "highest cgpa rank"],
        ["Students with backlogs", "/portal/results", "arrear failed low cgpa"],
      ],
    ],
    [
      "Placement",
      [
        ["Placement overview", "/portal/placement", "readiness aptitude coding resume drives"],
        ["Students to watch for placement", "/portal/placement", "placement risk"],
        ["Post a placement drive", "/portal/placement", "company opening recruit"],
      ],
    ],
    [
      "Support",
      [
        ["Support actions", "/portal/interventions", "intervention mentoring plan"],
        ["Follow-ups", "/portal/interventions", "due overdue next"],
        ["Attendance and risk monitor", "/portal/monitor", "attendance shortage low risk"],
      ],
    ],
    [
      "Profile and Security",
      [
        ["My profile", "/portal/profile", "personal details phone address"],
        ["Change password", "/reset-password", "security account"],
      ],
    ],
  ],
  admin: [
    [
      "Dashboard",
      [
        ["Dashboard", "/portal", "overview home campus analytics"],
        ["Notifications", "/portal/notifications", "alerts unread bell reminders"],
        ["Announcements", "/portal/updates", "announcement notice event poster news campus update"],
        ["Post an announcement", "/portal/updates", "announce publish notice poster drive update"],
        ["Section and private chats", "/portal/chat", "group messages chat teacher student"],
      ],
    ],
    [
      "People",
      [
        ["All students", "/portal/students", "list every student campus"],
        ["Teachers", "/portal/teachers", "faculty workload mentors"],
        ["Assign students to teachers", "/portal/assign", "link mentor connect"],
        ["People and roles", "/portal/people", "give teacher admin access permissions accounts"],
        ["Reset a password", "/portal/people", "forgot temporary login"],
      ],
    ],
    [
      "Records",
      [
        ["Student records", "/portal/records", "add marks attendance skills edit"],
        ["Import students from CSV", "/portal/records", "upload bulk spreadsheet"],
        ["Support actions", "/portal/interventions", "intervention follow-up"],
        ["Attendance and risk monitor", "/portal/monitor", "attendance shortage low risk"],
      ],
    ],
    [
      "Examination System",
      [
        ["Campus results", "/portal/results", "cgpa marks grades toppers backlogs"],
        ["CGPA distribution", "/portal/results", "chart range"],
      ],
    ],
    [
      "Placement",
      [
        ["Placement overview", "/portal/placement", "readiness aptitude coding resume drives"],
        ["Post a placement drive", "/portal/placement", "company opening recruit"],
      ],
    ],
    [
      "Administrative",
      [
        ["Messages and concerns", "/portal/messages", "contact inbox"],
        ["Confidential complaints", "/portal/complaints", "complaint grievance harassment review"],
        ["Audit log", "/portal/audit", "history changes who"],
      ],
    ],
    [
      "Profile and Security",
      [
        ["My profile", "/portal/profile", "personal details"],
        ["Change password", "/reset-password", "security account"],
      ],
    ],
  ],
};

// The narrow icon rail on the left of the workspace, and the drop-down menus in the header.
export const RAIL = {
  student: [
    ["/portal", "Dashboard", "dashboard"],
    ["/portal/results", "Academic", "academic"],
    ["/portal/profile", "Profile", "profile"],
    ["/portal/attendance", "Attendance", "attendance"],
    ["/portal/chat", "Chats", "chat"],
    ["/portal/lms", "LMS", "lms"],
    ["/portal/engagement", "Engagement", "engagement"],
    ["/portal/placement", "Placement", "placement"],
    ["/portal/skills", "Skills", "skills"],
    ["/portal/feedback", "Feedback", "feedback"],
  ],
  faculty: [
    ["/portal", "Dashboard", "dashboard"],
    ["/portal/students", "Students", "students"],
    ["/portal/profile", "Profile", "profile"],
    ["/portal/results", "Academic", "academic"],
    ["/portal/copilot", "Copilot", "copilot"],
    ["/portal/attendance", "Attendance", "attendance"],
    ["/portal/chat", "Chats", "chat"],
    ["/portal/lms", "LMS", "lms"],
    ["/portal/engagement", "Engagement", "engagement"],
    ["/portal/placement", "Placement", "placement"],
    ["/portal/skills", "Skills", "skills"],
    ["/portal/feedback", "Feedback", "feedback"],
    ["/portal/interventions", "Support", "support"],
  ],
  admin: [
    ["/portal", "Dashboard", "dashboard"],
    ["/portal/students", "Students", "students"],
    ["/portal/profile", "Profile", "profile"],
    ["/portal/results", "Academic", "academic"],
    ["/portal/copilot", "Copilot", "copilot"],
    ["/portal/attendance", "Attendance", "attendance"],
    ["/portal/chat", "Chats", "chat"],
    ["/portal/lms", "LMS", "lms"],
    ["/portal/engagement", "Engagement", "engagement"],
    ["/portal/placement", "Placement", "placement"],
    ["/portal/skills", "Skills", "skills"],
    ["/portal/feedback", "Feedback", "feedback"],
    ["/portal/people", "People", "people"],
  ],
};

export const MENUS = {
  student: [
    {
      label: "Academics",
      items: [
        ["/portal/results", "Academic results"],
        ["/portal/learning", "Learning path"],
        ["/portal/attendance", "Attendance"],
        ["/portal/chat", "Section and private chats"],
        ["/portal/lms", "LMS and assignments"],
        ["/portal/skills", "Skills assessments"],
      ],
    },
    {
      label: "Placement",
      items: [
        ["/portal/placement", "Drives and readiness"],
        ["/portal/updates", "Announcements"],
        ["/portal/profile", "Resume and target roles"],
      ],
    },
    {
      label: "Student Services",
      items: [
        ["/portal/feedback", "Feedback to my mentor"],
        ["/portal/engagement", "Clubs and certificates"],
        ["/reset-password", "Change password"],
        ["/contact", "Contact support"],
      ],
    },
    {
      label: "Quick Links",
      items: [
        ["/portal", "Dashboard"],
        ["/portal/profile", "My profile"],
        ["/portal/updates", "Notices and posters"],
      ],
    },
  ],
  faculty: [
    {
      label: "Academics",
      items: [
        ["/portal/students", "My students"],
        ["/portal/results", "Class results"],
        ["/portal/copilot", "Analytics Copilot"],
        ["/portal/monitor", "Attendance and risk"],
        ["/portal/chat", "Section and private chats"],
      ],
    },
    {
      label: "Support",
      items: [["/portal/interventions", "Support actions"]],
    },
    {
      label: "Placement",
      items: [
        ["/portal/placement", "Placement overview"],
        ["/portal/updates", "Post an announcement"],
      ],
    },
    {
      label: "Quick Links",
      items: [
        ["/portal", "Dashboard"],
        ["/portal/profile", "My profile"],
        ["/reset-password", "Change password"],
      ],
    },
  ],
  admin: [
    {
      label: "People",
      items: [
        ["/portal/students", "All students"],
        ["/portal/teachers", "Teachers"],
        ["/portal/assign", "Assign students"],
        ["/portal/people", "People and roles"],
      ],
    },
    {
      label: "Records",
      items: [
        ["/portal/records", "Student records and CSV import"],
        ["/portal/interventions", "Support actions"],
        ["/portal/monitor", "Attendance and risk"],
      ],
    },
    {
      label: "Insights",
      items: [
        ["/portal/copilot", "Analytics Copilot"],
        ["/portal/results", "Campus results"],
        ["/portal/placement", "Placement overview"],
      ],
    },
    {
      label: "Administrative",
      items: [
        ["/portal/messages", "Messages"],
        ["/portal/audit", "Audit log"],
        ["/portal/updates", "Announcements"],
        ["/portal/chat", "Section and private chats"],
      ],
    },
  ],
};
