import type { PerfData, RecordSample } from "./types.js";

/**
 * 将单个 RecordSample 序列化为与 sample/perf_data.txt 一致的文本格式（含缩进与行前缀）
 */
function serializeOneSample(sample: RecordSample): string {
  const lines: string[] = [];
  const { header } = sample;

  lines.push(`record sample: type ${header.type}, misc ${header.misc}, size ${header.size}`);
  lines.push(`  sample_type: ${sample.sample_type}`);
  lines.push(`  ID ${sample.id}`);
  lines.push(`  ip ${sample.ip}`);
  lines.push(`  pid ${sample.pid}, tid ${sample.tid}`);
  lines.push(`  time ${sample.time}`);
  lines.push(`  stream_id ${sample.stream_id}`);
  lines.push(`  cpu ${sample.cpu}, res ${sample.res}`);
  lines.push(`  period ${sample.period}`);

  if (sample.callchain) {
    lines.push(`  callchain nr=${sample.callchain.nr}`);
    for (const addr of sample.callchain.addresses) {
      lines.push(`    ${addr}`);
    }
  }

  if (sample.raw) {
    lines.push(`  raw size=${sample.raw.size}`);
    for (const { hex, short } of sample.raw.lines) {
      lines.push(short ? `    ${hex} (${short})` : `    ${hex}`);
    }
  }

  if (sample.server) {
    lines.push(`  server nr=${sample.server.nr}`);
    for (const pid of sample.server.pids) {
      lines.push(`    pid: ${pid}`);
    }
  }

  if (sample.callchainFrames) {
    lines.push(`  `);
    lines.push(` callchain: ${sample.callchainFrames.count}`);
    for (const frame of sample.callchainFrames.frames) {
      lines.push(`  ${frame}`);
    }
  }

  return lines.join("\n");
}

/**
 * 将 PerfData 导出为与 sample/perf_data.txt 相同格式的文本（含缩进与每行前缀）
 */
export function formatPerfDataToText(data: PerfData): string {
  return data.recordSamples.map(serializeOneSample).join("\n\n");
}

/** 导出用 JSON 的单项：issuce 固定为 "unknow"，call_chain 为 frames 逐行拼接 */
export interface RecordSampleJsonExportItem {
  issuce: "unknow";
  call_chain: string;
}

/**
 * 将 PerfData 转为导出用 JSON 结构：顶层为数组，每项为 { issuce: "unknow", call_chain: "" }，
 * call_chain 由对应 record sample 的 callchainFrames.frames 逐行拼接得到，无则为空字符串。
 */
export function formatPerfDataToJson(data: PerfData): RecordSampleJsonExportItem[] {
  return data.recordSamples.map((s) => ({
    issuce: "unknow" as const,
    call_chain: s.callchainFrames ? s.callchainFrames.frames.join("\n") : "",
  }));
}
