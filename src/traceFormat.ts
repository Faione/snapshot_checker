import type { PerfData, RecordSample } from "./types.js";

/**
 * perf trace 事件 format 段中的单字段描述（与 sample/trace_format 一致）
 */
export interface TraceFormatField {
  /** 完整类型串，如 "unsigned short"、"int" */
  typeName: string;
  /** 字段名，如 common_type、args[6] */
  name: string;
  offset: number;
  size: number;
  signed: boolean;
}

export interface ParsedTraceFormat {
  eventName?: string;
  eventId?: number;
  printFmt?: string;
  printArgs?: string[];
  fields: TraceFormatField[];
}

export interface TraceParserRegistry {
  byEventId: Map<number, ParsedTraceFormat>;
  commonFormat?: ParsedTraceFormat;
}

export interface DecodedRawSample {
  sampleIndex: number;
  commonType?: number;
  commonFields: Record<string, number | bigint>;
  eventName?: string;
  renderedText?: string;
  skipped: boolean;
}

export interface DecodePerfRawDataOptions {
  /** 是否在替换后的 raw 内容中保留 common_* 信息 */
  keepCommonFields?: boolean;
}

export type Endian = "le" | "be";

const FIELD_LINE_RE =
  /^\s*field:([^;]+);\s*offset:(\d+);\s*size:(\d+);\s*signed:([01]);/;

function splitTypeAndName(rest: string): { typeName: string; name: string } {
  const trimmed = rest.trim();
  const m = trimmed.match(/^(.+?)\s+(\w+(?:\[[^\]]*])?)$/);
  if (!m) {
    return { typeName: trimmed, name: trimmed };
  }
  return { typeName: m[1].trim(), name: m[2] };
}

/**
 * 解析 sample/trace_format 风格的文本，得到字段列表
 */
export function parseTraceFormat(text: string): ParsedTraceFormat {
  const lines = text.split(/\r?\n/);
  let eventName: string | undefined;
  let eventId: number | undefined;
  const fields: TraceFormatField[] = [];
  let printFmt: string | undefined;
  let printArgs: string[] | undefined;
  let inFormat = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    if (!inFormat) {
      const nameM = t.match(/^name:\s*(.+)$/);
      if (nameM) {
        eventName = nameM[1].trim();
        continue;
      }
      const idM = t.match(/^ID:\s*(\d+)\s*$/);
      if (idM) {
        eventId = parseInt(idM[1], 10);
        continue;
      }
      if (t.startsWith("format:")) {
        inFormat = true;
        continue;
      }
      continue;
    }

    if (t.startsWith("print fmt:")) {
      const pf = t.match(/^print fmt:\s*"([^"]*)"\s*(?:,\s*(.*))?$/);
      if (pf) {
        printFmt = pf[1];
        const argsPart = pf[2];
        if (argsPart) {
          const exprs = argsPart.match(/REC->[^,]+/g);
          printArgs = exprs ? exprs.map((s) => s.trim()) : [];
        } else {
          printArgs = [];
        }
      }
      break;
    }

    const fm = line.match(FIELD_LINE_RE);
    if (!fm) continue;
    const { typeName, name } = splitTypeAndName(fm[1]);
    fields.push({
      typeName,
      name,
      offset: parseInt(fm[2], 10),
      size: parseInt(fm[3], 10),
      signed: fm[4] === "1",
    });
  }

  return { eventName, eventId, printFmt, printArgs, fields };
}

function normalizeType(t: string): string {
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * 从 little-endian 原始缓冲区按字段描述读一个标量
 */
function readFieldScalar(
  view: DataView,
  field: TraceFormatField,
): number | bigint | undefined {
  const { offset, size, signed, typeName } = field;
  if (offset + size > view.byteLength) return undefined;

  const t = normalizeType(typeName);

  if (size === 1) {
    if (signed || t === "signed char") {
      return view.getInt8(offset);
    }
    return view.getUint8(offset);
  }
  if (size === 2) {
    if (signed || t === "short") {
      return view.getInt16(offset, true);
    }
    return view.getUint16(offset, true);
  }
  if (size === 4) {
    if (t.includes("float")) {
      return view.getFloat32(offset, true);
    }
    if (signed || t === "int" || t === "long" /* 32-bit 内核上 */) {
      return view.getInt32(offset, true);
    }
    return view.getUint32(offset, true);
  }
  if (size === 8) {
    if (t.includes("double")) {
      return view.getFloat64(offset, true);
    }
    if (signed || t === "long" || t === "long long" || t === "__s64") {
      return view.getBigInt64(offset, true);
    }
    return view.getBigUint64(offset, true);
  }

  return undefined;
}

function parseArrayName(name: string): { baseName: string; len: number } | undefined {
  const m = name.match(/^(\w+)\[(\d+)\]$/);
  if (!m) return undefined;
  return { baseName: m[1], len: parseInt(m[2], 10) };
}

function readFieldValue(
  view: DataView,
  field: TraceFormatField,
): number | bigint | Array<number | bigint> | undefined {
  const arr = parseArrayName(field.name);
  if (!arr) return readFieldScalar(view, field);
  if (arr.len <= 0) return [];
  const elemSize = Math.floor(field.size / arr.len);
  if (elemSize <= 0) return undefined;
  const values: Array<number | bigint> = [];
  for (let i = 0; i < arr.len; i++) {
    const elemField: TraceFormatField = {
      ...field,
      name: arr.baseName,
      offset: field.offset + i * elemSize,
      size: elemSize,
    };
    const v = readFieldScalar(view, elemField);
    if (v === undefined) return undefined;
    values.push(v);
  }
  return values;
}

/**
 * 仅解析 format 中 common_* 字段（按 offset/size/signed，小端）
 */
export function parseCommonFieldsFromRaw(
  raw: Uint8Array,
  format: ParsedTraceFormat,
): Record<string, number | bigint> {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out: Record<string, number | bigint> = {};

  for (const field of format.fields) {
    if (!field.name.startsWith("common_")) continue;
    const v = readFieldScalar(view, field);
    if (v !== undefined) {
      out[field.name] = v;
    }
  }

  return out;
}

/**
 * 解析 format 中全部字段（含数组），数组字段名会去掉 []，如 args[6] => args: [...]
 */
export function parseAllFieldsFromRaw(
  raw: Uint8Array,
  format: ParsedTraceFormat,
): Record<string, number | bigint | string | Array<number | bigint>> {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const out: Record<string, number | bigint | string | Array<number | bigint>> = {};
  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (const field of format.fields) {
    const arr = parseArrayName(field.name);
    const key = arr ? arr.baseName : field.name;

    const t = normalizeType(field.typeName);
    // __data_loc char[] reason: 实际存一个 u32，低 16 位为 offset，高 16 位为 length
    if (t.includes("__data_loc") && t.includes("char")) {
      const locField: TraceFormatField = {
        ...field,
        typeName: "unsigned int",
        signed: false,
        size: 4,
      };
      const loc = readFieldScalar(view, locField);
      if (typeof loc === "number") {
        const locKey = `__data_loc_${field.name}`;
        out[locKey] = loc;
        const offset = loc & 0xffff;
        const len = (loc >>> 16) & 0xffff;
        if (offset >= 0 && len > 0 && offset + len <= raw.length) {
          const bytes = raw.slice(offset, offset + len);
          // 去掉末尾 \0
          const nul = bytes.indexOf(0);
          const slice = nul >= 0 ? bytes.slice(0, nul) : bytes;
          out[field.name] = decoder.decode(slice);
        } else {
          out[field.name] = "";
        }
      }
      continue;
    }

    const v = readFieldValue(view, field);
    if (v !== undefined) {
      out[key] = v;
    }
  }
  return out;
}

/**
 * 将 perf 文本里 raw 段的 hex 行拼成连续字节（小端）。
 *
 * 规则：每行视为一个整数 token（如 0x12345678），按该 token 的字节宽度转成 LE 字节序。
 * 例如：0x12345678 => [0x78, 0x56, 0x34, 0x12]
 */
export function rawHexLinesToBuffer(
  lines: Array<{ hex: string }>,
  endian: Endian = "le",
): Uint8Array {
  const chunks: number[] = [];
  for (const { hex } of lines) {
    let s = hex.replace(/^0x/i, "").trim();
    if (!s) continue;
    if (s.length % 2 === 1) s = "0" + s;
    const byteLen = s.length / 2;
    let value = BigInt("0x" + s);
    if (endian === "le") {
      for (let i = 0; i < byteLen; i++) {
        chunks.push(Number((value >> BigInt(8 * i)) & 0xffn));
      }
    } else {
      for (let i = byteLen - 1; i >= 0; i--) {
        chunks.push(Number((value >> BigInt(8 * i)) & 0xffn));
      }
    }
  }
  return Uint8Array.from(chunks);
}

/**
 * 将字节缓冲按小端编码为 raw hex 行。
 * 默认每行 4 字节（即 8 hex digits）。
 */
export function bufferToRawHexLines(
  raw: Uint8Array,
  bytesPerLine = 4,
  endian: Endian = "le",
): Array<{ hex: string }> {
  if (bytesPerLine <= 0) return [];
  const out: Array<{ hex: string }> = [];
  for (let i = 0; i < raw.length; i += bytesPerLine) {
    const end = Math.min(i + bytesPerLine, raw.length);
    let value = 0n;
    if (endian === "le") {
      for (let j = 0; j < end - i; j++) {
        value |= BigInt(raw[i + j]) << BigInt(8 * j);
      }
    } else {
      for (let j = 0; j < end - i; j++) {
        value = (value << 8n) | BigInt(raw[i + j]);
      }
    }
    const width = (end - i) * 2;
    out.push({ hex: "0x" + value.toString(16).padStart(width, "0") });
  }
  return out;
}

/**
 * 从多个 trace_format 文本构建解析器集合（按 event ID 索引）
 */
export function buildTraceParserRegistry(formatTexts: string[]): TraceParserRegistry {
  const byEventId = new Map<number, ParsedTraceFormat>();
  let commonFormat: ParsedTraceFormat | undefined;
  for (const text of formatTexts) {
    const fmt = parseTraceFormat(text);
    if (fmt.eventId !== undefined) {
      byEventId.set(fmt.eventId, fmt);
      if (!commonFormat && fmt.fields.some((f) => f.name === "common_type")) {
        commonFormat = fmt;
      }
    }
  }
  return { byEventId, commonFormat };
}

function formatArgBySpecifier(value: number | bigint | string, spec: string): string {
  if (spec.toLowerCase() === "s") {
    return typeof value === "string" ? value : String(value);
  }
  const isBig = typeof value === "bigint";
  const lower = spec.toLowerCase();
  if (lower === "x") {
    return isBig ? value.toString(16) : Math.trunc(value as number).toString(16);
  }
  if (lower === "u") {
    if (isBig) return ((value as bigint) < 0n ? 0n : (value as bigint)).toString(10);
    return Math.max(0, Math.trunc(value as number)).toString(10);
  }
  return isBig ? (value as bigint).toString(10) : Math.trunc(value as number).toString(10);
}

function renderPrintFmt(
  printFmt: string,
  printArgs: string[] | undefined,
  fieldMap: Record<string, number | bigint | string | Array<number | bigint>>,
): string {
  const values: Array<number | bigint | string> = [];

  function evalExpr(exprRaw: string): number | bigint | string {
    // 允许表达式带括号与空格
    let expr = exprRaw.trim();
    // 去掉外层括号（可能不止一层，也可能只有一侧被 match 捕获到）
    while (expr.startsWith("(")) expr = expr.slice(1).trim();
    while (expr.endsWith(")")) expr = expr.slice(0, -1).trim();
    expr = expr.replace(/\s+/g, "");

    // (REC->__data_loc_reason&0xffff) / (REC->__data_loc_reason>>16)
    let m = expr.match(/^REC->(\w+)&0xffff$/);
    if (m) {
      const v = fieldMap[m[1]];
      const n = typeof v === "number" ? v : 0;
      return n & 0xffff;
    }
    m = expr.match(/^REC->(\w+)>>16$/);
    if (m) {
      const v = fieldMap[m[1]];
      const n = typeof v === "number" ? v : 0;
      return (n >>> 16) & 0xffff;
    }

    // REC->field 或 REC->field[idx]
    m = expr.match(/^REC->(\w+)(?:\[(\d+)])?$/);
    if (!m) return 0;
    const name = m[1];
    const idxRaw = m[2];
    const v = fieldMap[name];
    if (idxRaw !== undefined) {
      const idx = parseInt(idxRaw, 10);
      if (Array.isArray(v) && idx >= 0 && idx < v.length) {
        return v[idx];
      }
      return 0;
    }
    if (Array.isArray(v)) return v[0] ?? 0;
    return v ?? 0;
  }

  for (const expr of printArgs ?? []) {
    values.push(evalExpr(expr));
  }

  let valueIdx = 0;
  return printFmt.replace(/%[0-9]*[lh]*([duxXsS])/g, (_all, spec: string) => {
    const v = values[valueIdx++] ?? 0;
    return formatArgBySpecifier(v, spec);
  });
}

/**
 * 对一条 raw 数据先解 common_*，再按 common_type 选择解析器，最后按 print fmt 渲染。
 * 找不到解析器时返回 skipped=true，并打印 common_type。
 */
export function decodeRawByRegistry(
  raw: Uint8Array,
  registry: TraceParserRegistry,
): Omit<DecodedRawSample, "sampleIndex"> {
  const commonType = raw.length >= 2 ? Number(new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint16(0, true)) : undefined;
  const commonFields =
    registry.commonFormat !== undefined
      ? parseCommonFieldsFromRaw(raw, registry.commonFormat)
      : {};
  const commonTypeFromFields = commonFields.common_type;
  const eventId =
    typeof commonTypeFromFields === "bigint"
      ? Number(commonTypeFromFields)
      : typeof commonTypeFromFields === "number"
      ? commonTypeFromFields
      : commonType;

  if (eventId === undefined || !registry.byEventId.has(eventId)) {
    console.info(
      `[hiperf_txt_parser] trace parser not found for common_type=${eventId ?? "unknown"}`,
    );
    return {
      commonType: eventId,
      commonFields,
      skipped: true,
    };
  }

  const fmt = registry.byEventId.get(eventId)!;
  const allFields = parseAllFieldsFromRaw(raw, fmt);
  const renderedText = fmt.printFmt
    ? renderPrintFmt(fmt.printFmt, fmt.printArgs, allFields)
    : undefined;
  return {
    commonType: eventId,
    commonFields,
    eventName: fmt.eventName,
    renderedText,
    skipped: false,
  };
}

/**
 * 批量处理 perfData 的 raw 数据。仅处理有 raw 的 sample。
 */
/**
 * 对 PerfData 中每个 record sample 的 raw 段进行 trace 解码，并将解码结果“替换回 raw 段内容”。
 *
 * 规则：
 * - 若找到 common_type 对应解析器：将 print fmt 渲染结果写入 `sample.raw.lines`（一行）。
 * - 若找不到解析器：放弃解析，并将 `common_type` 写入 `sample.raw.lines`（一行）。
 */
export function decodePerfRawData(
  perfData: PerfData,
  registry: TraceParserRegistry,
  options: DecodePerfRawDataOptions = {},
): PerfData {
  return {
    recordSamples: perfData.recordSamples.map((sample) => {
      if (!sample.raw || sample.raw.lines.length === 0) return sample;

      const raw = rawHexLinesToBuffer(sample.raw.lines);
      const decoded = decodeRawByRegistry(raw, registry);

      const base =
        decoded.renderedText ??
        (decoded.commonType !== undefined ? String(decoded.commonType) : "");
      if (!base) return sample;

      const commonLine = options.keepCommonFields
        ? Object.entries(decoded.commonFields)
            .map(([k, v]) => `${k}:${typeof v === "bigint" ? v.toString(10) : v}`)
            .join(" ")
        : "";

      return {
        ...sample,
        raw: {
          ...sample.raw,
          lines:
            options.keepCommonFields && commonLine.length > 0
              ? [{ hex: base }, { hex: commonLine }]
              : [{ hex: base }],
        },
      };
    }),
  };
}
