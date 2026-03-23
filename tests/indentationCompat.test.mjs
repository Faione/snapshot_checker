import test from "node:test";
import assert from "node:assert/strict";
import { parsePerfData, formatPerfDataToText } from "../dist/index.js";

const SAMPLE_NEW_CALLCHAIN_INDENT = `record sample: type 9, misc 2, size 520
  sample_type: 0x8000107e7
  ID 13
  ip ffffffff8d20008c
  pid 1234, tid 1234
  time 98022340124
  stream_id 13
  cpu 1, res 0
  period 1
 callchain: 2
  03:frameA
  02:frameB
  01:frameC`;

test("parsePerfData should parse callchainFrames with indent 1/2", () => {
  const parsed = parsePerfData(SAMPLE_NEW_CALLCHAIN_INDENT);
  assert.equal(parsed.recordSamples.length, 1);
  assert.equal(parsed.recordSamples[0].callchainFrames?.count, 2);
  assert.deepEqual(parsed.recordSamples[0].callchainFrames?.frames, [
    "03:frameA",
    "02:frameB",
    "01:frameC",
  ]);
});

test("formatPerfDataToText should output callchain/frame indent as 1/2", () => {
  const parsed = parsePerfData(SAMPLE_NEW_CALLCHAIN_INDENT);
  const textOut = formatPerfDataToText(parsed);
  assert.ok(textOut.includes("\n callchain: 2\n  03:frameA"));
});

test("parsePerfData should not rely on indentation for field parsing", () => {
  const weirdIndent = `record sample: type 9, misc 2, size 520
sample_type: 0x8000107e7
 ID 13
    ip ffffffff8d20008c
 pid 1234, tid 1234
time 98022340124
 stream_id 13
cpu 1, res 0
  period 1
 callchain: 2
      03:frameA
02:frameB
 01:frameC`;
  const parsed = parsePerfData(weirdIndent);
  assert.equal(parsed.recordSamples.length, 1);
  const s = parsed.recordSamples[0];
  assert.equal(s.sample_type, "0x8000107e7");
  assert.equal(s.id, 13);
  assert.equal(s.pid, 1234);
  assert.equal(s.callchainFrames?.frames.length, 3);
});

test("parsePerfData should handle empty raw size section", () => {
  const text = `record sample: type 9, misc 2, size 520
  sample_type: 0x8000107e7
  ID 13
  ip ffffffff8d20008c
  pid 1234, tid 1234
  time 98022340124
  stream_id 13
  cpu 1, res 0
  period 1
  raw size=8
  server nr=1
    pid: 1234`;
  const parsed = parsePerfData(text);
  assert.equal(parsed.recordSamples.length, 1);
  assert.equal(parsed.recordSamples[0].raw?.size, 8);
  assert.deepEqual(parsed.recordSamples[0].raw?.lines, []);
  assert.deepEqual(parsed.recordSamples[0].server?.pids, [1234]);
});
