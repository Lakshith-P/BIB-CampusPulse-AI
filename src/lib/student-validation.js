import { z } from "zod";
export const studentSchema = z.object({
  id: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(100),
  branch: z.string().trim().min(1).max(30),
  semester: z.number().int().min(1).max(8),
  gradYear: z.number().int().min(2020).max(2035),
  // Optional grouping details from the CSV import; older records simply have none.
  gender: z.string().trim().max(20).default(""),
  course: z.string().trim().max(60).default(""),
  section: z.string().trim().max(20).default(""),
  mentorId: z.string(),
  cgpa: z.number().min(0).max(10),
  semesterGrades: z.array(z.number().min(0).max(10)),
  backlogs: z.number().int().min(0),
  subjects: z.array(
    z
      .object({
        subject: z.string().min(1),
        marks: z.number().min(0).max(100),
        classesHeld: z.number().int().min(0),
        classesAttended: z.number().int().min(0),
      })
      .refine(
        (s) => s.classesAttended <= s.classesHeld,
        "Attended classes cannot exceed held classes",
      ),
  ),
  lms: z.array(
    z.object({
      subject: z.string(),
      units: z.array(
        z.object({
          unit: z.number(),
          title: z.string(),
          lessons: z.array(
            z.object({ title: z.string(), completed: z.boolean(), resource: z.string() }),
          ),
          assignment: z.object({
            title: z.string(),
            deadline: z.string(),
            submitted: z.boolean(),
            marks: z.number().nullable(),
          }),
        }),
      ),
    }),
  ),
  skills: z.object({
    coding: z.number().min(-1).max(100),
    aptitude: z.number().min(-1).max(100),
    analytical: z.number().min(-1).max(100),
    verbal: z.number().min(-1).max(100),
    communication: z.number().min(-1).max(100),
  }),
  engagement: z.array(
    z.object({
      type: z.enum(["event", "club", "hackathon", "certification"]),
      name: z.string(),
      date: z.string(),
      verified: z.boolean(),
      evidence: z.string().optional(),
    }),
  ),
  resumeCompleteness: z.number().min(-1).max(100),
  // Optional indicators; left out (undefined) means "not recorded", never zero.
  mockInterviews: z.number().int().min(0).optional(),
  hasEngagementData: z.boolean().optional(),
  lmsLoginsPerWeek: z.number().min(0).max(100).optional(),
  satisfaction: z.number().min(1).max(5).optional(),
  targetRoles: z.array(z.string()),
  assessmentsCompleted: z.number().int().min(0),
  assessmentsRequired: z.number().int().min(0),
  facultyFeedback: z.array(z.object({ from: z.string(), note: z.string(), date: z.string() })),
  studentFeedback: z.array(z.object({ about: z.string(), note: z.string(), date: z.string() })),
});
