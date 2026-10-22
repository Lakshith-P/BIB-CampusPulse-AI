import { useCallback, useMemo } from "react";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { buildRows, summarize } from "@/lib/campus-derive";
import { loadCampus } from "@/lib/campus.functions";
import { todayIso } from "@/lib/live-profile";

export const campusOptions = queryOptions({
  queryKey: ["private-campus"],
  queryFn: () => loadCampus(),
  // New sign-ups and edits made by others should appear without a manual reload.
  staleTime: 0,
  refetchInterval: 30_000,
});

/**
 * Everything the signed-in person is allowed to see, with the scores and summaries already
 * worked out. The server decides what is visible; this only shapes it for the pages.
 */
export function useCampus() {
  const { data } = useSuspenseQuery(campusOptions);
  const qc = useQueryClient();
  const today = todayIso();
  const roleNames = data.roles.map((r) => r.role);
  const isAdmin = roleNames.includes("admin");
  const isFaculty = roleNames.includes("faculty");
  const role = isAdmin ? "admin" : isFaculty ? "faculty" : "student";
  const rows = useMemo(() => buildRows(data.records, today), [data.records, today]);
  const summary = useMemo(
    () => summarize(rows, data.interventions, today),
    [rows, data.interventions, today],
  );
  const myRow = useMemo(
    () => rows.find((r) => r.ownerId === data.profile.id) ?? null,
    [rows, data.profile.id],
  );
  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: campusOptions.queryKey }),
    [qc],
  );
  return {
    profile: data.profile,
    role,
    isAdmin,
    isFaculty,
    rows,
    summary,
    myRow,
    interventions: data.interventions,
    today,
    refresh,
  };
}
