#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { parsePerfData } from "./parser.js";
import { formatPerfDataToText } from "./serializer.js";

const HELP = `perf_parser — 解析 perf data 文本，仅提取 record sample 并输出

用法:
  perf_parser --input_file <path> [--output_file <path>]

Flags:
  --input_file <path>   (必填) 输入的 perf data 文本文件路径，如 perf_data.txt
  --output_file <path>  (可选) 将解析结果导出为该路径的文本文件（与 sample/perf_data.txt 同格式）；若路径不存在会先创建；不指定则把 JSON 打印到 stdout
  --help, -h            显示此帮助
`;

function parseArgs(argv: string[]): { inputFile?: string; outputFile?: string; help: boolean } {
  const out: { inputFile?: string; outputFile?: string; help: boolean } = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      return out;
    }
    if (arg === "--input_file" && argv[i + 1] && !argv[i + 1].startsWith("-")) {
      out.inputFile = argv[++i];
    } else if (arg.startsWith("--input_file=")) {
      out.inputFile = arg.slice("--input_file=".length);
    } else if (arg === "--output_file" && argv[i + 1] && !argv[i + 1].startsWith("-")) {
      out.outputFile = argv[++i];
    } else if (arg.startsWith("--output_file=")) {
      out.outputFile = arg.slice("--output_file=".length);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(HELP);
  process.exit(0);
}

if (!args.inputFile) {
  console.error("错误: 请使用 --input_file 指定输入文件。");
  console.error(HELP);
  process.exit(1);
}

const inputPath = resolve(process.cwd(), args.inputFile);
let text: string;
try {
  text = readFileSync(inputPath, "utf-8");
} catch (e) {
  console.error("无法读取文件:", inputPath, (e as Error).message);
  process.exit(1);
}

const data = parsePerfData(text);

if (args.outputFile) {
  const outputPath = resolve(process.cwd(), args.outputFile);
  try {
    const outDir = dirname(outputPath);
    mkdirSync(outDir, { recursive: true });
    const textOut = formatPerfDataToText(data);
    writeFileSync(outputPath, textOut, "utf-8");
    console.error("已写入:", outputPath);
  } catch (e) {
    console.error("无法写入文件:", outputPath, (e as Error).message);
    process.exit(1);
  }
} else {
  console.log(JSON.stringify(data, null, 2));
}
