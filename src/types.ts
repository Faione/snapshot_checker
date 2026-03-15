/**
 * 解析后的 perf record sample 结构
 */
export interface RecordSampleHeader {
  type: number;
  misc: number;
  size: number;
}

export interface CallchainEntry {
  nr: number;
  addresses: string[];
}

export interface RawEntry {
  size: number;
  lines: Array<{ hex: string; short?: string }>;
}

export interface ServerEntry {
  nr: number;
  pids: number[];
}

export interface CallchainFramesEntry {
  count: number;
  frames: string[];
}

export interface RecordSample {
  header: RecordSampleHeader;
  sample_type: string;
  id: number;
  ip: string;
  pid: number;
  tid: number;
  time: number;
  stream_id: number;
  cpu: number;
  res: number;
  period: number;
  callchain?: CallchainEntry;
  raw?: RawEntry;
  server?: ServerEntry;
  callchainFrames?: CallchainFramesEntry;
}

export type PerfData = {
  recordSamples: RecordSample[];
};
