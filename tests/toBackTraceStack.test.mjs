import test from "node:test";
import assert from "node:assert/strict";
import { toBackTraceStack, toBackTraceStacks } from "../dist/index.js";

test("toBackTraceStack should transform matching raw stack frame to hstack format", () => {
  const sample = {
    header: { type: 9, misc: 2, size: 520 },
    sample_type: "0x8000107e7",
    id: 1,
    ip: "0",
    pid: 1,
    tid: 1,
    time: 0,
    stream_id: 1,
    cpu: 0,
    res: 0,
    period: 1,
    callchainFrames: {
      count: 1,
      frames: [
        "26:0x0000005asdsasfeae9e : triggerBinder:[url:entry|entry|1.0.0|src/main/ets/myabilitystage/PreloadHook.ts:4:21][0x0000005ab8b4beee:0x0000005asdsasfeae9e][+0x0]@/proc/61446/root/data/storage/el1/bundle/entry.hap:0",
      ],
    },
  };

  const out = toBackTraceStack(sample);
  assert.equal(
    out,
    "#26 at triggerBinder (entry|entry|1.0.0|src/main/ets/myabilitystage/PreloadHook.ts:4:21)",
  );
});

test("toBackTraceStack should ignore non-matching frames", () => {
  const sample = {
    header: { type: 9, misc: 2, size: 520 },
    sample_type: "0x8000107e7",
    id: 1,
    ip: "0",
    pid: 1,
    tid: 1,
    time: 0,
    stream_id: 1,
    cpu: 0,
    res: 0,
    period: 1,
    callchainFrames: {
      count: 2,
      frames: [
        "03:0xffffff800c2b1f2c : sysxxx@0xffffff800c2b1f2c@0xffffff800c2b1f2c:18446744073709551615",
        "26:0x0000005asdsasfeae9e : triggerBinder:[url:entry|entry|1.0.0|src/main/ets/myabilitystage/PreloadHook.ts:4:21][0x0000005ab8b4beee:0x0000005asdsasfeae9e][+0x0]@/proc/61446/root/data/storage/el1/bundle/entry.hap:0",
      ],
    },
  };

  const out = toBackTraceStack(sample);
  assert.equal(
    out,
    "#26 at triggerBinder (entry|entry|1.0.0|src/main/ets/myabilitystage/PreloadHook.ts:4:21)",
  );
});

test("toBackTraceStacks should export backtrace stack in batch", () => {
  const sample1 = {
    header: { type: 9, misc: 2, size: 520 },
    sample_type: "0x8000107e7",
    id: 1,
    ip: "0",
    pid: 1,
    tid: 1,
    time: 0,
    stream_id: 1,
    cpu: 0,
    res: 0,
    period: 1,
    callchainFrames: {
      count: 1,
      frames: [
        "26:0x0000005asdsasfeae9e : triggerBinder:[url:entry|entry|1.0.0|src/main/ets/myabilitystage/PreloadHook.ts:4:21][x:y][+0x0]@/proc/a:0",
      ],
    },
  };
  const sample2 = {
    header: { type: 9, misc: 2, size: 520 },
    sample_type: "0x8000107e7",
    id: 2,
    ip: "0",
    pid: 2,
    tid: 2,
    time: 0,
    stream_id: 2,
    cpu: 0,
    res: 0,
    period: 1,
    callchainFrames: {
      count: 1,
      frames: ["not-match-frame"],
    },
  };

  const out = toBackTraceStacks({ recordSamples: [sample1, sample2] });
  assert.equal(out.recordSamples.length, 2);
  assert.equal(
    out.recordSamples[0].callchainFrames.frames[0],
    "#26 at triggerBinder (entry|entry|1.0.0|src/main/ets/myabilitystage/PreloadHook.ts:4:21)"
  );
  assert.deepEqual(out.recordSamples[1].callchainFrames.frames, []);
});
