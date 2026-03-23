# hiperf_txt_parser

将 perf 文本中的 `record sample` 段解析为结构化数据，并支持导出为：
- perf 原文本格式（保留缩进和行前缀）
- JSON 数组格式（每项为 `{ "issuce": "unknow", "call_chain": "..." }`）

> 本项目当前为 **纯 lib 库**，`src` 仅保留库代码，不包含 CLI。

## 安装

```bash
npm install hiperf_txt_parser
```

本地调试可直接安装本地路径：

```bash
npm install /Users/fanghaolei/Workplace/TS/snapshot_checker
```

## 对外 API

```ts
import {
  parsePerfData,
  formatPerfDataToText,
  formatPerfDataToJson,
} from "hiperf_txt_parser";
```

- `parsePerfData(text: string): PerfData`
- `formatPerfDataToText(data: PerfData): string`
- `formatPerfDataToJson(data: PerfData): Array<{ issuce: "unknow"; call_chain: string }>`

## 快速示例

```ts
import { parsePerfData, formatPerfDataToJson, formatPerfDataToText } from "hiperf_txt_parser";

const input = `record sample: type 9, misc 2, size 520\n  sample_type: 0x8000107e7\n  ID 13`;

const parsed = parsePerfData(input);
const jsonArray = formatPerfDataToJson(parsed);
const txt = formatPerfDataToText(parsed);
```

## Consumer Demo（外部 TS 项目）

提供了两个 demo：

- `demo/external-ts-consumer`：最小调用示例
- `demo/lib-consumer`：读取 `sample/perf_data.txt`，导出 json/txt 到 `out/lib-consumer/`

运行文件 I/O demo：

```bash
cd demo/lib-consumer
npm install
npm run demo
```

## 输出结构说明

- 解析结构（`parsePerfData`）：`{ recordSamples: RecordSample[] }`
- JSON 导出（`formatPerfDataToJson`）：

```json
[
  {
    "issuce": "unknow",
    "call_chain": "frame1\\nframe2\\nframe3"
  }
]
```
