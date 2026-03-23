import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parsePerfData, formatPerfDataToJson, formatPerfDataToText } from "hiperf_txt_parser";

const repoRoot = resolve(process.cwd(), "../..");
const inputPath = resolve(repoRoot, "sample/perf_data.txt");
const outDir = resolve(repoRoot, "out/lib-consumer");
const outJson = resolve(outDir, "exported_perf_data.json");
const outTxt = resolve(outDir, "exported_perf_data.txt");

const input = readFileSync(inputPath, "utf-8");
const parsed = parsePerfData(input);
const jsonArray = formatPerfDataToJson(parsed);
const txt = formatPerfDataToText(parsed);

mkdirSync(dirname(outJson), { recursive: true });
writeFileSync(outJson, JSON.stringify(jsonArray, null, 2), "utf-8");
writeFileSync(outTxt, txt, "utf-8");

console.log("record sample count:", parsed.recordSamples.length);
console.log("json output:", outJson);
console.log("txt output:", outTxt);
