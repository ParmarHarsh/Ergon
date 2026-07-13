import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { extractEvidenceText } from "../packages/ai/src/index.js";
import { OOXML_MIME } from "../packages/ai/src/ooxml.js";
import { validateUploadedFile } from "../apps/api/src/file-validation.js";

const maxBytes = 60 * 1024 * 1024;
const evidence = { title: "Synthetic evidence", description: "Test-only fixture" };

test("TXT, Markdown, and quoted CSV produce bounded normalized text and source anchors", async () => {
  const text = await extract("record.txt", Buffer.from("Permit P-104\nEffective 2026-07-01"));
  assert.equal(text.detectedFormat, "text");
  assert.equal(text.extractionStatus, "extracted");
  assert.equal(text.provenanceAnchors[0].lineStart, 1);
  assert.ok(text.deterministicProfile.identifiers.some((value) => /P-104/i.test(value)));

  const markdown = await extract("procedure.md", Buffer.from("# Lockout\n\nUse the verified energy-control steps."));
  assert.equal(markdown.detectedFormat, "markdown");
  assert.match(markdown.normalizedText, /Lockout/);

  const csv = await extract("training.csv", Buffer.from('employee,course,notes\n"Lee, Sam",LOTO,"Line one\nLine two"'));
  assert.equal(csv.structuredContent.kind, "table");
  assert.equal(csv.structuredContent.rows, 2);
  assert.equal(csv.provenanceAnchors[1].rowStart, 2);
  assert.match(csv.normalizedText, /Lee, Sam/);
});

test("DOCX extraction preserves paragraph provenance and rejects entity declarations", async () => {
  const docx = makeDocx("Forklift inspection completed 2026-07-01.");
  const validation = validateUploadedFile({ buffer: docx, fileName: "inspection.docx", declaredContentType: OOXML_MIME.docx, maxBytes });
  assert.equal(validation.detectedContentType, OOXML_MIME.docx);
  const result = await extract("inspection.docx", docx);
  assert.equal(result.extractionMethod, "ooxml_wordprocessing");
  assert.equal(result.provenanceAnchors[0].paragraphIndex, 1);
  assert.match(result.normalizedText, /Forklift inspection/);

  const unsafe = makeDocx('<!DOCTYPE w:document [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><w:document xmlns:w="urn"><w:body><w:p><w:r><w:t>&xxe;</w:t></w:r></w:p></w:body></w:document>', true);
  const rejected = await extract("unsafe.docx", unsafe);
  assert.equal(rejected.extractionStatus, "failed");
  assert.match(rejected.warning, /DTD|entity/i);
});

test("XLSX extraction identifies sheets and cells without evaluating formulas", async () => {
  const xlsx = makeXlsx();
  const validation = validateUploadedFile({ buffer: xlsx, fileName: "register.xlsx", declaredContentType: OOXML_MIME.xlsx, maxBytes });
  assert.equal(validation.detectedContentType, OOXML_MIME.xlsx);
  const result = await extract("register.xlsx", xlsx);
  assert.equal(result.extractionMethod, "ooxml_spreadsheet");
  assert.equal(result.structuredContent.sheets[0].name, "Register");
  assert.equal(result.provenanceAnchors[0].sheet, "Register");
  assert.match(result.normalizedText, /A1: Permit/);
  assert.equal(result.documentMetadata.formulaCount, 1);
  assert.match(result.processingWarnings.join(" "), /not evaluated/i);
});

test("Office signature mismatches, generic ZIPs, macros, corrupt containers, and expansion limits fail closed", () => {
  const docx = makeDocx("Safe text");
  assert.throws(() => validateUploadedFile({ buffer: docx, fileName: "renamed.xlsx", declaredContentType: OOXML_MIME.xlsx, maxBytes }), (error) => error.code === "FILE_TYPE_MISMATCH");

  const genericZip = Buffer.from(zipSync({ "note.txt": strToU8("hello") }));
  assert.throws(() => validateUploadedFile({ buffer: genericZip, fileName: "note.docx", declaredContentType: OOXML_MIME.docx, maxBytes }), (error) => error.code === "ARCHIVE_NOT_ALLOWED");

  const macro = Buffer.from(zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8("<w:document xmlns:w=\"urn\"/>"),
    "word/vbaProject.bin": new Uint8Array([1, 2, 3])
  }));
  assert.throws(() => validateUploadedFile({ buffer: macro, fileName: "macro.docx", declaredContentType: OOXML_MIME.docx, maxBytes }), (error) => error.code === "OOXML_ACTIVE_CONTENT");

  assert.throws(() => validateUploadedFile({ buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]), fileName: "broken.docx", declaredContentType: OOXML_MIME.docx, maxBytes }), (error) => ["OOXML_INVALID_ZIP", "ARCHIVE_NOT_ALLOWED"].includes(error.code));

  const oversized = Buffer.from(zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": new Uint8Array(20 * 1024 * 1024 + 1)
  }, { level: 9 }));
  assert.throws(() => validateUploadedFile({ buffer: oversized, fileName: "large.docx", declaredContentType: OOXML_MIME.docx, maxBytes }), (error) => error.code === "OOXML_LIMIT_EXCEEDED");
});

test("image evidence remains explicitly OCR_REQUIRED", async () => {
  const image = await extract("scan.png", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  assert.equal(image.textExtractionStatus, "ocr_required");
  assert.equal(image.extractionStatus, "ocr_required");
  assert.equal(image.extractionMethod, "none");
});

test("image-only PDFs are OCR_REQUIRED and unsupported formats remain explicit", async () => {
  const pdf = await extract("scan.pdf", emptyPdf());
  assert.equal(pdf.textExtractionStatus, "ocr_required");
  assert.equal(pdf.extractionStatus, "ocr_required");
  assert.equal(pdf.documentMetadata.pageCount, 1);

  const unsupported = await extract("drawing.dwg", Buffer.from("synthetic drawing placeholder"));
  assert.equal(unsupported.textExtractionStatus, "unsupported_for_text_extraction");
  assert.equal(unsupported.extractionStatus, "unsupported");
});

async function extract(fileName, buffer) {
  return extractEvidenceText({ buffer, fileName, evidence, maxChars: 100_000, maxBytes });
}

function makeDocx(content, rawXml = false) {
  const document = rawXml ? content : `<w:document xmlns:w="urn"><w:body><w:p><w:r><w:t>${content}</w:t></w:r></w:p></w:body></w:document>`;
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(document)
  }));
}

function makeXlsx() {
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8('<workbook xmlns:r="rels"><sheets><sheet name="Register" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8("<sst><si><t>Permit</t></si><si><t>P-104</t></si></sst>"),
    "xl/worksheets/sheet1.xml": strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>')
  }));
}

function emptyPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream"
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
