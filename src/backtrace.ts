import type { PerfData, RecordSample } from "./types.js";

// 例: 26:0x0000005ab8b4beee : triggerBinder:[url:entry|entry|1.0.0|src/main/ets/x.ts:4:21][...]
const RAW_STACK_PATTERN =
  /^\s*(\d+):0x[0-9A-Za-z]+\s*:\s*([^\[]+?)\s*:\[url:([^\]]+)\].*$/;

/**
 * 将 RecordSample 原始栈中符合 pattern 的帧转为 hstack 可解析的栈格式。
 *
 * 输出示例:
 * #26 at triggerBinder (entry|entry|1.0.0|src/main/ets/myabilitystage/PreloadHook.ts:4:21)
 */
export function toBackTraceStack(sample: RecordSample): string {
  const frames = sample.callchainFrames?.frames ?? [];
  const out: string[] = [];

  for (const frame of frames) {
    const m = frame.match(RAW_STACK_PATTERN);
    if (!m) continue;
    const index = m[1];
    const funcName = m[2].trim();
    const urlInfo = m[3].trim();
    out.push(`#${index} at ${funcName} (${urlInfo})`);
  }

  return out.join("\n");
}

/**
 * 批量将 PerfData 中所有 RecordSample 转为 hstack 可解析栈。
 * 返回数组长度与 recordSamples 一致，元素顺序一一对应。
 */
export function toBackTraceStacks(data: PerfData): string[] {
  return data.recordSamples.map((sample) => toBackTraceStack(sample));
}
