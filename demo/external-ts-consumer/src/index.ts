import { parsePerfData, formatPerfDataToJson, formatPerfDataToText } from "hiperf_txt_parser";

const perfText = `record sample: type 9, misc 2, size 520
  sample_type: 0x8000107e7
  ID 13
  ip ffffffff8d20008c
  pid 1234, tid 1234
  time 98022340124
  stream_id 13
  cpu 1, res 0
  period 1
  callchain: 2
    03:0xffffff800c2b1f2c : sysxxx@0xffffff800c2b1f2c@0xffffff800c2b1f2c:18446744073709551615
    02:0x5a5ccdea58 : /system/lib/ld-musl-aarch64.so.1+0xa4a58@/system/lib/ld-musl-aarch64.so.1:18446744073709551615
    01:dlopen_impl[0x0000005a5ccd7bf0:0x000000000009dbf0][0x7fc]@/system/lib/ld-musl-aarch64.so.1:0`;

const parsed = parsePerfData(perfText);
const jsonExport = formatPerfDataToJson(parsed);
const textExport = formatPerfDataToText(parsed);

console.log("recordSamples count:", parsed.recordSamples.length);
console.log("json export first item:", jsonExport[0]);
console.log("text export preview:\n", textExport.split("\n").slice(0, 8).join("\n"));
