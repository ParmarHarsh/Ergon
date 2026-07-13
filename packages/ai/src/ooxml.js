import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";

const ZIP_LOCAL_FILE = 0x04034b50;
const ZIP_CENTRAL_FILE = 0x02014b50;
const ZIP_EOCD = 0x06054b50;
const MAX_ENTRIES = 5_000;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_SINGLE_ENTRY_BYTES = 20 * 1024 * 1024;

export const OOXML_MIME = Object.freeze({
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
});

export function inspectOoxmlContainer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.readUInt32LE(0) !== ZIP_LOCAL_FILE) return null;
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw ooxmlError("OOXML_INVALID_ZIP", "The Office document container is incomplete or corrupt.");
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount > MAX_ENTRIES || centralOffset + centralSize > buffer.length) {
    throw ooxmlError("OOXML_LIMIT_EXCEEDED", "The Office document exceeds safe container limits.");
  }

  const entries = [];
  let expandedBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_FILE) {
      throw ooxmlError("OOXML_INVALID_ZIP", "The Office document has an invalid directory structure.");
    }
    const compressedBytes = buffer.readUInt32LE(offset + 20);
    const uncompressedBytes = buffer.readUInt32LE(offset + 24);
    const generalPurposeFlags = buffer.readUInt16LE(offset + 8);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length || uncompressedBytes > MAX_SINGLE_ENTRY_BYTES) {
      throw ooxmlError("OOXML_LIMIT_EXCEEDED", "The Office document contains an oversized part.");
    }
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8").replaceAll("\\", "/");
    const segments = name.split("/");
    if (!name || name.startsWith("/") || segments.some((segment) => ["..", "__proto__", "prototype", "constructor"].includes(segment)) || name.includes("\u0000")) {
      throw ooxmlError("OOXML_UNSAFE_PATH", "The Office document contains an unsafe internal path.");
    }
    if (generalPurposeFlags & 0x1) throw ooxmlError("OOXML_ENCRYPTED", "Encrypted Office containers cannot be extracted safely and require manual review.");
    expandedBytes += uncompressedBytes;
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw ooxmlError("OOXML_LIMIT_EXCEEDED", "The Office document expands beyond the 50 MB safety limit.");
    }
    entries.push({ name, compressedBytes, uncompressedBytes });
    offset = nameEnd + extraLength + commentLength;
  }

  const names = new Set(entries.map((entry) => entry.name));
  const kind = names.has("word/document.xml") ? "docx" : names.has("xl/workbook.xml") ? "xlsx" : null;
  if (!kind || !names.has("[Content_Types].xml")) return { kind: null, entries, expandedBytes };
  const macroPart = kind === "docx" ? "word/vbaProject.bin" : "xl/vbaProject.bin";
  if (names.has(macroPart)) throw ooxmlError("OOXML_ACTIVE_CONTENT", "Macro-enabled Office documents are not accepted as evidence.");
  return { kind, mime: OOXML_MIME[kind], entries, expandedBytes };
}

export function openOoxml(buffer, expectedKind) {
  const inspection = inspectOoxmlContainer(buffer);
  if (!inspection?.kind || inspection.kind !== expectedKind) {
    throw ooxmlError("OOXML_KIND_MISMATCH", "The Office document contents do not match its filename extension.");
  }
  let files;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch {
    throw ooxmlError("OOXML_INVALID_ZIP", "The Office document could not be decompressed safely.");
  }
  let actualExpandedBytes = 0;
  for (const bytes of Object.values(files)) {
    actualExpandedBytes += bytes.byteLength;
    if (bytes.byteLength > MAX_SINGLE_ENTRY_BYTES || actualExpandedBytes > MAX_EXPANDED_BYTES) {
      throw ooxmlError("OOXML_LIMIT_EXCEEDED", "The Office document expands beyond safe processing limits.");
    }
  }
  return { inspection, files };
}

export function parseOoxmlXml(bytes, partName) {
  if (!bytes) throw ooxmlError("OOXML_MISSING_PART", `The Office document is missing ${partName}.`);
  const xml = Buffer.from(bytes).toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw ooxmlError("OOXML_EXTERNAL_ENTITY", "Office documents containing DTD or entity declarations are not accepted.");
  }
  try {
    return new XMLParser({
      ignoreAttributes: false,
      preserveOrder: true,
      processEntities: false,
      trimValues: false
    }).parse(xml);
  } catch {
    throw ooxmlError("OOXML_INVALID_XML", `The Office document contains invalid XML in ${partName}.`);
  }
}

export function orderedNodesByName(nodes, name, output = []) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== "object") continue;
    if (Object.hasOwn(node, name)) output.push(node[name]);
    for (const [key, value] of Object.entries(node)) {
      if (key !== ":@" && Array.isArray(value)) orderedNodesByName(value, name, output);
    }
  }
  return output;
}

export function orderedElementsByName(nodes, name, output = []) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== "object") continue;
    if (Object.hasOwn(node, name)) output.push(node);
    for (const [key, value] of Object.entries(node)) {
      if (key !== ":@" && Array.isArray(value)) orderedElementsByName(value, name, output);
    }
  }
  return output;
}

export function orderedText(nodes) {
  const values = [];
  walk(nodes, (node) => {
    if (Object.hasOwn(node, "#text")) values.push(String(node["#text"]));
  });
  return values.join("");
}

export function orderedAttribute(node, name) {
  return node?.[":@"]?.[`@_${name}`] ?? null;
}

function walk(nodes, visitor) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== "object") continue;
    visitor(node);
    for (const [key, value] of Object.entries(node)) {
      if (key !== ":@" && Array.isArray(value)) walk(value, visitor);
    }
  }
}

function findEndOfCentralDirectory(buffer) {
  const floor = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= floor; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_EOCD) return offset;
  }
  return -1;
}

function ooxmlError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
