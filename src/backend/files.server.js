import { z } from "zod";

// Uploaded files are kept in PostgreSQL. Only document and image types are accepted, never
// anything a browser could run (HTML, SVG, scripts), and files are only ever offered as downloads.

export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const fileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.string().trim().max(100),
  base64: z.string().max(Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8),
});

/** Validates an uploaded file and returns what the database stores. */
export function decodeFile(file) {
  if (!ALLOWED_TYPES.has(file.type))
    throw new Error(
      "That file type is not allowed. Use PDF, Word, PowerPoint, Excel, PNG, JPG, TXT, CSV or ZIP.",
    );
  const buffer = Buffer.from(file.base64, "base64");
  if (buffer.length === 0) throw new Error("The file is empty.");
  if (buffer.length > MAX_FILE_BYTES) throw new Error("Files can be at most 3 MB.");
  // eslint-disable-next-line no-control-regex
  const name = file.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 150);
  return { name, type: file.type, buffer };
}

export const encodeFile = (name, type, data) => ({
  name,
  type,
  base64: Buffer.from(data).toString("base64"),
});
