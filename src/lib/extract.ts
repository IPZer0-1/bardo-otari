import mammoth from "mammoth";

export async function extractText(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "txt" || ext === "md") {
    return buffer.toString("utf-8");
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (ext === "pdf") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = (await import("pdf-parse")) as any;
    const fn = pdfParse.default ?? pdfParse;
    const data = await fn(buffer);
    return data.text as string;
  }

  throw new Error(`Formato no soportado: .${ext}. Usa TXT, DOCX o PDF.`);
}
