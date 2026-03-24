import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  parsePerfData,
  filterByTgid,
  formatPerfDataToJson,
  formatPerfDataToText,
} from "hiperf_txt_parser";

const repoRoot = resolve(process.cwd(), "../..");
const inputPath = resolve(repoRoot, "sample/perf_data.txt");
const outDir = resolve(repoRoot, "out/lib-consumer");
const outJson = resolve(outDir, "exported_perf_data.json");
const outTxt = resolve(outDir, "exported_perf_data.txt");
const targetTgid = 1234;

console.log("[阶段 1] 开始读取样本文件:", inputPath);
const input = readFileSync(inputPath, "utf-8");
console.log("[阶段 1] 读取完成，文本长度:", input.length);

console.log("[阶段 2] 开始解析 record sample...");
const parsed = parsePerfData(input);
console.log("[阶段 2] 解析完成，record sample 数量:", parsed.recordSamples.length);

console.log(`[阶段 3] 开始按 tgid=${targetTgid} 过滤...`);
const filtered = filterByTgid(parsed, targetTgid);
console.log(
  `[阶段 3] 过滤完成，数量变化: ${parsed.recordSamples.length} -> ${filtered.recordSamples.length}`,
);

console.log("[阶段 4] 开始生成导出内容（json/txt）...");
const jsonArray = formatPerfDataToJson(filtered);
const txt = formatPerfDataToText(filtered);
console.log("[阶段 4] 生成完成，json 条目数:", jsonArray.length);

console.log("[阶段 5] 开始写入导出文件...");
mkdirSync(dirname(outJson), { recursive: true });
writeFileSync(outJson, JSON.stringify(jsonArray, null, 2), "utf-8");
writeFileSync(outTxt, txt, "utf-8");
console.log("[阶段 5] 写入完成。");

console.log("record sample count(before filter):", parsed.recordSamples.length);
console.log("record sample count(after filter):", filtered.recordSamples.length);
console.log("json output:", outJson);
console.log("txt output:", outTxt);
