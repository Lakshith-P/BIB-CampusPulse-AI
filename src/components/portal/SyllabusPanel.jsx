import { useState } from "react";
import { Download, FileDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionTitle } from "@/components/widgets";
import { Field, useAction } from "@/components/ui-kit";
import { saveLmsSyllabus } from "@/lib/platform.functions";
import { todayIso } from "@/lib/live-profile";
import {
  EMPTY_SYLLABUS,
  downloadPdf,
  hasSyllabus,
  subjectSyllabusPdf,
  syllabusSections,
  unitSyllabusPdf,
} from "@/lib/syllabus";

// The syllabus of a subject, laid out like a printed course sheet: the course header with its
// credits, the course outcomes, each unit with its topics, then the text books and references.
// The page and the downloaded PDF are built from the same sections, so they always match.

/** Downloads the whole subject's syllabus, or one unit's, as a PDF. */
export function SyllabusDownload({
  subject,
  units,
  syllabus,
  unit,
  label = "Download syllabus (PDF)",
  size = "sm",
  variant = "outline",
}) {
  const ready = unit ? hasSyllabus(unit) : units.some(hasSyllabus) || Boolean(syllabus?.code);
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={!ready}
      title={ready ? undefined : "No syllabus has been published for this yet."}
      onClick={() =>
        downloadPdf(
          unit
            ? unitSyllabusPdf({ subject, unit, syllabus, today: todayIso() })
            : subjectSyllabusPdf({ subject, units, syllabus, today: todayIso() }),
        )
      }
    >
      {unit ? <Download /> : <FileDown />} {label}
    </Button>
  );
}

function Outcomes({ outcomes }) {
  if (!outcomes.length) return null;
  return (
    <div className="mt-4">
      <p className="font-semibold">Course Outcomes:</p>
      <p className="text-sm text-muted-foreground">
        Through this course students should be able to
      </p>
      <ul className="mt-1 space-y-1 text-sm">
        {outcomes.map((o, i) => (
          <li key={o} className="flex gap-2">
            <span className="shrink-0 font-semibold tabular-nums">CO{i + 1} ::</span>
            <span>{o}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Books({ title, items }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <p className="font-semibold">{title}</p>
      <ol className="mt-1 list-inside list-decimal space-y-0.5 text-sm text-muted-foreground">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
    </div>
  );
}

/** The full syllabus of one subject as it is read on the page. */
export function SyllabusView({ subject, units, syllabus }) {
  const sections = syllabusSections(subject, units, syllabus);
  const { header } = sections;
  const nothing =
    !sections.units.length &&
    !sections.outcomes.length &&
    !sections.textbooks.length &&
    !sections.references.length;
  return (
    <article className="surface p-4 md:p-6" aria-label={`${subject} syllabus`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
        <div>
          <h3 className="font-display text-xl font-bold tracking-tight">{header.heading}</h3>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            L: {header.lectures} &nbsp; T: {header.tutorials} &nbsp; P: {header.practicals}{" "}
            &nbsp;·&nbsp; Credits: {header.credits}
            {header.session && ` · Session ${header.session}`}
          </p>
        </div>
        <SyllabusDownload subject={subject} units={units} syllabus={syllabus} />
      </div>
      {nothing ? (
        <p className="mt-4 text-sm text-muted-foreground">
          The syllabus for this subject has not been published yet. Your teacher adds the course
          outcomes, the unit topics and the books.
        </p>
      ) : (
        <>
          <Outcomes outcomes={sections.outcomes} />
          {sections.units.map((u) => (
            <div key={u.unit} className="mt-4 border-t pt-3">
              <p className="font-semibold">
                Unit {u.roman} &nbsp; {u.title}
              </p>
              {u.topics.length ? (
                <p className="mt-1 text-sm text-muted-foreground">{u.topics.join(", ")}</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Topics have not been published for this unit yet.
                </p>
              )}
            </div>
          ))}
          <Books title="Text Books:" items={sections.textbooks} />
          <Books title="References:" items={sections.references} />
        </>
      )}
    </article>
  );
}

// ---------------------------------------------------------------- staff editing
const numberField = (f, set, key, label) => (
  <Field key={key} label={label}>
    <Input type="number" min={0} max={20} value={f[key]} onChange={set(key)} required />
  </Field>
);

/** The course header a teacher fills in once per subject. Units keep their own topic lists. */
export function SyllabusForm({ subject, syllabus, units, refresh }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...EMPTY_SYLLABUS, ...(syllabus ?? {}) });
  const { busy, run } = useAction(refresh);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (!open)
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <Pencil /> {syllabus ? "Edit course syllabus" : "Add course syllabus"}
        </Button>
        <SyllabusDownload subject={subject} units={units} syllabus={syllabus} />
      </div>
    );
  return (
    <form
      className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(
          () =>
            saveLmsSyllabus({
              data: {
                subject,
                code: f.code,
                title: f.title,
                lectures: Number(f.lectures),
                tutorials: Number(f.tutorials),
                practicals: Number(f.practicals),
                credits: Number(f.credits),
                outcomes: f.outcomes,
                textbooks: f.textbooks,
                references: f.references,
                session: f.session,
              },
            }),
          "Syllabus saved. Students see it on their LMS page.",
        );
        if (r.ok) setOpen(false);
      }}
    >
      <div className="md:col-span-2">
        <SectionTitle sub="This header appears at the top of the syllabus page and of the PDF students download.">
          Course syllabus for {subject}
        </SectionTitle>
      </div>
      <Field label="Course code" hint="Used for the PDF file name, e.g. PHY165.">
        <Input value={f.code} onChange={set("code")} maxLength={20} placeholder="PHY165" />
      </Field>
      <Field label="Course title" hint="Leave blank to use the subject name.">
        <Input value={f.title} onChange={set("title")} maxLength={120} placeholder={subject} />
      </Field>
      <div className="grid grid-cols-4 gap-2 md:col-span-2">
        {numberField(f, set, "lectures", "L")}
        {numberField(f, set, "tutorials", "T")}
        {numberField(f, set, "practicals", "P")}
        <Field label="Credits">
          <Input
            type="number"
            min={0}
            max={30}
            value={f.credits}
            onChange={set("credits")}
            required
          />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field label="Course outcomes" hint="One per line. They are numbered CO1, CO2, … in order.">
          <Textarea value={f.outcomes} onChange={set("outcomes")} rows={5} maxLength={4000} />
        </Field>
      </div>
      <Field label="Text books" hint="One per line.">
        <Textarea value={f.textbooks} onChange={set("textbooks")} rows={4} maxLength={3000} />
      </Field>
      <Field label="References" hint="One per line.">
        <Textarea value={f.references} onChange={set("references")} rows={4} maxLength={3000} />
      </Field>
      <Field label="Session" hint="Shown in the PDF footer, e.g. 2026-27.">
        <Input value={f.session} onChange={set("session")} maxLength={20} placeholder="2026-27" />
      </Field>
      <div className="flex flex-wrap items-end gap-2">
        <Button type="submit" disabled={busy}>
          Save syllabus
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
