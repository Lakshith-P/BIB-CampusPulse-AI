import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionTitle } from "@/components/widgets";
import {
  linkStudentsToTeacher,
  listAccounts,
  listContactMessages,
  resetAccountPassword,
  deleteAccount,
  saveCampusStudent,
  setAccountRole,
} from "@/lib/campus.functions";
import { useServerFn } from "@tanstack/react-start";
import { studentSchema } from "@/lib/student-validation";
import { emptyStudent } from "@/lib/student-defaults";
import { CSV_TEMPLATE, parseStudentCsv } from "@/lib/csv";

const selectClass = "mt-2 w-full text-sm";
const SKILLS = ["coding", "aptitude", "analytical", "verbal", "communication"];
const label = (p) => (p.name ? `${p.name} — ${p.email}` : p.email);

// Turns a validation error into plain sentences instead of a raw JSON dump.
function explain(error) {
  const issues = error?.issues ?? error?.errors;
  if (!Array.isArray(issues)) return error instanceof Error ? error.message : "Could not save.";
  return issues
    .slice(0, 3)
    .map((i) => `${i.path?.join(" › ") || "Record"}: ${i.message}`)
    .join(" · ");
}

const ALL_TABS = ["connect", "people", "student", "csv", "json", "messages"];

export function AdminTools({ students, records, selectedId = "", onSaved, tabs = ALL_TABS }) {
  const qc = useQueryClient();
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => listAccounts(),
  });
  const grant = useServerFn(setAccountRole);
  const resetPassword = useServerFn(resetAccountPassword);
  const removeAccount = useServerFn(deleteAccount);
  const save = useServerFn(saveCampusStudent);
  const link = useServerFn(linkStudentsToTeacher);
  const [open, setOpen] = useState(tabs[0]);
  const messages = useQuery({
    queryKey: ["contact-messages"],
    queryFn: () => listContactMessages(),
    enabled: open === "messages",
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => accounts.data ?? [], [accounts.data]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const facultyPeople = people.filter((p) => p.roles.includes("faculty"));
  // A student is an account that holds the student role. A teacher waiting for approval holds no
  // role yet, so is not a student.
  const studentPeople = people.filter(
    (p) =>
      p.roles.includes("student") && !p.roles.includes("faculty") && !p.roles.includes("admin"),
  );

  // The People tab lists teachers, teacher requests and administrators. Student accounts are not
  // shown there; they are still available to the tabs that connect students to teachers.
  const teacherRequests = people.filter((p) => p.teacherRequest);
  const teacherList = people.filter((p) => p.roles.includes("faculty"));
  const adminList = people.filter((p) => p.roles.includes("admin") && !p.roles.includes("faculty"));

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["accounts"] });
    await qc.invalidateQueries({ queryKey: ["private-campus"] });
  };

  // ---------- Assign students, teacher first ----------
  // Teachers are listed; a teacher's students and a search box appear when one is opened. The
  // full list of students is never shown.
  const [openTeacher, setOpenTeacher] = useState("");
  const [find, setFind] = useState("");
  const teacherOf = useMemo(() => {
    const m = new Map();
    for (const r of records) if (r.owner_id) m.set(r.owner_id, r.faculty_id);
    return m;
  }, [records]);
  const unassigned = studentPeople.filter((p) => !teacherOf.get(p.id)).length;
  const matches = (teacherId) => {
    const q = find.trim().toLowerCase();
    if (q.length < 2) return [];
    return studentPeople
      .filter((p) => teacherOf.get(p.id) !== teacherId && label(p).toLowerCase().includes(q))
      .slice(0, 8);
  };
  // Give one student a teacher, or clear it with an empty teacher id.
  async function assignOne(student, facultyId) {
    setBusy(true);
    setMsg("");
    try {
      await link({ data: { facultyId: facultyId || null, studentUserIds: [student.id] } });
      await refresh();
      const who = byId.get(facultyId);
      setMsg(
        facultyId
          ? `${student.name || student.email} is now assigned to ${who?.name || who?.email}.`
          : `${student.name || student.email} no longer has a teacher.`,
      );
    } catch (err) {
      setMsg(explain(err));
    } finally {
      setBusy(false);
    }
  }

  // ---------- People & roles ----------
  const personRow = (p) => (
    <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
      <div>
        <p className="font-medium">{p.name || p.email}</p>
        <p className="text-muted-foreground">
          {p.email} ·{" "}
          {p.teacherRequest ? "requested teacher access" : p.roles.join(", ") || "no role"}
        </p>
      </div>
      <div className="flex gap-2">
        {["faculty", "admin"].map((role) => {
          const has = p.roles.includes(role);
          return (
            <Button
              key={role}
              type="button"
              size="sm"
              variant={has ? "default" : "outline"}
              onClick={() => changeRole(p.id, role, !has)}
            >
              {has ? `Remove ${role}` : `Make ${role}`}
            </Button>
          );
        })}
        <Button type="button" size="sm" variant="ghost" onClick={() => resetFor(p)}>
          Reset password
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => deleteFor(p)}
        >
          Delete
        </Button>
      </div>
    </div>
  );

  async function changeRole(userId, role, on) {
    setMsg("");
    try {
      await grant({ data: { userId, role, grant: on } });
      await refresh();
      setMsg(`Role ${on ? "granted" : "removed"}.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not change the role.");
    }
  }

  async function deleteFor(person) {
    if (
      !window.confirm(
        `Delete the account of ${person.name || person.email}? Their login is removed for good. Their student record, if any, stays but is no longer linked to a login.`,
      )
    )
      return;
    setMsg("");
    try {
      await removeAccount({ data: { userId: person.id } });
      await refresh();
      setMsg(`Deleted ${person.email}.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not delete the account.");
    }
  }

  async function resetFor(person) {
    if (
      !window.confirm(
        `Reset the password for ${person.name || person.email}? Their current password will stop working.`,
      )
    )
      return;
    setMsg("");
    try {
      const { password } = await resetPassword({ data: { userId: person.id } });
      setMsg(
        `Temporary password for ${person.email}: ${password}. Give it to them privately. It is not shown again, and they should change it after signing in.`,
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not reset the password.");
    }
  }

  // ---------- Optional: student details ----------
  const [picked, setPicked] = useState(selectedId || "");
  const existing = students.find((s) => s.id === picked);
  const rec = records.find((r) => r.id === picked);
  const base = existing ?? emptyStudent;
  const [owner, setOwner] = useState(rec?.owner_id ?? "");
  const [faculty, setFaculty] = useState(rec?.faculty_id ?? "");
  const [rows, setRows] = useState(() => (base.subjects ?? []).map((s) => ({ ...s })));
  useEffect(() => {
    setOwner(rec?.owner_id ?? "");
    setFaculty(rec?.faculty_id ?? "");
  }, [picked, rec?.owner_id, rec?.faculty_id]);
  const formKey = `${picked}|${rec?.updated_at ?? ""}`;
  function pick(id) {
    setPicked(id);
    const s = students.find((x) => x.id === id) ?? emptyStudent;
    setRows((s.subjects ?? []).map((x) => ({ ...x })));
    setMsg("");
  }
  const setRow = (i, key, value) =>
    setRows((all) => all.map((r, n) => (n === i ? { ...r, [key]: value } : r)));

  async function persist(student, ownerId, facultyId) {
    const parsed = studentSchema.safeParse(student);
    if (!parsed.success) throw parsed.error;
    await save({ data: { student: parsed.data, ownerId, facultyId } });
    return parsed.data;
  }

  async function submitForm(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (key, fallback = 0) => (f.get(key) === "" ? fallback : Number(f.get(key)));
    const typedId = String(f.get("id")).trim();
    const student = {
      ...base,
      id: typedId || `ST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      name: String(f.get("name")).trim(),
      branch: String(f.get("branch")).trim() || "Not set",
      semester: num("semester", 1),
      gradYear: num("gradYear", emptyStudent.gradYear),
      cgpa: num("cgpa"),
      backlogs: num("backlogs"),
      resumeCompleteness: num("resume", -1),
      skills: Object.fromEntries(SKILLS.map((k) => [k, num(`skill_${k}`, -1)])),
      subjects: rows
        .filter((r) => String(r.subject).trim())
        .map((r) => ({
          subject: String(r.subject).trim(),
          marks: Number(r.marks) || 0,
          classesHeld: Number(r.classesHeld) || 0,
          classesAttended: Number(r.classesAttended) || 0,
        })),
    };
    setBusy(true);
    setMsg("");
    try {
      const saved = await persist(student, owner || null, faculty || null);
      setPicked(saved.id);
      setRows(saved.subjects.map((x) => ({ ...x })));
      await onSaved(saved.id);
      await refresh();
      setMsg("Student details saved. Scores and insights are now updated.");
    } catch (err) {
      setMsg(explain(err));
    } finally {
      setBusy(false);
    }
  }

  // ---------- Optional: bulk JSON ----------
  const [bulkTeacher, setBulkTeacher] = useState("");
  async function submitJson(e) {
    e.preventDefault();
    const text = String(new FormData(e.currentTarget).get("record"));
    let parsedJson;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      setMsg("That text is not valid JSON. Check for a missing comma or quote.");
      return;
    }
    const items = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
    setBusy(true);
    setMsg("");
    let done = 0;
    try {
      for (const [n, item] of items.entries()) {
        // Optional "accountEmail" on each student links them to that login account.
        const { accountEmail, ...student } = item ?? {};
        const account = accountEmail
          ? people.find((p) => p.email.toLowerCase() === String(accountEmail).toLowerCase())
          : null;
        if (accountEmail && !account) throw new Error(`No account found for ${accountEmail}.`);
        try {
          await persist(student, account?.id ?? null, bulkTeacher || null);
        } catch (err) {
          throw new Error(
            `Student ${n + 1}${student?.name ? ` (${student.name})` : ""}: ${explain(err)}`,
          );
        }
        done += 1;
      }
      await onSaved(items[0]?.id ?? "");
      await refresh();
      setMsg(`Saved ${done} student record(s).`);
    } catch (err) {
      await refresh();
      setMsg(`${done ? `Saved ${done} before stopping. ` : ""}${explain(err)}`);
    } finally {
      setBusy(false);
    }
  }

  // ---------- CSV import ----------
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvTeacher, setCsvTeacher] = useState("");
  function previewCsv() {
    setMsg("");
    if (!csvText.trim()) return setMsg("Choose a CSV file or paste its contents first.");
    setCsvPreview(parseStudentCsv(csvText, new Set(records.map((r) => r.id))).results);
  }
  async function importCsv() {
    const good = (csvPreview ?? []).filter((r) => r.student);
    setBusy(true);
    setMsg("");
    let done = 0;
    try {
      for (const r of good) {
        await persist(r.student, null, csvTeacher || null);
        done += 1;
      }
      await onSaved("");
      await refresh();
      setMsg(`Imported ${done} student record(s).`);
      setCsvPreview(null);
      setCsvText("");
    } catch (err) {
      await refresh();
      setMsg(`${done ? `Imported ${done} before stopping. ` : ""}${explain(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const tab = (key, text) => (
    <Button
      type="button"
      size="sm"
      variant={open === key ? "default" : "outline"}
      onClick={() => setOpen(key)}
    >
      {text}
    </Button>
  );
  const accountSelect = (name, text, choices, value, setValue, empty) => (
    <label className="text-sm">
      {text}
      <select
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={selectClass}
      >
        <option value="">{empty}</option>
        {choices.map((p) => (
          <option key={p.id} value={p.id}>
            {label(p)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="mt-6 rounded-lg border bg-card p-5">
      {tabs.length > 2 && <SectionTitle>Administrator tools</SectionTitle>}
      <div className={tabs.length > 1 ? "mb-4 flex flex-wrap gap-2" : "hidden"}>
        {tab("connect", "Teachers and their students")}
        {tab("people", "People & roles")}
        {tab("student", "Add student details (optional)")}
        {tab("csv", "Import CSV")}
        {tab("json", "Bulk import (JSON)")}
        {tab("messages", "Messages")}
      </div>
      {msg && (
        <p className="mb-4 rounded-md border bg-muted/40 p-3 text-sm" role="status">
          {msg}
        </p>
      )}

      {open === "connect" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose a teacher to see their students and add more. Students are found by searching;
            they are not listed here.
          </p>
          {facultyPeople.length === 0 && !accounts.isLoading && (
            <p className="rounded-md border border-dashed p-3 text-sm">
              There are no teachers yet. Open <strong>People &amp; roles</strong> and approve a
              teacher with <strong>Make faculty</strong> first.
            </p>
          )}
          {accounts.isLoading && <p className="text-sm">Loading…</p>}
          <div className="divide-y rounded-md border">
            {facultyPeople.map((t) => {
              const mine = studentPeople.filter((p) => teacherOf.get(p.id) === t.id);
              const isOpen = openTeacher === t.id;
              const found = isOpen ? matches(t.id) : [];
              return (
                <section key={t.id} aria-label={`Teacher ${t.name || t.email}`}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => {
                      setOpenTeacher(isOpen ? "" : t.id);
                      setFind("");
                    }}
                    className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm hover:bg-muted/40"
                  >
                    <span>
                      <span className="block font-medium">{t.name || t.email}</span>
                      <span className="block text-muted-foreground">{t.email}</span>
                    </span>
                    <span className="text-muted-foreground">
                      {mine.length} student{mine.length === 1 ? "" : "s"} ·{" "}
                      {isOpen ? "Close" : "Open"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="space-y-4 border-t bg-muted/20 p-3 text-sm">
                      <div>
                        <p className="mb-2 font-medium">Students of this teacher ({mine.length})</p>
                        {mine.length === 0 ? (
                          <p className="text-muted-foreground">No students yet.</p>
                        ) : (
                          <div className="divide-y rounded-md border bg-card">
                            {mine.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between gap-3 p-2"
                              >
                                <span className="min-w-0">
                                  <span className="block font-medium">{p.name || p.email}</span>
                                  <span className="block truncate text-muted-foreground">
                                    {p.email}
                                  </span>
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => assignOne(p, "")}
                                >
                                  Remove
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="mb-2 block font-medium" htmlFor={`find-${t.id}`}>
                          Add a student
                        </label>
                        <Input
                          id={`find-${t.id}`}
                          placeholder="Search by name or email"
                          value={find}
                          onChange={(e) => setFind(e.target.value)}
                          className="max-w-sm"
                        />
                        {find.trim().length < 2 ? (
                          <p className="mt-2 text-muted-foreground">
                            Type at least 2 letters to search.
                          </p>
                        ) : found.length === 0 ? (
                          <p className="mt-2 text-muted-foreground">No other student matches.</p>
                        ) : (
                          <div className="mt-2 divide-y rounded-md border bg-card">
                            {found.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between gap-3 p-2"
                              >
                                <span className="min-w-0">
                                  <span className="block font-medium">{p.name || p.email}</span>
                                  <span className="block truncate text-muted-foreground">
                                    {p.email}
                                    {teacherOf.get(p.id)
                                      ? ` · now with ${byId.get(teacherOf.get(p.id))?.name || byId.get(teacherOf.get(p.id))?.email}`
                                      : " · no teacher yet"}
                                  </span>
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => {
                                    void assignOne(p, t.id);
                                    setFind("");
                                  }}
                                >
                                  <Plus /> Add
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          {!accounts.isLoading && (
            <p className="text-xs text-muted-foreground">
              {unassigned} student{unassigned === 1 ? "" : "s"} do not have a teacher yet.
            </p>
          )}
        </div>
      )}

      {open === "people" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Teachers, and people who have asked for teacher access. Approve a request with{" "}
            <strong>Make faculty</strong>. Student accounts are not listed here.
          </p>
          {accounts.isLoading && <p className="text-sm">Loading…</p>}
          {teacherRequests.length > 0 && (
            <section aria-label="Teacher requests">
              <h3 className="mb-2 text-sm font-semibold">
                Waiting for approval ({teacherRequests.length})
              </h3>
              <div className="divide-y rounded-md border border-warning/50 bg-warning/5">
                {teacherRequests.map(personRow)}
              </div>
            </section>
          )}
          <section aria-label="Teachers">
            <h3 className="mb-2 text-sm font-semibold">Teachers ({teacherList.length})</h3>
            {teacherList.length === 0 && !accounts.isLoading ? (
              <p className="rounded-md border p-3 text-sm text-muted-foreground">
                No teachers yet. When someone signs up in the Teacher workspace, their request
                appears above for approval.
              </p>
            ) : (
              <div className="divide-y rounded-md border">{teacherList.map(personRow)}</div>
            )}
          </section>
          {adminList.length > 0 && (
            <section aria-label="Administrators">
              <h3 className="mb-2 text-sm font-semibold">Administrators ({adminList.length})</h3>
              <div className="divide-y rounded-md border">{adminList.map(personRow)}</div>
            </section>
          )}
        </div>
      )}

      {open === "student" && (
        <form key={formKey} onSubmit={submitForm} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Only needed to record marks, attendance and skills. Linking a student to a teacher does
            not require any of this. Only the name is required.
          </p>
          <label className="block text-sm">
            Which student?
            <select value={picked} onChange={(e) => pick(e.target.value)} className={selectClass}>
              <option value="">Add a new student</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  Edit {s.name} ({s.id})
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {accountSelect(
              "owner",
              "Student's login account (optional)",
              studentPeople,
              owner,
              setOwner,
              "Not linked to an account",
            )}
            {accountSelect(
              "faculty",
              "Teacher (optional)",
              facultyPeople,
              faculty,
              setFaculty,
              "No teacher",
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm sm:col-span-2">
              Full name
              <Input name="name" required defaultValue={base.name} className="mt-2" />
            </label>
            <label className="text-sm">
              Student ID (optional)
              <Input
                name="id"
                defaultValue={base.id}
                readOnly={Boolean(existing)}
                placeholder="Auto if blank"
                className="mt-2"
              />
            </label>
            <label className="text-sm">
              Branch
              <Input
                name="branch"
                defaultValue={base.branch === "Not set" ? "" : base.branch}
                placeholder="e.g. CSE"
                className="mt-2"
              />
            </label>
            <label className="text-sm">
              Semester (1–8)
              <Input
                name="semester"
                type="number"
                min={1}
                max={8}
                defaultValue={base.semester}
                className="mt-2"
              />
            </label>
            <label className="text-sm">
              Graduation year
              <Input
                name="gradYear"
                type="number"
                min={2020}
                max={2035}
                defaultValue={base.gradYear}
                className="mt-2"
              />
            </label>
            <label className="text-sm">
              CGPA (0–10, blank = unknown)
              <Input
                name="cgpa"
                type="number"
                step="0.01"
                min={0}
                max={10}
                defaultValue={base.cgpa || ""}
                className="mt-2"
              />
            </label>
            <label className="text-sm">
              Backlogs
              <Input
                name="backlogs"
                type="number"
                min={0}
                defaultValue={base.backlogs}
                className="mt-2"
              />
            </label>
            <label className="text-sm">
              Resume % (blank = unknown)
              <Input
                name="resume"
                type="number"
                min={0}
                max={100}
                defaultValue={base.resumeCompleteness >= 0 ? base.resumeCompleteness : ""}
                className="mt-2"
              />
            </label>
          </div>
          <div>
            <p className="text-sm font-medium">Skill scores 0–100 (blank = unknown)</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-5">
              {SKILLS.map((k) => (
                <label key={k} className="text-sm capitalize">
                  {k}
                  <Input
                    name={`skill_${k}`}
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={base.skills?.[k] >= 0 ? base.skills[k] : ""}
                    className="mt-2"
                  />
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Subjects (marks and attendance)</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setRows((r) => [
                    ...r,
                    { subject: "", marks: "", classesHeld: "", classesAttended: "" },
                  ])
                }
              >
                <Plus /> Add subject
              </Button>
            </div>
            {rows.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                No subjects yet. Attendance will show as unavailable.
              </p>
            )}
            {rows.map((r, i) => (
              <div
                key={i}
                className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
              >
                <Input
                  placeholder="Subject"
                  value={r.subject}
                  onChange={(e) => setRow(i, "subject", e.target.value)}
                  aria-label="Subject"
                />
                <Input
                  placeholder="Marks"
                  type="number"
                  min={0}
                  max={100}
                  value={r.marks}
                  onChange={(e) => setRow(i, "marks", e.target.value)}
                  aria-label="Marks"
                />
                <Input
                  placeholder="Classes held"
                  type="number"
                  min={0}
                  value={r.classesHeld}
                  onChange={(e) => setRow(i, "classesHeld", e.target.value)}
                  aria-label="Classes held"
                />
                <Input
                  placeholder="Attended"
                  type="number"
                  min={0}
                  value={r.classesAttended}
                  onChange={(e) => setRow(i, "classesAttended", e.target.value)}
                  aria-label="Classes attended"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove subject"
                  onClick={() => setRows((all) => all.filter((_, n) => n !== i))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button type="submit" disabled={busy}>
            <Save /> Save student details
          </Button>
        </form>
      )}

      {open === "csv" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add many students from a spreadsheet saved as CSV. Required columns: student_id, name,
            branch, semester, grad_year, cgpa. Optional: gender, course, section (these drive the
            year, course, section and gender views), plus backlogs, attendance_pct and skill scores.
            Semesters 1–2 are Year 1, up to 7–8 for Year 4. Existing student IDs are skipped, never
            overwritten. Students can be linked to their login afterwards under Connect.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: "text/csv" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = "students-template.csv";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Download template
            </Button>
            <Input
              type="file"
              accept=".csv,text/csv"
              aria-label="CSV file"
              className="max-w-xs"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setCsvText(await file.text());
                  setCsvPreview(null);
                }
              }}
            />
          </div>
          {accountSelect(
            "csvTeacher",
            "Teacher for all of these (optional)",
            facultyPeople,
            csvTeacher,
            setCsvTeacher,
            "No teacher",
          )}
          <Textarea
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setCsvPreview(null);
            }}
            rows={8}
            aria-label="CSV contents"
            placeholder="…or paste CSV here"
            className="font-mono text-xs"
          />
          <Button type="button" variant="outline" onClick={previewCsv}>
            Check file
          </Button>
          {csvPreview && (
            <div className="rounded-md border p-3 text-sm">
              <p>
                <strong>{csvPreview.filter((r) => r.student).length}</strong> ready to import ·{" "}
                <strong>{csvPreview.filter((r) => !r.student).length}</strong> with problems
              </p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-destructive">
                {csvPreview
                  .filter((r) => !r.student)
                  .map((r) => (
                    <li key={r.row}>
                      Row {r.row}:{" "}
                      {[...r.errors, ...r.missing.map((m) => `missing ${m}`)].join(", ")}
                    </li>
                  ))}
              </ul>
              <Button
                type="button"
                className="mt-3"
                disabled={busy || !csvPreview.some((r) => r.student)}
                onClick={importCsv}
              >
                <Save /> Import valid rows
              </Button>
            </div>
          )}
        </div>
      )}

      {open === "json" && (
        <form onSubmit={submitJson} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Only for adding the full details of many students at once. To simply connect students to
            a teacher, use the first tab instead. Paste one student or a list of students as JSON.
            Add <code>&quot;accountEmail&quot;</code> to a student to link them to that login.
          </p>
          {accountSelect(
            "bulkTeacher",
            "Teacher for all of these (optional)",
            facultyPeople,
            bulkTeacher,
            setBulkTeacher,
            "No teacher",
          )}
          <label className="block text-sm">
            Students (JSON)
            <Textarea
              name="record"
              rows={12}
              required
              placeholder='[{"id":"S1","name":"A","accountEmail":"a@college.edu", ...}, {...}]'
              className="mt-2 font-mono text-xs"
            />
          </label>
          <Button type="submit" disabled={busy}>
            <Save /> Save all
          </Button>
        </form>
      )}

      {open === "messages" && (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            Messages and concerns sent from the Contact page, newest first. Only administrators can
            read these.
          </p>
          {messages.isLoading && <p className="text-sm">Loading…</p>}
          {messages.isError && (
            <p className="text-sm text-destructive">Messages could not be loaded.</p>
          )}
          {messages.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          )}
          <div className="divide-y rounded-md border">
            {(messages.data ?? []).map((m) => (
              <article key={m.id} className="p-3 text-sm">
                <p className="font-medium">
                  {m.name} <span className="font-normal text-muted-foreground">· {m.email}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(m.created_at).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.message}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
