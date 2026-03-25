import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTraceFormat,
  parseCommonFieldsFromRaw,
  rawHexLinesToBuffer,
  buildTraceParserRegistry,
  decodeRawByRegistry,
  decodePerfRawData,
} from "../dist/index.js";

const SAMPLE_FORMAT = `name: sys_enter
ID: 22
format:
	field:unsigned short common_type;	offset:0;	size:2;	signed:0;
	field:unsigned char common_flags;	offset:2;	size:1;	signed:0;
	field:unsigned char common_preempt_count;	offset:3;	size:1;	signed:0;
	field:int common_pid;	offset:4;	size:4;	signed:1;

	field:long id;	offset:8;	size:8;	signed:1;
	field:unsigned long args[6];	offset:16;	size:48;	signed:0;

print fmt: "NR %ld (%lx, %lx)", REC->id, REC->args[0], REC->args[1]
`;

function rawBytesToHexLinesLE4(raw) {
  const lines = [];
  for (let i = 0; i < raw.length; i += 4) {
    const b0 = raw[i] ?? 0;
    const b1 = raw[i + 1] ?? 0;
    const b2 = raw[i + 2] ?? 0;
    const b3 = raw[i + 3] ?? 0;
    const word = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
    lines.push({ hex: "0x" + word.toString(16).padStart(8, "0") });
  }
  return lines;
}

test("parseTraceFormat should parse name, ID and fields", () => {
  const fmt = parseTraceFormat(SAMPLE_FORMAT);
  assert.equal(fmt.eventName, "sys_enter");
  assert.equal(fmt.eventId, 22);
  assert.equal(fmt.fields.length, 6);
  assert.equal(fmt.fields[0].name, "common_type");
  assert.equal(fmt.fields[0].offset, 0);
  assert.equal(fmt.fields[0].size, 2);
  assert.equal(fmt.fields[0].signed, false);
  assert.equal(fmt.fields[3].name, "common_pid");
  assert.equal(fmt.fields[3].signed, true);
  assert.equal(fmt.printFmt, "NR %ld (%lx, %lx)");
  assert.deepEqual(fmt.printArgs, ["REC->id", "REC->args[0]", "REC->args[1]"]);
});

test("parseCommonFieldsFromRaw should read common_* from raw buffer (LE)", () => {
  const fmt = parseTraceFormat(SAMPLE_FORMAT);
  // common_type LE 0x1234, flags 0xab, preempt 0xcd, pid int32 LE 0x78563412
  const raw = new Uint8Array([
    0x34, 0x12, 0xab, 0xcd, 0x12, 0x34, 0x56, 0x78,
  ]);
  const common = parseCommonFieldsFromRaw(raw, fmt);
  assert.equal(common.common_type, 0x1234);
  assert.equal(common.common_flags, 0xab);
  assert.equal(common.common_preempt_count, 0xcd);
  assert.equal(common.common_pid, 0x78563412);
});

test("rawHexLinesToBuffer should produce bytes for common header", () => {
  const buf = rawHexLinesToBuffer([
    { hex: "0x00001234" },
    { hex: "0x00005678" },
  ]);
  assert.equal(buf.length, 8);
  const view = new DataView(buf.buffer);
  assert.equal(view.getUint32(0, true), 0x1234);
  assert.equal(view.getUint32(4, true), 0x5678);
});

test("decodeRawByRegistry should parse common and render print fmt", () => {
  const registry = buildTraceParserRegistry([SAMPLE_FORMAT]);
  // common_type=22, flags=1, preempt=2, pid=3, id=7, args[0]=0x11, args[1]=0x22
  const raw = new Uint8Array([
    0x16, 0x00, 0x01, 0x02, 0x03, 0x00, 0x00, 0x00,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x22, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const out = decodeRawByRegistry(raw, registry);
  assert.equal(out.skipped, false);
  assert.equal(out.commonType, 22);
  assert.equal(out.commonFields.common_type, 22);
  assert.equal(out.renderedText, "NR 7 (11, 22)");
});

test("decodeRawByRegistry should skip and print common_type when parser missing", () => {
  const registry = buildTraceParserRegistry([SAMPLE_FORMAT]);
  // common_type=99
  const raw = new Uint8Array([0x63, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const out = decodeRawByRegistry(raw, registry);
  assert.equal(out.skipped, true);
  assert.equal(out.commonType, 99);
});

test("decodePerfRawData should replace sample.raw with rendered print fmt", () => {
  const registry = buildTraceParserRegistry([SAMPLE_FORMAT]);
  const rawBytes = new Uint8Array([
    0x16, 0x00, 0x01, 0x02, 0x03, 0x00, 0x00, 0x00,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x22,  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const perfData = {
    recordSamples: [
      {
        raw: {
          size: rawBytes.length,
          lines: rawBytesToHexLinesLE4(rawBytes),
        },
      },
    ],
  };
  const out = decodePerfRawData(perfData, registry);
  assert.equal(out.recordSamples[0].raw.lines.length, 1);
  assert.equal(
    out.recordSamples[0].raw.lines[0].hex,
    "NR 7 (11, 22)",
  );
});

test("decodePerfRawData should replace sample.raw with common_type when parser missing", () => {
  const registry = buildTraceParserRegistry([SAMPLE_FORMAT]);
  const rawBytes = new Uint8Array([0x63, 0x00, 0x00, 0x00, 0x00, 0x00]); // common_type=99
  const perfData = {
    recordSamples: [
      {
        raw: {
          size: rawBytes.length,
          lines: rawBytesToHexLinesLE4(rawBytes),
        },
      },
    ],
  };
  const out = decodePerfRawData(perfData, registry);
  assert.equal(out.recordSamples[0].raw.lines.length, 1);
  assert.equal(out.recordSamples[0].raw.lines[0].hex, "99");
});
