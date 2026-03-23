import test from "node:test";
import assert from "node:assert/strict";
import { parsePerfData, filterByTgid } from "../dist/index.js";

const SAMPLE_MIXED_PID = `record sample: type 9, misc 2, size 520
  sample_type: 0x8000107e7
  ID 13
  ip ffffffff8d20008c
  pid 1234, tid 1234
  time 98022340124
  stream_id 13
  cpu 1, res 0
  period 1

record sample: type 9, misc 2, size 520
  sample_type: 0x8000107e7
  ID 14
  ip ffffffff8d20008c
  pid 2222, tid 2222
  time 98022340125
  stream_id 14
  cpu 1, res 0
  period 1

record sample: type 9, misc 2, size 520
  sample_type: 0x8000107e7
  ID 15
  ip ffffffff8d20008c
  pid 1234, tid 1234
  time 98022340126
  stream_id 15
  cpu 1, res 0
  period 1`;

test("filterByTgid should keep only matching pid samples", () => {
  const parsed = parsePerfData(SAMPLE_MIXED_PID);
  const filtered = filterByTgid(parsed, 1234);

  assert.equal(filtered.recordSamples.length, 2);
  assert.ok(filtered.recordSamples.every((s) => s.pid === 1234));
});

test("filterByTgid should return empty array when tgid not found", () => {
  const parsed = parsePerfData(SAMPLE_MIXED_PID);
  const filtered = filterByTgid(parsed, 9999);

  assert.deepEqual(filtered.recordSamples, []);
});
