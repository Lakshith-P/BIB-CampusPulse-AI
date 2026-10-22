import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { campusOptions } from "@/lib/use-campus";
import {
  loadAllComplaints,
  loadAssessments,
  loadAiLessons,
  loadDrives,
  loadLearningProfile,
  loadLms,
  loadMockInterviews,
  loadMyInterviews,
  loadMyResume,
  loadTimetable,
  loadMyComplaints,
  loadMyRatings,
  loadMySubjectReviews,
  loadNotifications,
  loadOpportunities,
  loadSubjectReviewSummary,
  loadTimetableCoverage,
} from "@/lib/platform.functions";

// One place for the keys, so every save can refresh exactly what it changed.
export const KEYS = {
  notifications: ["notifications"],
  lms: ["lms"],
  learningProfile: ["learning-profile"],
  aiLessons: ["ai-lessons"],
  timetable: ["timetable"],
  resume: ["resume"],
  interviews: ["interviews"],
  drives: ["drives"],
  opportunities: ["opportunities"],
  complaints: ["complaints"],
  ratings: ["ratings"],
  subjectReviews: ["subject-reviews"],
  timetableCoverage: ["timetable-coverage"],
  assessments: ["assessments"],
  mocks: ["mock-interviews"],
};

export const useNotifications = () =>
  useQuery({
    queryKey: KEYS.notifications,
    queryFn: () => loadNotifications(),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
export const useLms = () => useQuery({ queryKey: KEYS.lms, queryFn: () => loadLms() });
export const useLearningProfile = () =>
  useQuery({ queryKey: KEYS.learningProfile, queryFn: () => loadLearningProfile() });
export const useAiLessons = () =>
  useQuery({ queryKey: KEYS.aiLessons, queryFn: () => loadAiLessons() });
export const useTimetable = () =>
  useQuery({ queryKey: KEYS.timetable, queryFn: () => loadTimetable() });
export const useResume = () => useQuery({ queryKey: KEYS.resume, queryFn: () => loadMyResume() });
export const useInterviews = () =>
  useQuery({ queryKey: KEYS.interviews, queryFn: () => loadMyInterviews() });
export const useDrives = () => useQuery({ queryKey: KEYS.drives, queryFn: () => loadDrives() });
export const useOpportunities = () =>
  useQuery({ queryKey: KEYS.opportunities, queryFn: () => loadOpportunities() });
export const useMyComplaints = () =>
  useQuery({ queryKey: [...KEYS.complaints, "mine"], queryFn: () => loadMyComplaints() });
export const useAllComplaints = (enabled = true) =>
  useQuery({ queryKey: [...KEYS.complaints, "all"], queryFn: () => loadAllComplaints(), enabled });
export const useMyRatings = (enabled = true) =>
  useQuery({ queryKey: KEYS.ratings, queryFn: () => loadMyRatings(), enabled });
export const useTimetableCoverage = (enabled = true) =>
  useQuery({
    queryKey: KEYS.timetableCoverage,
    queryFn: () => loadTimetableCoverage(),
    enabled,
  });
export const useMySubjectReviews = () =>
  useQuery({
    queryKey: [...KEYS.subjectReviews, "mine"],
    queryFn: () => loadMySubjectReviews(),
  });
export const useSubjectReviewSummary = (enabled = true) =>
  useQuery({
    queryKey: [...KEYS.subjectReviews, "summary"],
    queryFn: () => loadSubjectReviewSummary(),
    enabled,
  });
export const useAssessments = (studentId) =>
  useQuery({
    queryKey: [...KEYS.assessments, studentId ?? "me"],
    queryFn: () => loadAssessments({ data: studentId ? { studentId } : {} }),
  });
export const useMockInterviews = (studentId) =>
  useQuery({
    queryKey: [...KEYS.mocks, studentId ?? "me"],
    queryFn: () => loadMockInterviews({ data: studentId ? { studentId } : {} }),
  });

/** After a save, reload the campus data (scores change) and everything that may have moved. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: campusOptions.queryKey }),
      ...Object.values(KEYS).map((queryKey) => qc.invalidateQueries({ queryKey })),
    ]);
  }, [qc]);
}
