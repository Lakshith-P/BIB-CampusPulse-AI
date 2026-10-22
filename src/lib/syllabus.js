// Builds the printable syllabus of a subject from what staff entered: the course header (code,
// title, credits, outcomes, books) and the six units with their topic lists. The same structure
// is used for the page a student reads and for the PDF they download.

import { downloadPdf } from "./pdf";

const ROMAN = ["I", "II", "III", "IV", "V", "VI"];

export const topicsOf = (topics) =>
  (topics ?? "")
    .split(/[\n;,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

/** Lines entered one per line (course outcomes, text books, references). */
export const linesOf = (text) =>
  (text ?? "")
    .split("\n")
    .map((t) => t.replace(/^\s*(?:\d+\s*[.)]|[-*])\s*/, "").trim())
    .filter(Boolean);

export const hasSyllabus = (unit) => Boolean(unit.configured || unit.topics?.trim());

export const EMPTY_SYLLABUS = {
  code: "",
  title: "",
  lectures: 3,
  tutorials: 0,
  practicals: 0,
  credits: 3,
  outcomes: "",
  textbooks: "",
  references: "",
  session: "",
};

/** The course header, falling back to the subject's own name when nothing has been entered. */
export function courseHeader(subject, syllabus) {
  const s = { ...EMPTY_SYLLABUS, ...(syllabus ?? {}) };
  return {
    ...s,
    code: s.code?.trim() || "",
    title: (s.title?.trim() || subject).toUpperCase(),
    heading: s.code?.trim()
      ? `${s.code.trim()} : ${(s.title?.trim() || subject).toUpperCase()}`
      : (s.title?.trim() || subject).toUpperCase(),
  };
}

export const syllabusFileName = (subject, syllabus, today) =>
  `${(syllabus?.code?.trim() || subject).replace(/\s+/g, "")}_${today}.pdf`;

/** True once a subject has a course header or at least one unit with topics. */
export const syllabusPublished = (subject) =>
  Boolean(
    subject.syllabus?.code || subject.syllabus?.outcomes?.trim() || subject.units.some(hasSyllabus),
  );

/**
 * The whole syllabus as ordered sections, so the page and the PDF cannot drift apart.
 * Each unit keeps its roman number, title and topic list.
 */
export function syllabusSections(subject, units, syllabus) {
  const head = courseHeader(subject, syllabus);
  return {
    header: head,
    outcomes: linesOf(head.outcomes),
    units: units.filter(hasSyllabus).map((u) => ({
      unit: u.unit,
      roman: ROMAN[u.unit - 1] ?? String(u.unit),
      title: u.title,
      topics: topicsOf(u.topics),
    })),
    textbooks: linesOf(head.textbooks),
    references: linesOf(head.references),
  };
}

function headerBlocks(head) {
  const credits = [
    `L: ${head.lectures}`,
    `T: ${head.tutorials}`,
    `P: ${head.practicals}`,
    `Credits: ${head.credits}`,
  ].join("     ");
  return [
    { text: head.heading, size: 15, bold: true },
    { text: credits, size: 10, gap: 6 },
    { rule: true, gap: 4 },
  ];
}

function unitBlocks(units) {
  return units.flatMap((u) => [
    { text: `Unit ${u.roman}   ${u.title}`, size: 11, bold: true, gap: 12 },
    ...(u.topics.length
      ? [{ text: u.topics.join(", "), size: 10, indent: 14, gap: 3 }]
      : [
          {
            text: "Topics have not been published for this unit yet.",
            size: 10,
            indent: 14,
            gap: 3,
          },
        ]),
  ]);
}

function listBlocks(title, items) {
  if (!items.length) return [];
  return [
    { text: title, size: 11, bold: true, gap: 14 },
    ...items.map((t, i) => ({ text: `${i + 1}.  ${t}`, size: 10, indent: 14, gap: 3 })),
  ];
}

/** Blocks for the full subject syllabus, in the order a printed course sheet uses. */
export function subjectSyllabusBlocks(sections) {
  const { header, outcomes, units, textbooks, references } = sections;
  return [
    ...headerBlocks(header),
    ...(outcomes.length
      ? [
          { text: "Course Outcomes:", size: 11, bold: true, gap: 12 },
          { text: "Through this course students should be able to", size: 10, gap: 3 },
          ...outcomes.map((o, i) => ({
            text: `CO${i + 1} ::  ${o}`,
            size: 10,
            indent: 14,
            gap: 3,
          })),
        ]
      : []),
    ...unitBlocks(units),
    ...listBlocks("Text Books:", textbooks),
    ...listBlocks("References:", references),
  ];
}

/** The syllabus of the whole subject, ready for `downloadPdf`. */
export function subjectSyllabusPdf({ subject, units, syllabus, today }) {
  const sections = syllabusSections(subject, units, syllabus);
  return {
    name: syllabusFileName(subject, syllabus, today),
    title: `${sections.header.heading} syllabus`,
    footer: sections.header.session ? `Session  ${sections.header.session}` : "",
    blocks: subjectSyllabusBlocks(sections),
  };
}

/** One unit's syllabus on its own sheet, under the same course header. */
export function unitSyllabusPdf({ subject, unit, syllabus, today }) {
  const sections = syllabusSections(subject, [unit], syllabus);
  const roman = ROMAN[unit.unit - 1] ?? String(unit.unit);
  return {
    name: `${(syllabus?.code?.trim() || subject).replace(/\s+/g, "")}_Unit-${roman}_${today}.pdf`,
    title: `${sections.header.heading} Unit ${roman}`,
    footer: sections.header.session ? `Session  ${sections.header.session}` : "",
    blocks: [...headerBlocks(sections.header), ...unitBlocks(sections.units)],
  };
}

export { downloadPdf };
