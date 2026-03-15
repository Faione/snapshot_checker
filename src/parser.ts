import type {
  RecordSample,
  RecordSampleHeader,
  CallchainEntry,
  RawEntry,
  ServerEntry,
  CallchainFramesEntry,
  PerfData,
} from "./types.js";

const RECORD_SAMPLE_PREFIX = "record sample:";
const RECORD_COMM_PREFIX = "record comm";

/**
 * 获取行首空格数量（缩进）
 */
function getIndent(line: string): number {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

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

  let i = 1;
  while (i < lines.length) {
    const line = lines[i];
    const indent = getIndent(line);
    const trimmed = line.trimStart();

    if (indent === 0 && trimmed.length > 0) {
      break;
    }
    if (indent === 2) {
      if (trimmed.startsWith("sample_type:")) {
        sample.sample_type = trimmed.replace(/^sample_type:\s*/, "").trim();
      } else if (trimmed.startsWith("ID ")) {
        sample.id = parseInt(trimmed.replace(/^ID\s+/, ""), 10) || 0;
      } else if (trimmed.startsWith("ip ")) {
        sample.ip = trimmed.replace(/^ip\s+/, "").trim();
      } else if (trimmed.startsWith("pid ") && trimmed.includes(", tid ")) {
        const pidMatch = trimmed.match(/pid\s+(\d+).*tid\s+(\d+)/);
        if (pidMatch) {
          sample.pid = parseInt(pidMatch[1], 10);
          sample.tid = parseInt(pidMatch[2], 10);
        }
      } else if (trimmed.startsWith("time ")) {
        sample.time = parseInt(trimmed.replace(/^time\s+/, ""), 10) || 0;
      } else if (trimmed.startsWith("stream_id ")) {
        sample.stream_id = parseInt(trimmed.replace(/^stream_id\s+/, ""), 10) || 0;
      } else if (trimmed.startsWith("cpu ") && trimmed.includes(", res ")) {
        const cpuMatch = trimmed.match(/cpu\s+(\d+).*res\s+(\d+)/);
        if (cpuMatch) {
          sample.cpu = parseInt(cpuMatch[1], 10);
          sample.res = parseInt(cpuMatch[2], 10);
        }
      } else if (trimmed.startsWith("period ")) {
        sample.period = parseInt(trimmed.replace(/^period\s+/, ""), 10) || 0;
      } else if (trimmed.startsWith("callchain nr=")) {
        const nrMatch = trimmed.match(/callchain\s+nr=(\d+)/);
        const nr = nrMatch ? parseInt(nrMatch[1], 10) : 0;
        const addresses: string[] = [];
        i++;
        while (i < lines.length && getIndent(lines[i]) >= 4) {
          const addr = lines[i].trim();
          if (addr && /^0x[0-9a-fA-F]+$/.test(addr)) {
            addresses.push(addr);
          }
          i++;
        }
        sample.callchain = { nr, addresses };
        continue;
      } else if (trimmed.startsWith("raw size=")) {
        const sizeMatch = trimmed.match(/raw\s+size=(\d+)/);
        const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
        const entries: Array<{ hex: string; short?: string }> = [];
        i++;
        while (i < lines.length && getIndent(lines[i]) >= 4) {
          const rawLine = lines[i].trim();
          const hexShort = rawLine.match(/^(0x[0-9a-fA-F]+)\s*\(([0-9a-fA-F]+)\)$/);
          if (hexShort) {
            entries.push({ hex: hexShort[1], short: hexShort[2] });
          } else if (rawLine.startsWith("0x")) {
            entries.push({ hex: rawLine });
          }
          i++;
        }
        sample.raw = { size, lines: entries };
        continue;
      } else if (trimmed.startsWith("server nr=")) {
        const nrMatch = trimmed.match(/server\s+nr=(\d+)/);
        const nr = nrMatch ? parseInt(nrMatch[1], 10) : 0;
        const pids: number[] = [];
        i++;
        while (i < lines.length && getIndent(lines[i]) >= 4) {
          const pidMatch = lines[i].trim().match(/pid:\s*(\d+)/);
          if (pidMatch) {
            pids.push(parseInt(pidMatch[1], 10));
          }
          i++;
        }
        sample.server = { nr, pids };
        continue;
      } else if (trimmed.startsWith("callchain: ")) {
        const countMatch = trimmed.match(/callchain:\s*(\d+)/);
        const count = countMatch ? parseInt(countMatch[1], 10) : 0;
        const frames: string[] = [];
        i++;
        while (i < lines.length && getIndent(lines[i]) >= 4) {
          frames.push(lines[i].trim());
          i++;
        }
        sample.callchainFrames = { count, frames };
        continue;
      }
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
    const indent = getIndent(line);

    if (trimmed.startsWith(RECORD_SAMPLE_PREFIX) && indent === 0) {
      if (current.length > 0) {
        blocks.push(current);
      }
      current = [line];
      continue;
    }
    if (trimmed.startsWith(RECORD_COMM_PREFIX) && indent === 0) {
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
  return { recordSamples };
}
