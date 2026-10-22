import { describe, expect, it } from "vitest";

import { renderPdf, wrapText } from "@/lib/pdf";
import {
  hasSyllabus,
  subjectSyllabusPdf,
  syllabusSections,
  unitSyllabusPdf,
} from "@/lib/syllabus";

const units = [
  {
    unit: 1,
    title: "Mechanics",
    topics: "Newton's laws, forces and acceleration; friction",
    configured: true,
  },
  { unit: 2, title: "Kinematics", topics: "Position and displacement, projectile motion", configured: true },
  { unit: 3, title: "Unit 3", topics: "", configured: false },
];
const syllabus = {
  code: "PHY165",
  title: "Physics I",
  lectures: 3,
  tutorials: 0,
  practicals: 0,
  credits: 3,
  outcomes: "understand Newton's laws\ndescribe the Maxwell equations",
  textbooks: "PRINCIPLES OF PHYSICS by DAVID HALLIDAY, WILEY",
  references: "UNIVERSITY PHYSICS by HUGH D. YOUNG, PEARSON",
  session: "2026-27",
};

const text = (bytes) => String.fromCharCode(...bytes);

describe("subject syllabus", () => {
  it("builds the course sheet: header, numbered outcomes, units with topics, books", () => {
    const s = syllabusSections("Physics", units, syllabus);
    expect(s.header.heading).toBe("PHY165 : PHYSICS I");
    expect(s.header.credits).toBe(3);
    expect(s.outcomes).toEqual(["understand Newton's laws", "describe the Maxwell equations"]);
    expect(s.units.map((u) => u.roman)).toEqual(["I", "II"]); // unpublished unit 3 is left out
    expect(s.units[0].topics).toEqual([
      "Newton's laws",
      "forces and acceleration",
      "friction",
    ]);
    expect(s.textbooks).toHaveLength(1);
    expect(s.references).toHaveLength(1);
  });

  it("falls back to the subject name when no course header was entered", () => {
    const s = syllabusSections("Physics", units, null);
    expect(s.header.heading).toBe("PHYSICS");
    expect(s.outcomes).toEqual([]);
  });

  it("names the download after the course code and the day it was taken", () => {
    expect(
      subjectSyllabusPdf({ subject: "Physics", units, syllabus, today: "2026-06-26" }).name,
    ).toBe("PHY165_2026-06-26.pdf");
    expect(
      unitSyllabusPdf({ subject: "Physics", unit: units[0], syllabus, today: "2026-06-26" }).name,
    ).toBe("PHY165_Unit-I_2026-06-26.pdf");
  });

  it("says so instead of inventing topics for an unpublished unit", () => {
    expect(hasSyllabus(units[2])).toBe(false);
    const doc = unitSyllabusPdf({
      subject: "Physics",
      unit: { ...units[2], configured: true },
      syllabus,
      today: "2026-06-26",
    });
    expect(text(renderPdf(doc))).toContain("Topics have not been published");
  });
});

describe("pdf writer", () => {
  it("writes a valid single-page PDF with the text and the page number in it", () => {
    const doc = subjectSyllabusPdf({ subject: "Physics", units, syllabus, today: "2026-06-26" });
    const out = text(renderPdf(doc));
    expect(out.startsWith("%PDF-1.4")).toBe(true);
    expect(out.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(out).toContain("PHY165 : PHYSICS I");
    expect(out).toContain("CO1 ::  understand Newton's laws");
    expect(out).toContain("Unit II   Kinematics");
    expect(out).toContain("Text Books:");
    expect(out).toContain("Session  2026-27    Page: 1 / 1");
    // the cross-reference offsets must point at the objects they claim
    const offsets = [...out.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(5);
    offsets.forEach((offset, i) => expect(out.slice(offset)).toMatch(`${i + 1} 0 obj`));
  });

  it("escapes brackets and drops characters the built-in fonts cannot show", () => {
    const out = text(renderPdf({ blocks: [{ text: "Gauss (qualitative) — ₹100" }] }));
    expect(out).toContain("Gauss \\(qualitative\\) - ?100");
  });

  it("wraps a paragraph to the width it is given and keeps spaced columns aligned", () => {
    const lines = wrapText("one two three four five six seven eight", 60, 10, false);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("one two three four five six seven eight");
    expect(wrapText("L: 3     T: 0", 400, 10, false)).toEqual(["L: 3     T: 0"]);
  });
});
