# ZCode 会话费用统计

一个面向 ZCode Desktop 的非侵入式会话费用侧栏。它借鉴 ZCode+ 的 CDP 注入思路，不修改 `app.asar`、安装目录或应用签名。

## 功能

- 常驻右侧栏，可折叠为窄条；页面刷新或新窗口会自动重新注入。
- 实时统计当前会话（可含子任务）、今日、本月和累计费用。
- 展示输入、缓存读取、未缓存输入、输出 token、缓存命中率和调用次数。
- 按模型拆分费用；未知模型明确标成“未定价”，不会臆造费用。
- 本月预算与进度预警。
- 侧栏内编辑 Provider/模型价格、刷新频率、峰时倍率和预算。
- 只读 `~/.zcode/cli/db/db.sqlite` 中的 `model_usage` / `session` 表，不读取 `credentials.json` 或 API Key。

## 计费口径

价格单位是“每百万 token”。默认预置 DeepSeek V4 Flash / Pro 人民币官方价；工作日北京时间 09:00–12:00、14:00–18:00 默认使用 2 倍峰时倍率，周末默认按谷时。第三方 Provider 使用同名模型时只是官方价估算，应在设置中按实际渠道账单覆盖。

ZCode 的 `input_tokens` 已包含缓存 token，因此插件按以下方式避免重复计费：

```text
未缓存输入 = input_tokens - cache_read_input_tokens - cache_creation_input_tokens
费用 = 未缓存输入 × 输入价 + 缓存读取 × 缓存价 + 缓存写入 × 输入价 + 输出 × 输出价
```

## 安装与使用

要求 Node.js 22.5+（本机验证于 Node 22 / Node 24）。没有构建步骤，也不需要安装依赖。

1. 运行 `create-desktop-shortcut.bat`，它会在桌面创建“ZCode 增强版（费用+提示词）”快捷方式；
2. 或者直接双击本目录下的 `launcher.vbs`。

两种方式都由 `launcher.vbs` 调起 `orchestrator.mjs`，再由后者拉起 `enhance/controller.mjs` 与本目录的 `controller.mjs`。原版 ZCode 快捷方式不受影响。

如果原版 ZCode 已运行，启动器会明确询问是否重启；拒绝时不会关闭任何进程。CDP 端口仅绑定 `127.0.0.1`，默认从 9361 开始，冲突时在 9361–9375 内顺延。

### 路径解析

程序不写死任何安装路径，复制到其他电脑即可运行。`zcode-cost-meter-config.json` 里的 `zcodePath` 与 `dbPath` **留空（`""`）即自动探测**：

- `zcodePath` 按「环境变量 → 程序所在目录逐级向上 → 各盘符 `\zcode\` → 标准安装位置 → PATH」顺序查找，Windows 标准位置含 `%ProgramFiles%\ZCode`、`%ProgramFiles(x86)%\ZCode`、`%LOCALAPPDATA%\Programs\ZCode`；
- `dbPath` 默认取 `%USERPROFILE%\.zcode\cli\db\db.sqlite`（即 `~/.zcode/...`）。

也可以用环境变量覆写：

| 变量 | 作用 |
|---|---|
| `ZCODE_COST_METER_ZCODE` | 直接指定 ZCode 可执行文件，优先级最高 |
| `ZCODE_HOME` | 指定 ZCode 数据目录，默认 `~/.zcode` |
| `ZCODE_COST_METER_NODE` | 指定 node.exe，供 `launcher.vbs` 与 `start-debug.cmd` 使用 |

配置文件中也支持 `~`、`%USERPROFILE%`、`%LOCALAPPDATA%`、`$HOME` 等写法。

## 排错

- 前台运行本目录下的 `start-debug.cmd`。
- 查看本目录下的 `zcode-cost-meter.log` 与 `orchestrator.log`。
- 路径找不到时先执行 `node controller.mjs --paths`，它会打印实际解析结果和全部候选路径。
- 若 ZCode 更新后侧栏消失，通常只需更新 `inject.js` 的 DOM 注入逻辑；统计数据层不依赖页面结构。

## 自检

```powershell
node controller.mjs --paths
node controller.mjs --snapshot
```

`--paths` 输出路径解析结果，`--snapshot` 直接打印一次统计快照，两者都不需要启动 ZCode。

## 限制

- 这是本地账本估算，不替代 Provider 最终账单。
- 自定义或代理 Provider 的价格必须由用户确认。
- ZCode 没有官方用户脚本接口，未来大版本可能调整 CDP/页面行为。
