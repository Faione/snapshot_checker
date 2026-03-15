# snapshot-checker

解析 `perf data.txt` 文本，仅提取 **record sample** 块并输出为 TypeScript 结构数据（JSON）。忽略 `record comm` 等其他前缀。

**命令行工具名称：`perf_parser`**

## 安装

```bash
npm install
npm run build
```

全局使用可执行：`npm link`，之后在任意目录运行 `perf_parser`。

### 本地调试（不使用 npm link）

在项目根目录先执行一次 `npm run build`，然后任选一种方式运行：

```bash
# 方式一：用 node 直接跑编译产物（推荐）
node dist/cli.js --input_file sample/perf_data.txt

# 方式二：用 npm run parse，注意参数要放在 -- 后面
npm run parse -- --input_file sample/perf_data.txt
npm run parse -- --input_file sample/perf_data.txt --output_file out/perf_data.txt

# 方式三：用 npx 运行当前项目的 bin（在项目根目录下执行）
npx . --input_file sample/perf_data.txt
```

路径均为相对于当前工作目录；在项目根目录执行即可用 `sample/perf_data.txt`。

## 用法

```bash
perf_parser --input_file <path> [--output_file <path>]
```

### Flags 说明

| Flag | 说明 |
|------|------|
| `--input_file <path>` | **必填**。输入的 perf data 文本文件路径（如 `perf_data.txt`） |
| `--output_file <path>` | **可选**。将解析结果导出为该路径的文本文件（与 `sample/perf_data.txt` 同格式，含缩进与行前缀）；若目录不存在会先创建；不指定则把 JSON 打印到 stdout |
| `--help`, `-h` | 显示帮助 |

以上 flag 支持 `--flag value` 或 `--flag=value` 两种写法。

### 示例

```bash
# 解析并打印到终端
perf_parser --input_file sample/perf_data.txt

# 解析并导出为与 sample 同格式的文本文件（路径不存在时会先创建）
perf_parser --input_file sample/perf_data.txt --output_file out/perf_data.txt

# 查看帮助
perf_parser --help
```

## 输出结构

- `recordSamples`: 数组，每个元素为一个 record sample
  - `header`: `{ type, misc, size }`
  - `sample_type`, `id`, `ip`, `pid`, `tid`, `time`, `stream_id`, `cpu`, `res`, `period`
  - `callchain?`: `{ nr, addresses[] }`
  - `raw?`: `{ size, lines: [{ hex, short? }] }`
  - `server?`: `{ nr, pids[] }`
  - `callchainFrames?`: `{ count, frames[] }`

## 测试

```bash
npm test
```

测试用例基于 `sample/perf_data.txt` 的格式，覆盖两个 record sample、record comm 过滤、空输入等。
