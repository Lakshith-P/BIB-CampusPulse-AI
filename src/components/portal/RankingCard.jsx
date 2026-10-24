import { useQuery } from "@tanstack/react-query";
import { Building2, GraduationCap, Landmark, Medal } from "lucide-react";
import { loadMyRanking } from "@/lib/student-coach.functions";

const ICON = { class: GraduationCap, branch: Building2, university: Landmark };
const TITLE = {
  class: "Class ranking",
  branch: "Branch ranking",
  university: "University ranking",
};
const card = "rounded-xl border border-[#D9E1EC] bg-white shadow-xs";

const ordinal = (n) => {
  const v = n % 100;
  const s = ["th", "st", "nd", "rd"];
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** "12 of 164 students" with the share at or above the student. */
function Tile({ group }) {
  const Icon = ICON[group.key];
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-[#D9E1EC] bg-[#f8fafc] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="size-4 text-[#0066CC]" aria-hidden /> {TITLE[group.key]}
      </div>
      <p className="text-[11px] text-slate-500">{group.detail}</p>
      {group.available ? (
        <>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="cp-num text-[2rem] font-bold leading-none text-[#00205f]">
              {ordinal(group.rank)}
            </span>
            <span className="text-sm text-slate-500">of {group.of} students</span>
          </p>
          <p className="text-sm font-medium text-[#0066CC]">
            Top {group.topPercent}% · ahead of {group.percentile}% of students
          </p>
          <p className="text-xs text-slate-500">
            Your Success Score {group.mine} · typical student {group.median} · top 10% {group.top10}
          </p>
          {group.rank === 1 ? (
            <p className="text-xs font-semibold text-[#00205f]">You are first.</p>
          ) : (
            group.nextGap !== null && (
              <p className="text-xs text-slate-500">
                About <b>{group.nextGap}</b> more points moves you up one place.
              </p>
            )
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-500">
          Not shown yet: {group.reason}
          {group.size ? ` (${group.size} student${group.size === 1 ? "" : "s"})` : ""}.
        </p>
      )}
    </div>
  );
}

const cell = (m) =>
  m ? (
    <span className="tabular-nums">
      <b className="text-[#00205f]">{ordinal(m.rank)}</b>
      <span className="text-slate-500"> of {m.of}</span>
    </span>
  ) : (
    <span className="text-slate-400">—</span>
  );

/**
 * "My ranking" on the student's dashboard: the position in the class, the branch and the whole
 * university, and the rank on each measure. It is worked out from the current records every time
 * the page opens and refreshes itself every minute. Other students are never shown.
 */
export function RankingCard() {
  const { data, isLoading, isError, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["my-ranking"],
    queryFn: () => loadMyRanking(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return (
    <section className={`${card} p-5`} aria-label="My ranking">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold text-[#00205f]">
          <Medal className="size-5 text-[#0066CC]" aria-hidden /> My ranking
        </h2>
        {data && (
          <p className="text-xs text-slate-500">
            Among {data.students} students · updated{" "}
            {new Date(dataUpdatedAt || data.updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
      {isLoading && <p className="mt-4 text-sm text-slate-500">Working out your position…</p>}
      {isError && (
        <p role="alert" className="mt-4 text-sm text-[#00205F]">
          Your ranking could not be loaded.{" "}
          <button type="button" className="underline" onClick={() => refetch()}>
            Try again
          </button>
        </p>
      )}
      {data && (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {data.groups.map((g) => (
              <Tile key={g.key} group={g} />
            ))}
          </div>
          {data.measures.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Your rank on each measure
              </p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Measure</th>
                    <th className="pr-4">Class</th>
                    <th className="pr-4">Branch</th>
                    <th>University</th>
                  </tr>
                </thead>
                <tbody>
                  {data.measures.map((m) => (
                    <tr key={m.key} className="border-t border-[#D9E1EC]">
                      <td className="py-2 pr-4 font-medium text-slate-700">{m.label}</td>
                      <td className="pr-4">{cell(m.class)}</td>
                      <td className="pr-4">{cell(m.branch)}</td>
                      <td>{cell(m.university)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-500">
            Rankings use the Success Score and each of its parts, from the latest marks, attendance
            and activity. Other students are never named. Ask your coach on the Predictive Risk
            &amp; AI page who is ahead and what to do about it.
          </p>
        </>
      )}
    </section>
  );
}
