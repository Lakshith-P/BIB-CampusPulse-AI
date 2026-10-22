// A small PDF writer, so printable documents (syllabus sheets, reports) can be downloaded as
// real .pdf files without pulling in a PDF library. It lays out Helvetica text on A4 pages,
// wraps paragraphs to the page width and numbers every page.

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 54;
// Advance widths per 1000 units for the two built-in fonts used here, codes 32..126.
const WIDTHS = {
  regular: [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
    611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
    222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ],
  bold: [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
    556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
    611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
    667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
    278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
  ],
};

/** Characters a built-in PDF font cannot show are replaced with the nearest plain equivalent. */
const SUBSTITUTES = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "•": "-",
  "…": "...",
  " ": " ",
  "≥": ">=",
  "≤": "<=",
  "·": "-",
};

const SUBSTITUTE_RE = new RegExp(`[${Object.keys(SUBSTITUTES).join("")}]`, "g");

const plain = (text) =>
  String(text ?? "")
    .replace(SUBSTITUTE_RE, (c) => SUBSTITUTES[c])
    .replace(/[^ -~]/g, "?");

function textWidth(text, size, bold) {
  const table = bold ? WIDTHS.bold : WIDTHS.regular;
  let total = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    total += code >= 32 && code <= 126 ? table[code - 32] : 556;
  }
  return (total * size) / 1000;
}

/**
 * Breaks one paragraph into lines that fit `width`, splitting over-long words if it must.
 * Runs of spaces inside a line are kept, so columns written with spaces stay lined up.
 */
export function wrapText(text, width, size, bold) {
  const out = [];
  for (const paragraph of plain(text).split("\n")) {
    let line = "";
    for (const token of paragraph.split(/( +)/).filter(Boolean)) {
      if (textWidth(line + token, size, bold) <= width) {
        line += token;
        continue;
      }
      if (/^ +$/.test(token)) continue; // a line never starts or ends with spaces
      if (line) out.push(line.trimEnd());
      line = token;
      while (textWidth(line, size, bold) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && textWidth(line.slice(0, cut), size, bold) > width) cut -= 1;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line.trimEnd());
  }
  return out.length ? out : [""];
}

const escape = (s) => s.replace(/([\\()])/g, "\\$1");

// ------------------------------------------------------------------ layout
// A block is one of:
//   { text, size, bold, indent, gap, align }  a paragraph
//   { gap }                                   blank space
//   { rule: true, gap }                       a horizontal line
function layout(blocks, footer) {
  const usable = A4.width - MARGIN * 2;
  const pages = [];
  let page = [];
  let y = A4.height - MARGIN;
  const bottom = MARGIN + 28;
  const newPage = () => {
    pages.push(page);
    page = [];
    y = A4.height - MARGIN;
  };
  for (const block of blocks) {
    const gap = block.gap ?? 0;
    if (block.rule) {
      if (y - gap - 6 < bottom) newPage();
      y -= gap + 4;
      page.push({ kind: "rule", y });
      y -= 2;
      continue;
    }
    if (block.text === undefined) {
      y -= gap;
      continue;
    }
    const size = block.size ?? 10;
    const bold = Boolean(block.bold);
    const indent = block.indent ?? 0;
    const leading = size * 1.35;
    const lines = wrapText(block.text, usable - indent, size, bold);
    y -= gap;
    for (const line of lines) {
      if (y - leading < bottom) newPage();
      y -= leading;
      const x =
        block.align === "center"
          ? MARGIN + (usable - textWidth(line, size, bold)) / 2
          : MARGIN + indent;
      page.push({ kind: "text", text: line, size, bold, x, y });
    }
  }
  pages.push(page);
  const total = pages.length;
  return pages.map((items, i) => {
    const label = `${footer ? `${footer}    ` : ""}Page: ${i + 1} / ${total}`;
    const size = 8;
    return [
      ...items,
      { kind: "rule", y: MARGIN + 22 },
      {
        kind: "text",
        text: plain(label),
        size,
        bold: false,
        x: A4.width - MARGIN - textWidth(plain(label), size, false),
        y: MARGIN + 8,
      },
    ];
  });
}

function contentStream(items) {
  const parts = [];
  for (const item of items) {
    if (item.kind === "rule") {
      parts.push(
        `0.75 w 0.8 0.8 0.8 RG ${MARGIN} ${item.y.toFixed(2)} m ${(A4.width - MARGIN).toFixed(2)} ${item.y.toFixed(2)} l S`,
      );
      continue;
    }
    parts.push(
      `BT /${item.bold ? "F2" : "F1"} ${item.size} Tf 1 0 0 1 ${item.x.toFixed(2)} ${item.y.toFixed(2)} Tm (${escape(item.text)}) Tj ET`,
    );
  }
  return parts.join("\n");
}

/**
 * Renders blocks as a PDF and returns its bytes.
 * `title` becomes the document title, `footer` the text beside the page number.
 */
export function renderPdf({ title = "Document", footer = "", blocks = [] }) {
  const pages = layout(blocks, footer);
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length; // object numbers start at 1
  };
  const catalog = add(null);
  const pageTree = add(null);
  const fontRegular = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const fontBold = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  const info = add(
    `<< /Title (${escape(plain(title))}) /Producer (BIB InsightIQ) /Creator (BIB InsightIQ) >>`,
  );
  const pageIds = [];
  for (const items of pages) {
    const stream = contentStream(items);
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 ${A4.width.toFixed(2)} ${A4.height.toFixed(2)}]` +
          ` /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pageTree} 0 R >>`;
  objects[pageTree - 1] =
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

const safeName = (name) => name.replace(/[\\/:*?"<>|]/g, "-");

/** Saves a built PDF as a file in the browser. Nothing is opened in the page itself. */
export function downloadPdf({ name, title, footer, blocks }) {
  const blob = new Blob([renderPdf({ title: title ?? name, footer, blocks })], {
    type: "application/pdf",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName(name.endsWith(".pdf") ? name : `${name}.pdf`);
  a.click();
  URL.revokeObjectURL(url);
}
