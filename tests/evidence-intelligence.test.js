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

test("XLSX extraction accepts namespace-prefixed direct strings and empty shared strings", async () => {
  const xlsx = makeAcceptanceStyleXlsx();
  const result = await extract("inspection-register.xlsx", xlsx);

  assert.equal(result.detectedFormat, "xlsx");
  assert.equal(result.textExtractionStatus, "extracted");
  assert.equal(result.structuredContent.sheets.length, 3);
  assert.deepEqual(result.structuredContent.sheets.map((sheet) => sheet.name), ["Inspection Log", "Corrective Actions", "Summary"]);
  assert.match(result.normalizedText, /A1: Inspection ID/);
  assert.match(result.normalizedText, /B2: Northern Precision Components - Plant A/);
  assert.match(result.normalizedText, /A1: Corrective Actions/);
  assert.match(result.normalizedText, /C3: 6/);
  assert.match(result.normalizedText, /B3: true/);
  assert.match(result.normalizedText, /E3: 2026-07-14/);
  assert.doesNotMatch(result.normalizedText, /COUNTA/);
  assert.doesNotMatch(result.normalizedText, /D3:/);
  assert.equal(result.documentMetadata.formulaCount, 3);
  assert.equal(result.documentMetadata.cellCount, 13);
  assert.equal(result.deterministicProfile.wordCount, 62);
  assert.equal(result.provenanceAnchors.length, 5);
  assert.equal(result.provenanceAnchors[0].sheet, "Inspection Log");
  assert.equal(result.provenanceAnchors[0].cellRange, "A1:B1");
  assert.match(result.processingWarnings.join(" "), /not evaluated/i);
});

test("XLSX extraction normalizes styled 1900-system dates without converting ordinary numbers", async () => {
  const result = await extract("styled-dates.xlsx", makeStyledDateXlsx({ date1904: false }));

  assert.match(result.normalizedText, /A1: 1900-01-01/);
  assert.match(result.normalizedText, /B1: 1900-02-28/);
  assert.match(result.normalizedText, /C1: 1900-03-01/);
  assert.match(result.normalizedText, /D1: 2024-01-01/);
  assert.match(result.normalizedText, /E1: 42/);
  assert.match(result.normalizedText, /F1: 7319/);
  assert.match(result.normalizedText, /G1: 12\.5/);
  assert.match(result.normalizedText, /H1: 2024-01-02/);
  assert.match(result.normalizedText, /I1: 6/);
  assert.match(result.normalizedText, /J1: 2024-01-01T12:00:00/);
  assert.match(result.normalizedText, /K1: 60/);
  assert.match(result.normalizedText, /L1: 45292/);
  assert.doesNotMatch(result.normalizedText, /F1: \d{4}-\d{2}-\d{2}/);
  assert.equal(result.documentMetadata.excelDateSystem, 1900);
  assert.equal(result.documentMetadata.normalizedDateCellCount, 6);
  assert.deepEqual(result.documentMetadata.normalizedDateSamples[0], {
    sheet: "Dates", cell: "A1", rawValue: "1", normalizedValue: "1900-01-01", format: "date"
  });
  assert.match(result.processingWarnings.join(" "), /non-existent 1900-02-29/);
  assert.match(result.processingWarnings.join(" "), /malformed XLSX cell style/);
  assert.equal(result.documentMetadata.formulaCount, 2);
  assert.doesNotMatch(result.normalizedText, /TODAY|SUM/);
});

test("XLSX extraction supports the 1904 date system and custom date formats", async () => {
  const result = await extract("styled-dates-1904.xlsx", makeStyledDateXlsx({ date1904: true, compact: true }));

  assert.match(result.normalizedText, /A1: 1904-01-01/);
  assert.match(result.normalizedText, /B1: 1904-01-02/);
  assert.match(result.normalizedText, /C1: 1904-01-03T06:00:00/);
  assert.match(result.normalizedText, /D1: 99/);
  assert.equal(result.documentMetadata.excelDateSystem, 1904);
  assert.equal(result.documentMetadata.normalizedDateCellCount, 3);
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

function makeAcceptanceStyleXlsx() {
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8('<x:workbook xmlns:x="urn:sheet" xmlns:r="urn:rels"><x:sheets><x:sheet name="Inspection Log" sheetId="1" r:id="inspectionRel"/><x:sheet name="Corrective Actions" sheetId="2" r:id="actionsRel"/><x:sheet name="Summary" sheetId="3" r:id="summaryRel"/></x:sheets></x:workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="summaryRel" Target="worksheets/summary.xml"/><Relationship Id="inspectionRel" Target="worksheets/inspection.xml"/><Relationship Id="actionsRel" Target="worksheets/actions.xml"/></Relationships>'),
    "xl/sharedStrings.xml": strToU8('<x:sst xmlns:x="urn:sheet"></x:sst>'),
    "xl/worksheets/inspection.xml": strToU8('<x:worksheet xmlns:x="urn:sheet"><x:sheetData><x:row r="1"><x:c r="A1" t="str"><x:v>Inspection ID</x:v></x:c><x:c r="B1" t="str"><x:v>Facility</x:v></x:c></x:row><x:row r="2"><x:c r="A2" t="inlineStr"><x:is><x:t>INSP-001</x:t></x:is></x:c><x:c r="B2" t="str"><x:v>Northern Precision Components - Plant A</x:v></x:c></x:row><x:row r="3"><x:c r="A3" t="n"><x:v>42</x:v></x:c><x:c r="B3" t="b"><x:v>1</x:v></x:c><x:c r="C3" t="n"><x:f>COUNTA(A2:A100)</x:f><x:v>6</x:v></x:c><x:c r="D3" t="n"><x:f>SUM(A1:A2)</x:f></x:c><x:c r="E3" t="d"><x:v>2026-07-14</x:v></x:c></x:row></x:sheetData></x:worksheet>'),
    "xl/worksheets/actions.xml": strToU8('<x:worksheet xmlns:x="urn:sheet"><x:sheetData><x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:r><x:t>Corrective </x:t></x:r><x:r><x:t>Actions</x:t></x:r></x:is></x:c><x:c r="B1" t="str"><x:v>Owner</x:v></x:c></x:row></x:sheetData></x:worksheet>'),
    "xl/worksheets/summary.xml": strToU8('<x:worksheet xmlns:x="urn:sheet"><x:sheetData><x:row r="1"><x:c r="A1" t="str"><x:v>Summary</x:v></x:c><x:c r="B1" t="n"><x:f>COUNTA(A1:A10)</x:f><x:v>1</x:v></x:c></x:row></x:sheetData></x:worksheet>')
  }));
}

function makeStyledDateXlsx({ date1904, compact = false }) {
  const workbookProperties = date1904 ? '<workbookPr date1904="1"/>' : '<workbookPr date1904="0"/>';
  const row = compact
    ? '<row r="1"><c r="A1" s="1"><v>0</v></c><c r="B1" s="2"><v>1</v></c><c r="C1" s="3"><v>2.25</v></c><c r="D1"><v>99</v></c></row>'
    : '<row r="1"><c r="A1" s="1"><v>1</v></c><c r="B1" s="1"><v>59</v></c><c r="C1" s="1"><v>61</v></c><c r="D1" s="2"><v>45292</v></c><c r="E1"><v>42</v></c><c r="F1"><v>7319</v></c><c r="G1"><v>12.5</v></c><c r="H1" s="1"><f>TODAY()</f><v>45293</v></c><c r="I1"><f>SUM(E1:G1)</f><v>6</v></c><c r="J1" s="3"><v>45292.5</v></c><c r="K1" s="1"><v>60</v></c><c r="L1" s="4"><v>45292</v></c></row>';
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8(`<workbook xmlns:r="rels">${workbookProperties}<sheets><sheet name="Dates" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/styles.xml": strToU8('<styleSheet><numFmts count="2"><numFmt numFmtId="165" formatCode="dd-mmm-yyyy"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts><cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="165"/><xf numFmtId="166"/><xf numFmtId="bad"/></cellXfs></styleSheet>'),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${row}</sheetData></worksheet>`)
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
