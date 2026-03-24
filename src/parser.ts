import type {
  RecordSample,
  RecordSampleHeader,
  PerfData,
} from "./types.js";

const RECORD_SAMPLE_PREFIX = "record sample:";
const RECORD_COMM_PREFIX = "record comm";

type ParseMode = "callchainAddr" | "raw" | "server" | "frames" | null;

/**
 * 解析 "record sample: type 9, misc 2, size 520" 行
 */
function parseHeaderLine(line: string): RecordSampleHeader {
  const typeMatch = line.match(/type\s+(\d+)/);
  const miscMatch = line.match(/misc\s+(\d+)/);
  const sizeMatch = line.match(/size\s+(\d+)/);
  return {
    type: typeMatch ? parseInt(typeMatch[1], 10) : 0,
    misc: miscMatch ? parseInt(miscMatch[1], 10) : 0,
    size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
  };
}

/**
 * 解析单个 record sample 块（已按行切分好的行数组）
 */
function isTopLevelField(trimmed: string): boolean {
  return (
    trimmed.startsWith("sample_type:") ||
    trimmed.startsWith("ID ") ||
    trimmed.startsWith("ip ") ||
    (trimmed.startsWith("pid ") && trimmed.includes(", tid ")) ||
    trimmed.startsWith("time ") ||
    trimmed.startsWith("stream_id ") ||
    (trimmed.startsWith("cpu ") && trimmed.includes(", res ")) ||
    trimmed.startsWith("period ") ||
    trimmed.startsWith("callchain nr=") ||
    trimmed.startsWith("raw size=") ||
    trimmed.startsWith("server nr=") ||
    trimmed.startsWith("callchain: ")
  );
}

function parseOneBlock(lines: string[]): RecordSample {
  if (lines.length === 0 || !lines[0].trimStart().startsWith(RECORD_SAMPLE_PREFIX)) {
    throw new Error("Invalid record sample block");
  }

  const header = parseHeaderLine(lines[0]);
  const sample: RecordSample = {
    header,
    sample_type: "",
    id: 0,
    ip: "",
    pid: 0,
    tid: 0,
    time: 0,
    stream_id: 0,
    cpu: 0,
    res: 0,
    period: 0,
  };

  let mode: ParseMode = null;
  let i = 1;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }
    if (
      trimmed.startsWith(RECORD_SAMPLE_PREFIX) ||
      trimmed.startsWith(RECORD_COMM_PREFIX)
    ) {
      break;
    }

    if (mode && isTopLevelField(trimmed)) {
      mode = null;
      continue;
    }

    if (trimmed.startsWith("sample_type:")) {
      sample.sample_type = trimmed.replace(/^sample_type:\s*/, "").trim();
      mode = null;
      i++;
      continue;
    }
    if (trimmed.startsWith("ID ")) {
      sample.id = parseInt(trimmed.replace(/^ID\s+/, ""), 10) || 0;
      mode = null;
      i++;
      continue;
    }
    if (trimmed.startsWith("ip ")) {
      sample.ip = trimmed.replace(/^ip\s+/, "").trim();
      mode = null;
      i++;
      continue;
    }
    if (trimmed.startsWith("pid ") && trimmed.includes(", tid ")) {
      const pidMatch = trimmed.match(/pid\s+(\d+).*tid\s+(\d+)/);
      if (pidMatch) {
        sample.pid = parseInt(pidMatch[1], 10);
        sample.tid = parseInt(pidMatch[2], 10);
      }
      mode = null;
      i++;
      continue;
    }
    if (trimmed.startsWith("time ")) {
      sample.time = parseInt(trimmed.replace(/^time\s+/, ""), 10) || 0;
      mode = null;
      i++;
      continue;
    }
    if (trimmed.startsWith("stream_id ")) {
      sample.stream_id = parseInt(trimmed.replace(/^stream_id\s+/, ""), 10) || 0;
      mode = null;
      i++;
      continue;
    }
    if (trimmed.startsWith("cpu ") && trimmed.includes(", res ")) {
      const cpuMatch = trimmed.match(/cpu\s+(\d+).*res\s+(\d+)/);
      if (cpuMatch) {
        sample.cpu = parseInt(cpuMatch[1], 10);
        sample.res = parseInt(cpuMatch[2], 10);
      }
      mode = null;
      i++;
      continue;
    }
    if (trimmed.startsWith("period ")) {
      sample.period = parseInt(trimmed.replace(/^period\s+/, ""), 10) || 0;
      mode = null;
      i++;
      continue;
    }
    if (trimmed.startsWith("callchain nr=")) {
      const nrMatch = trimmed.match(/callchain\s+nr=(\d+)/);
      const nr = nrMatch ? parseInt(nrMatch[1], 10) : 0;
      sample.callchain = { nr, addresses: [] };
      mode = "callchainAddr";
      i++;
      continue;
    }
    if (trimmed.startsWith("raw size=")) {
      const sizeMatch = trimmed.match(/raw\s+size=(\d+)/);
      const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
      sample.raw = { size, lines: [] };
      mode = "raw";
      i++;
      continue;
    }
    if (trimmed.startsWith("server nr=")) {
      const nrMatch = trimmed.match(/server\s+nr=(\d+)/);
      const nr = nrMatch ? parseInt(nrMatch[1], 10) : 0;
      sample.server = { nr, pids: [] };
      mode = "server";
      i++;
      continue;
    }
    if (trimmed.startsWith("callchain: ")) {
      const countMatch = trimmed.match(/callchain:\s*(\d+)/);
      const count = countMatch ? parseInt(countMatch[1], 10) : 0;
      sample.callchainFrames = { count, frames: [] };
      mode = "frames";
      i++;
      continue;
    }

    if (mode === "callchainAddr") {
      if (/^0x[0-9a-fA-F]+$/.test(trimmed) && sample.callchain) {
        sample.callchain.addresses.push(trimmed);
        i++;
        continue;
      }
      mode = null;
      continue;
    }
    if (mode === "raw") {
      if (sample.raw) {
        const hexShort = trimmed.match(/^(0x[0-9a-fA-F]+)\s*\(([0-9a-fA-F]+)\)$/);
        if (hexShort) {
          sample.raw.lines.push({ hex: hexShort[1], short: hexShort[2] });
          i++;
          continue;
        }
        if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
          sample.raw.lines.push({ hex: trimmed });
          i++;
          continue;
        }
      }
      mode = null;
      continue;
    }
    if (mode === "server") {
      if (sample.server) {
        const pidMatch = trimmed.match(/^pid:\s*(\d+)$/);
        if (pidMatch) {
          sample.server.pids.push(parseInt(pidMatch[1], 10));
          i++;
          continue;
        }
      }
      mode = null;
      continue;
    }
    if (mode === "frames") {
      if (sample.callchainFrames) {
        sample.callchainFrames.frames.push(trimmed);
        i++;
        continue;
      }
      mode = null;
      continue;
    }

    i++;
  }

  return sample;
}

/**
 * 从完整文本中提取所有 record sample 块（忽略 record comm 等）
 */
function extractRecordSampleBlocks(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  const blocks: string[][] = [];
  let current: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (trimmed.startsWith(RECORD_SAMPLE_PREFIX)) {
      if (current.length > 0) {
        blocks.push(current);
      }
      current = [line];
      continue;
    }
    if (trimmed.startsWith(RECORD_COMM_PREFIX)) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }
    if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) {
    blocks.push(current);
  }
  return blocks;
}

/**
 * 解析 perf data 文本，仅返回 record sample 结构数组
 */
export function parsePerfData(text: string): PerfData {
  const blocks = extractRecordSampleBlocks(text);
  const recordSamples: RecordSample[] = [];
  for (const block of blocks) {
    if (block.length === 0) continue;
    if (!block[0].trimStart().startsWith(RECORD_SAMPLE_PREFIX)) continue;
    try {
      recordSamples.push(parseOneBlock(block));
    } catch {
      // 跳过无法解析的块
    }
  }
  console.info(
    `[hiperf_txt_parser] parsePerfData parsed recordSamples: ${recordSamples.length}`,
  );
  return { recordSamples };
}

/**
 * 按 tgid 过滤 RecordSample（当前以 pid 字段作为 tgid）
 */
export function filterByTgid(data: PerfData, tgid: number): PerfData {
  const before = data.recordSamples.length;
  const afterSamples = data.recordSamples.filter((sample) => sample.pid === tgid);
  const after = afterSamples.length;
  console.info(
    `[hiperf_txt_parser] filterByTgid tgid=${tgid}, recordSamples: ${before} -> ${after}`,
  );
  return { recordSamples: afterSamples };
}
