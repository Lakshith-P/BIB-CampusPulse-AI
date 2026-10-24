// What the chat window shows for each kind of visitor. Nothing here is a prompt: the instructions
// the model receives stay on the server (src/lib/assistant-prompts.js).

export const ROLE_COPY = {
  student: {
    title: "Pluto · Your study assistant",
    tagline: "Answers from your own record",
    heading: "Ask about your own progress",
    intro:
      "I can look up your marks, attendance, risk, predictions, placement readiness and assignments.",
    placeholder: "Ask about your marks, attendance or placements…",
    footer: "Uses only your own records · AI guidance",
  },
  faculty: {
    title: "Pluto · Teacher assistant",
    tagline: "Answers from your students' records",
    heading: "Ask about your students",
    intro:
      "I can look up who needs attention, attendance, results, predicted risk and follow-ups for the students assigned to you.",
    placeholder: "Ask about your students or class…",
    footer: "Uses only students assigned to you · AI guidance",
  },
  admin: {
    title: "Pluto · Campus assistant",
    tagline: "Answers from campus-wide records",
    heading: "Ask about the whole campus",
    intro: "I can compare departments, rank risk, check teacher workload and look up any student.",
    placeholder: "Ask about departments, risk or teachers…",
    footer: "Campus-wide records · AI guidance",
  },
  visitor: {
    title: "Pluto · Campus guide",
    tagline: "A clearer next step",
    heading: "Hello! Where would you like to begin?",
    intro: "Ask me about SLQG. Sign in to ask about your own records.",
    placeholder: "Ask your campus guide…",
    footer: "AI guidance · This visit only · No confidential information",
  },
};

export const STARTERS = {
  student: [
    "How am I doing overall?",
    "Which subject needs my attention first?",
    "How many classes must I attend to reach 75%?",
    "What is my predicted placement score and what would improve it?",
  ],
  faculty: [
    "Which of my students need attention first?",
    "Who has attendance below 75%?",
    "Which students have a good CGPA but weak placement readiness?",
    "What are my overdue follow-ups?",
  ],
  admin: [
    "Which department has the most at-risk students?",
    "Compare departments by attendance and Success Score.",
    "Which teachers have the heaviest at-risk load?",
    "Who are the highest predicted-risk students on campus?",
  ],
  visitor: [
    "What is the Success Score?",
    "What does each workspace offer?",
    "How does SLQG protect privacy?",
  ],
};

/** What a lookup is shown as in the chat, so people can see where an answer came from. */
export const LOOKUP_LABELS = {
  my_overview: "your overview",
  my_subjects: "your subjects",
  my_attention: "your alerts and deadlines",
  my_predictions: "your predictions",
  my_placement: "your placement data",
  my_support: "your support actions",
  class_overview: "class overview",
  find_students: "student list",
  student_detail: "student record",
  predicted_risk: "predicted risk",
  support_actions: "support actions",
  department_comparison: "department comparison",
  teacher_workload: "teacher workload",
};

export function roleOf(user) {
  const roles = user?.roles ?? [];
  if (!user) return "visitor";
  return roles.includes("admin") ? "admin" : roles.includes("faculty") ? "faculty" : "student";
}
