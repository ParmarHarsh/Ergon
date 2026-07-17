import path from "node:path";
import { PDFParse } from "pdf-parse";
import {
  openOoxml,
  orderedAttribute,
  orderedElementContent,
  orderedElementsByName,
  orderedNodesByName,
  orderedText,
  parseOoxmlXml
} from "./ooxml.js";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".log"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".tif", ".tiff", ".bmp"]);
const MAX_PDF_PAGES = 200;
const MAX_TEXT_LINES = 10_000;
const MAX_CSV_ROWS = 10_000;
const MAX_CSV_CELLS = 100_000;
const MAX_CELL_CHARS = 10_000;
const MAX_DOCX_BLOCKS = 10_000;
const MAX_XLSX_SHEETS = 100;
const MAX_XLSX_ROWS_PER_SHEET = 10_000;
const MAX_XLSX_CELLS = 100_000;
const MAX_XLSX_DATE_AUDIT_SAMPLES = 100;
const BUILT_IN_EXCEL_DATE_FORMATS = new Map([
  ...[14, 15, 16, 17, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58].map((id) => [id, "date"]),
  ...[18, 19, 20, 21, 45, 46, 47].map((id) => [id, "time"]),
  [22, "datetime"]
]);

export async function extractEvidenceText({ buffer = null, fileName = null, evidence, maxChars, maxBytes = Number.POSITIVE_INFINITY }) {
  const metadataText = [evidence.title, evidence.description].filter(Boolean).join("\n").trim();
  if (!buffer) return finalize({ metadataText, normalizedText: "", detectedFormat: "metadata", extractionMethod: "manual_metadata", textExtractionStatus: "manual_metadata_only", warnings: ["No source file was available; only manually entered metadata can be reviewed."] }, maxChars);
  if (buffer.byteLength > maxBytes) return finalize({ metadataText, normalizedText: "", detectedFormat: "unknown", extractionMethod: "none", textExtractionStatus: "extraction_failed", warnings: ["File exceeds the configured extraction size limit; manual review is required."] }, maxChars);

  const extension = path.extname(fileName || evidence.fileName || evidence.fileReference || "").toLowerCase();
  try {
    if (extension === ".pdf") return await extractPdf({ buffer, metadataText, maxChars });
    if (extension === ".csv") return extractCsv({ buffer, metadataText, maxChars });
    if (extension === ".docx") return extractDocx({ buffer, metadataText, maxChars });
    if (extension === ".xlsx") return extractXlsx({ buffer, metadataText, maxChars });
    if (IMAGE_EXTENSIONS.has(extension)) return finalize({
      metadataText,
      normalizedText: "",
      detectedFormat: extension.slice(1) || "image",
      extractionMethod: "none",
      textExtractionStatus: "ocr_required",
      warnings: ["Text could not be extracted from this image. OCR or manual review is required."]
    }, maxChars);
    if (!TEXT_EXTENSIONS.has(extension)) return finalize({
      metadataText,
      normalizedText: "",
      detectedFormat: extension.slice(1) || "unknown",
      extractionMethod: "none",
      textExtractionStatus: "unsupported_for_text_extraction",
      warnings: ["This file type does not support text extraction; manual review is required."]
    }, maxChars);
    return extractLines({ buffer, metadataText, maxChars, format: extension === ".md" ? "markdown" : "text" });
  } catch (error) {
    return finalize({
      metadataText,
      normalizedText: "",
      detectedFormat: extension.slice(1) || "unknown",
      extractionMethod: "none",
      textExtractionStatus: "extraction_failed",
      warnings: [safeExtractionMessage(error)]
    }, maxChars);
  }
}

function extractLines({ buffer, metadataText, maxChars, format }) {
  const decoded = decodeText(buffer);
  const allLines = decoded.split(/\r?\n/);
  const lines = allLines.slice(0, MAX_TEXT_LINES);
  const normalizedText = lines.join("\n").trim();
  const anchors = chunkLines(lines, format);
  const warnings = [];
  if (allLines.length > MAX_TEXT_LINES) warnings.push(`Only the first ${MAX_TEXT_LINES} lines were extracted.`);
  return finalize({
    metadataText,
    normalizedText,
    detectedFormat: format,
    extractionMethod: "utf8_text",
    textExtractionStatus: normalizedText ? "extracted" : "empty",
    provenanceAnchors: anchors,
    structuredContent: { kind: format, lineCount: lines.length },
    documentMetadata: { lineCount: lines.length },
    warnings
  }, maxChars);
}

function extractCsv({ buffer, metadataText, maxChars }) {
  const decoded = decodeText(buffer);
  const { rows: allRows, malformed } = parseCsv(decoded);
  const rows = allRows.slice(0, MAX_CSV_ROWS);
  const limitedRows = [];
  let cellCount = 0;
  let bounded = allRows.length > rows.length;
  for (const row of rows) {
    if (cellCount >= MAX_CSV_CELLS) { bounded = true; break; }
    const available = MAX_CSV_CELLS - cellCount;
    const cells = row.slice(0, available).map((cell) => cell.slice(0, MAX_CELL_CHARS));
    if (cells.length < row.length || cells.some((cell, index) => cell.length < row[index].length)) bounded = true;
    cellCount += cells.length;
    limitedRows.push(cells);
  }
  const normalizedText = limitedRows.map((row) => row.join(" | ")).join("\n").trim();
  const provenanceAnchors = limitedRows.map((row, index) => anchor(`csv-row-${index + 1}`, "row", `Row ${index + 1}`, row.join(" | "), { rowStart: index + 1, rowEnd: index + 1 }));
  const warnings = [];
  if (malformed) warnings.push("The CSV has an unterminated quoted field; extracted rows may be incomplete.");
  if (bounded) warnings.push("CSV extraction stopped at the configured row, cell, or cell-length limit.");
  return finalize({
    metadataText,
    normalizedText,
    detectedFormat: "csv",
    extractionMethod: "csv_parser",
    textExtractionStatus: normalizedText ? "extracted" : "empty",
    provenanceAnchors,
    structuredContent: { kind: "table", headers: limitedRows[0] || [], columns: Math.max(0, ...limitedRows.map((row) => row.length)), rows: limitedRows.length, previewRows: limitedRows.slice(0, 100) },
    documentMetadata: { rowCount: limitedRows.length, cellCount },
    warnings
  }, maxChars);
}

async function extractPdf({ buffer, metadataText, maxChars }) {
  if (buffer.byteLength < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("The PDF is corrupt or does not have a valid PDF header.");
  let parser;
  try {
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText({ first: MAX_PDF_PAGES });
    const pages = (result.pages || []).map((page) => ({ page: Number(page.num), text: cleanText(page.text) })).filter((page) => page.text);
    const normalizedText = pages.map((page) => page.text).join("\n\n").trim();
    if (!normalizedText) return finalize({ metadataText, normalizedText: "", detectedFormat: "pdf", extractionMethod: "pdf_text_layer", textExtractionStatus: "ocr_required", documentMetadata: { pageCount: Number.isInteger(result.total) ? result.total : null }, warnings: ["No text layer was found in this PDF. OCR or manual review is required."] }, maxChars);
    const provenanceAnchors = pages.map((page) => anchor(`pdf-page-${page.page}`, "page", `Page ${page.page}`, page.text, { page: page.page }));
    const warnings = [];
    if (Number(result.total) > MAX_PDF_PAGES) warnings.push(`Only the first ${MAX_PDF_PAGES} PDF pages were extracted.`);
    return finalize({ metadataText, normalizedText, detectedFormat: "pdf", extractionMethod: "pdf_text_layer", textExtractionStatus: "extracted", provenanceAnchors, structuredContent: { kind: "pages", pageCount: pages.length }, documentMetadata: { pageCount: Number.isInteger(result.total) ? result.total : null, extractedPageCount: pages.length }, warnings }, maxChars);
  } catch (error) {
    const encrypted = /password|encrypted/i.test(String(error?.message || ""));
    throw new Error(encrypted ? "The PDF is encrypted and could not be extracted; manual review is required." : "The PDF could not be read safely; OCR or manual review may be required.");
  } finally {
    if (parser) await parser.destroy().catch(() => {});
  }
}

function extractDocx({ buffer, metadataText, maxChars }) {
  const { files, inspection } = openOoxml(buffer, "docx");
  const document = parseOoxmlXml(files["word/document.xml"], "word/document.xml");
  const paragraphNodes = orderedNodesByName(document, "w:p").slice(0, MAX_DOCX_BLOCKS);
  const paragraphs = paragraphNodes.map((node) => cleanText(orderedText(node))).filter(Boolean);
  const normalizedText = paragraphs.join("\n");
  const provenanceAnchors = paragraphs.map((text, index) => anchor(`docx-paragraph-${index + 1}`, "paragraph", `Paragraph ${index + 1}`, text, { paragraphIndex: index + 1 }));
  const tableCount = orderedNodesByName(document, "w:tbl").length;
  const warnings = paragraphNodes.length >= MAX_DOCX_BLOCKS ? [`DOCX extraction stopped at ${MAX_DOCX_BLOCKS} paragraphs.`] : [];
  return finalize({ metadataText, normalizedText, detectedFormat: "docx", extractionMethod: "ooxml_wordprocessing", textExtractionStatus: normalizedText ? "extracted" : "empty", provenanceAnchors, structuredContent: { kind: "document", paragraphCount: paragraphs.length, tableCount }, documentMetadata: { paragraphCount: paragraphs.length, tableCount, expandedBytes: inspection.expandedBytes }, warnings }, maxChars);
}

function extractXlsx({ buffer, metadataText, maxChars }) {
  const { files, inspection } = openOoxml(buffer, "xlsx");
  const workbook = parseOoxmlXml(files["xl/workbook.xml"], "xl/workbook.xml");
  const dateContext = readWorkbookDateContext(files, workbook);
  const relationships = files["xl/_rels/workbook.xml.rels"] ? parseOoxmlXml(files["xl/_rels/workbook.xml.rels"], "xl/_rels/workbook.xml.rels") : [];
  const relationshipTargets = new Map(orderedElementsByName(relationships, "Relationship").map((node) => [orderedAttribute(node, "Id"), orderedAttribute(node, "Target")]));
  const sharedStrings = files["xl/sharedStrings.xml"] ? orderedNodesByName(parseOoxmlXml(files["xl/sharedStrings.xml"], "xl/sharedStrings.xml"), "si").map((node) => orderedText(node)) : [];
  const sheetElements = orderedElementsByName(workbook, "sheet").slice(0, MAX_XLSX_SHEETS);
  const sheetSummaries = [];
  const anchors = [];
  const textRows = [];
  let totalCells = 0;
  let formulaCount = 0;
  let normalizedDateCellCount = 0;
  const normalizedDateSamples = [];
  let bounded = orderedElementsByName(workbook, "sheet").length > MAX_XLSX_SHEETS;

  for (let sheetIndex = 0; sheetIndex < sheetElements.length && totalCells < MAX_XLSX_CELLS; sheetIndex += 1) {
    const sheetElement = sheetElements[sheetIndex];
    const sheetName = orderedAttribute(sheetElement, "name") || `Sheet ${sheetIndex + 1}`;
    const relationshipId = orderedAttribute(sheetElement, "r:id");
    const target = relationshipTargets.get(relationshipId) || `worksheets/sheet${sheetIndex + 1}.xml`;
    const partName = normalizeWorkbookTarget(target);
    if (!files[partName]) continue;
    const sheet = parseOoxmlXml(files[partName], partName);
    const rowElements = orderedElementsByName(sheet, "row");
    const rows = [];
    for (const rowElement of rowElements.slice(0, MAX_XLSX_ROWS_PER_SHEET)) {
      if (totalCells >= MAX_XLSX_CELLS) { bounded = true; break; }
      const values = [];
      const cells = orderedElementsByName(orderedElementContent(rowElement, "row"), "c");
      for (const cell of cells) {
        if (totalCells >= MAX_XLSX_CELLS) { bounded = true; break; }
        const type = orderedAttribute(cell, "t");
        const styleIndex = parseNonNegativeInteger(orderedAttribute(cell, "s"));
        const cellContent = orderedElementContent(cell, "c");
        if (orderedNodesByName(cellContent, "f").length) formulaCount += 1;
        const reference = orderedAttribute(cell, "r") || null;
        const raw = orderedNodesByName(cellContent, type === "inlineStr" ? "is" : "v")[0];
        let value = cleanText(raw ? orderedText(raw) : "");
        if (type === "s" && /^\d+$/.test(value)) value = sharedStrings[Number(value)] ?? "";
        if (type === "b") value = value === "1" ? "true" : value === "0" ? "false" : "";
        if ((!type || type === "n") && value && styleIndex !== null) {
          const dateFormat = dateContext.styles[styleIndex] || null;
          if (dateFormat) {
            const normalized = normalizeExcelDateValue(value, dateContext.dateSystem, dateFormat);
            if (normalized.value) {
              if (normalizedDateSamples.length < MAX_XLSX_DATE_AUDIT_SAMPLES) {
                normalizedDateSamples.push({ sheet: sheetName, cell: reference, rawValue: value, normalizedValue: normalized.value, format: dateFormat });
              }
              value = normalized.value;
              normalizedDateCellCount += 1;
            } else if (normalized.warning) {
              dateContext.warnings.push(`${sheetName} ${reference || "cell"}: ${normalized.warning}`);
            }
          }
        }
        if (value.length > MAX_CELL_CHARS) bounded = true;
        value = value.slice(0, MAX_CELL_CHARS);
        if (value) values.push({ reference, value });
        totalCells += 1;
      }
      if (values.length) {
        const rowNumber = Number(orderedAttribute(rowElement, "r")) || rows.length + 1;
        const text = values.map((cell) => `${cell.reference || "cell"}: ${cell.value}`).join(" | ");
        rows.push({ rowNumber, text, firstCell: values[0].reference, lastCell: values.at(-1).reference });
        textRows.push(`${sheetName} — row ${rowNumber}: ${text}`);
        anchors.push(anchor(`xlsx-${sheetIndex + 1}-row-${rowNumber}`, "sheet_row", `${sheetName}, row ${rowNumber}`, text, { sheet: sheetName, rowStart: rowNumber, rowEnd: rowNumber, cellRange: [values[0].reference, values.at(-1).reference].filter(Boolean).join(":") || null }));
      }
    }
    if (rowElements.length > MAX_XLSX_ROWS_PER_SHEET) bounded = true;
    sheetSummaries.push({ name: sheetName, rowCount: rows.length });
  }
  const normalizedText = textRows.join("\n");
  const warnings = [...dateContext.warnings];
  if (bounded) warnings.push("XLSX extraction stopped at the configured sheet, row, cell, or cell-length limit.");
  if (formulaCount) warnings.push(`${formulaCount} formula cell(s) were not evaluated; only stored cached values were considered.`);
  return finalize({
    metadataText,
    normalizedText,
    detectedFormat: "xlsx",
    extractionMethod: "ooxml_spreadsheet",
    textExtractionStatus: normalizedText ? "extracted" : "empty",
    provenanceAnchors: anchors,
    structuredContent: { kind: "workbook", sheets: sheetSummaries },
    documentMetadata: {
      sheetCount: sheetSummaries.length,
      cellCount: totalCells,
      formulaCount,
      expandedBytes: inspection.expandedBytes,
      excelDateSystem: dateContext.dateSystem,
      normalizedDateCellCount,
      normalizedDateSamples
    },
    warnings
  }, maxChars);
}

function finalize({ metadataText, normalizedText, detectedFormat, extractionMethod, textExtractionStatus, provenanceAnchors = [], structuredContent = {}, documentMetadata = {}, warnings = [] }, maxChars) {
  const clean = cleanText(normalizedText);
  const combined = [metadataText, clean].filter(Boolean).join("\n");
  const truncated = combined.length > maxChars;
  const warningList = [...warnings];
  if (truncated) warningList.push(`Normalized text was bounded to ${maxChars} characters for downstream analysis.`);
  const boundedText = combined.slice(0, maxChars);
  const extractionStatus = textExtractionStatus === "extracted"
    ? (truncated || warningList.some((warning) => /Only|stopped/i.test(warning)) ? "partial" : "extracted")
    : textExtractionStatus === "ocr_required" ? "ocr_required"
      : textExtractionStatus === "unsupported_for_text_extraction" ? "unsupported"
        : ["extraction_failed"].includes(textExtractionStatus) ? "failed" : textExtractionStatus;
  return {
    text: boundedText,
    normalizedText: clean.slice(0, maxChars),
    textExtractionStatus,
    extractionStatus,
    extractionMethod,
    detectedFormat,
    truncated,
    warning: warningList[0] || null,
    processingWarnings: warningList,
    provenanceAnchors,
    structuredContent,
    documentMetadata,
    deterministicProfile: buildDeterministicProfile(clean, detectedFormat, documentMetadata, warningList)
  };
}

function buildDeterministicProfile(text, format, documentMetadata, warnings) {
  const dates = uniqueMatches(text, /\b(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.](?:0?[1-9]|[12]\d|3[01])\b/g, 50);
  const identifiers = uniqueMatches(text, /\b(?:permit|certificate|record|report|policy|procedure|inspection|audit)\s*(?:no\.?|number|#|id)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9._/-]{2,}\b/gi, 50);
  return {
    format,
    characterCount: text.length,
    wordCount: text ? text.split(/\s+/).length : 0,
    dates,
    identifiers,
    documentMetadata,
    quality: { hasExtractableText: Boolean(text), partial: warnings.length > 0, warnings }
  };
}

function chunkLines(lines, format) {
  const anchors = [];
  for (let start = 0; start < lines.length; start += 50) {
    const end = Math.min(lines.length, start + 50);
    const text = lines.slice(start, end).join("\n").trim();
    if (text) anchors.push(anchor(`${format}-lines-${start + 1}-${end}`, "line_range", `Lines ${start + 1}–${end}`, text, { lineStart: start + 1, lineEnd: end }));
  }
  return anchors;
}

function anchor(id, type, label, text, location) {
  return { id, type, label, ...location, excerpt: cleanText(text).slice(0, 240) };
}

function decodeText(buffer) {
  if (buffer.includes(0)) throw new Error("The text file contains binary data and could not be decoded safely.");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replaceAll("\u0000", ""); }
  catch { throw new Error("The text file is not valid UTF-8 and requires manual review."); }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return { rows, malformed: quoted };
}

function normalizeWorkbookTarget(target) {
  const normalized = String(target || "").replaceAll("\\", "/").replace(/^\//, "");
  if (normalized.startsWith("../") || normalized.split("/").includes("..")) throw new Error("The workbook contains an unsafe relationship path.");
  return normalized.startsWith("xl/") ? normalized : `xl/${normalized}`;
}

function readWorkbookDateContext(files, workbook) {
  const workbookProperties = orderedElementsByName(workbook, "workbookPr")[0] || null;
  const date1904 = String(orderedAttribute(workbookProperties, "date1904") || "").toLowerCase();
  const dateSystem = ["1", "true"].includes(date1904) ? 1904 : 1900;
  const context = { dateSystem, styles: [], warnings: [] };
  if (!files["xl/styles.xml"]) return context;

  try {
    const styles = parseOoxmlXml(files["xl/styles.xml"], "xl/styles.xml");
    const customFormats = new Map();
    for (const format of orderedElementsByName(styles, "numFmt")) {
      const id = parseNonNegativeInteger(orderedAttribute(format, "numFmtId"));
      const code = orderedAttribute(format, "formatCode");
      if (id === null || typeof code !== "string") {
        context.warnings.push("A malformed custom XLSX number format was ignored; affected numeric values were preserved.");
        continue;
      }
      customFormats.set(id, code);
    }
    const cellFormats = orderedElementsByName(styles, "cellXfs")[0];
    if (!cellFormats) return context;
    const formatElements = orderedElementsByName(orderedElementContent(cellFormats, "cellXfs"), "xf");
    context.styles = formatElements.map((format) => {
      const id = parseNonNegativeInteger(orderedAttribute(format, "numFmtId"));
      if (id === null) {
        context.warnings.push("A malformed XLSX cell style was ignored; affected numeric values were preserved.");
        return null;
      }
      return excelDateFormatKind(id, customFormats.get(id));
    });
  } catch {
    context.warnings.push("XLSX style metadata could not be read safely; numeric values were preserved without date conversion.");
  }
  return context;
}

function excelDateFormatKind(numberFormatId, customFormatCode) {
  if (BUILT_IN_EXCEL_DATE_FORMATS.has(numberFormatId)) return BUILT_IN_EXCEL_DATE_FORMATS.get(numberFormatId);
  if (!customFormatCode) return null;
  const code = String(customFormatCode)
    .toLowerCase()
    .replace(/"[^"]*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[(?!h+\]|m+\]|s+\])[^\]]*\]/g, "")
    .replace(/_.|\*./g, "");
  const hasYearOrDay = /[yd]/.test(code);
  const hasTime = /h|s|\[h+\]|\[m+\]|\[s+\]/.test(code) || /m+\s*:|:\s*m+/.test(code);
  if (hasYearOrDay && hasTime) return "datetime";
  if (hasYearOrDay) return "date";
  if (hasTime) return "time";
  return null;
}

function normalizeExcelDateValue(rawValue, dateSystem, format) {
  if (!/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(rawValue)) return { value: null, warning: null };
  const serial = Number(rawValue);
  if (!Number.isFinite(serial) || serial < 0) return { value: null, warning: "A styled date value was outside the supported Excel serial range and was preserved." };
  const wholeDays = Math.floor(serial);
  const fraction = serial - wholeDays;
  if (format !== "time" && dateSystem === 1900 && wholeDays === 60) {
    return { value: null, warning: "Excel's non-existent 1900-02-29 serial was preserved for human review." };
  }

  if (format === "time") return { value: formatExcelTime(fraction), warning: null };
  const epoch = dateSystem === 1904
    ? Date.UTC(1904, 0, 1)
    : wholeDays < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const milliseconds = Math.round((wholeDays + fraction) * 86_400_000);
  const date = new Date(epoch + milliseconds);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 100 || date.getUTCFullYear() > 9999) {
    return { value: null, warning: "A styled date value was outside the supported calendar range and was preserved." };
  }
  const isoDate = date.toISOString().slice(0, 10);
  return { value: format === "datetime" ? `${isoDate}T${formatExcelTime(fraction)}` : isoDate, warning: null };
}

function formatExcelTime(fraction) {
  const milliseconds = Math.round(fraction * 86_400_000) % 86_400_000;
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;
  const base = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  return remainder ? `${base}.${String(remainder).padStart(3, "0")}` : base;
}

function parseNonNegativeInteger(value) {
  if (!/^\d+$/.test(String(value ?? ""))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function cleanText(value) {
  return String(value || "").replaceAll("\u0000", "").replace(/[\t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function uniqueMatches(text, pattern, limit) {
  return [...new Set(String(text || "").match(pattern) || [])].slice(0, limit);
}

function safeExtractionMessage(error) {
  const allowed = String(error?.message || "The file could not be extracted safely.");
  return allowed.slice(0, 300);
}
