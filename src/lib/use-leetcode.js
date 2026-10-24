import { useQuery } from "@tanstack/react-query";
import { loadLeetcodeProfile } from "@/lib/leetcode.functions";

/** A student's LeetCode profile (own or visible to the caller), null when not linked yet. */
export function useLeetcodeProfile(studentId) {
  return useQuery({
    queryKey: ["leetcode", studentId],
    queryFn: () => loadLeetcodeProfile({ data: { studentId } }),
    enabled: !!studentId,
    staleTime: 60_000,
  });
}
