# 上游来源与血统（Upstreams & provenance）

本仓库是独立作品，建立在两个上游开源项目与一套图标集之上。本文件记录**每个文件来自哪里**，
并固定到具体修订版本，使血统可被第三方复核。

配套文件：[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)（权威署名声明）、
[`enhance/LICENSE`](enhance/LICENSE)（上游 MIT 许可证原文，逐字节副本）。

## 一、固定的上游版本

| 上游 | 仓库 | 许可证 | 固定 commit | 提交日期 | 抓取日期 |
|---|---|---|---|---|---|
| ZCode+ | https://github.com/Llliao1113/zcode-plus | MIT | `e812bab7c5127c569d9b7d666cc63c350abcef9a` | 2026-09-13 | 2026-09-14 |
| dsh-cost-meter | https://github.com/Han-1413141/dsh-cost-meter | MIT | `abb9e96a0fcd24df7daf34b12c7a08b18b74673b` | 2026-09-14 | 2026-09-14 |
| Lucide | https://github.com/lucide-icons/lucide | ISC（其中 Feather 派生图标为 MIT） | `v1.8.0` | — | 2026-09-14 |

> 许可证栏的判定依据是 GitHub 官方 API 返回的 `license.spdx_id` 字段，
> 而非各仓库 README 的自述。

## 二、逐文件来源归属

| 本仓库路径 | 来源 | 关系 |
|---|---|---|
| `enhance/controller.mjs` | ZCode+ | **vendored，已修改** |
| `enhance/inject.js` | ZCode+ | **vendored，已修改** |
| `enhance/LICENSE` | ZCode+ | 逐字节副本（未修改） |
| `enhance/enhancer-config.json` | ZCode+ | 字段结构来自上游，文件名与默认值已改 |
| `controller.mjs` | 本项目 | 原创为主；部分结构与上游同源（非空行重合 16.1%） |
| `meter-core.mjs` | 本项目 | 原创（与 dsh-cost-meter 行级重合 4.9%，属通用写法） |
| `inject.js` | 本项目 | 原创（与上游同名但独立实现，非空行重合 6.3%） |
| `orchestrator.mjs` | 本项目 | 原创 |
| `launcher.vbs` | 本项目 | 原创（启动器思路与上游同源，代码为独立重写：5580B vs 上游 340B） |
| `create-desktop-shortcut.bat` | 本项目 | 原创 |
| `start-debug.cmd` | 本项目 | 原创 |
| `docs/` | 本项目 | 原创 |
| —— | dsh-cost-meter | **仅设计参考，未分发任何代码** |
| —— | Lucide v1.8.0 | 4 个图标的 SVG 路径内嵌于 `enhance/inject.js` |

## 三、`enhance/` 相对上游的**完整**改动清单

基准：ZCode+ `e812bab7c5127c569d9b7d666cc63c350abcef9a`。合计 **64 处字符串替换**（controller 49 + inject 11 + orchestrator 4）+ **2 处头部注释插入**。
改动目的单一：**消除来源混淆**（去掉借用上游项目名作为本组件标识的写法），不改动任何功能逻辑。

### `enhance/controller.mjs`（49 处替换 + 1 处头部注释）

| # | 上游写法 | 本仓库写法 | 位置 / 说明 |
|---|---|---|---|
| 1 | `ZCode+ 提示词增强控制器（社区移植，非 ZCode 官方产品）` | `ZCode 提示词增强控制器（非 ZCode 官方产品）` | 文件头注释 |
| 2 | `ZCode+ 配置文件` | `ZCode 增强版配置文件` | 默认配置 `_readme` 第 1 行 |
| 3 | `Comment=ZCode+ 提示词增强（CDP 注入版）` | `Comment=ZCode 提示词增强（CDP 注入版）` | Linux `.desktop` 文件 |
| 4 | `ZCode+.app` | `ZCode Enhancer.app` | macOS 应用包名（2 处） |
| 5 | `"zcode-plus.log"` | `"enhancer.log"` | `const LOG_FILE` |
| 6 | `"zcode-plus-config.json"` | `"enhancer-config.json"` | `const CONFIG_FILE` |
| 7 | `".zcode-plus.lock"` | `".enhancer.lock"` | `const LOCK_FILE` |
| 8 | `"zcode-plus.desktop"` | `"zcode-enhancer.desktop"` | Linux 桌面入口文件名 |
| 9 | `"ZCode+.lnk"` | `"ZCode Enhancer.lnk"` | Windows 桌面快捷方式名 |
| 10 | `'ZCode+ Prompt Enhance'` | `'ZCode Prompt Enhancer'` | Windows 快捷方式描述 |
| 11 | `ZCODE_PLUS_ZCODE_PATH` | `ZCODE_ENHANCER_ZCODE_PATH` | 环境变量名 |
| 12 | `ZCODE_PLUS_PORT` | `ZCODE_ENHANCER_PORT` | 环境变量名 |
| 13 | `__zcodePlusControllerVersion` | `__zcodeEnhancerControllerVersion` | 注入到页面的运行时身份键 |
| 14 | `ZCode+ `（含尾随空格） | `ZCode 增强版` | 对话框 / 日志前缀 / 控制台输出（22 处） |
| 15 | 其余 `ZCode+` | `ZCode 增强版` | 注释与字符串兜底（13 处） |
| 16 | 文件头注释块 | 追加 MIT 归属注释 5 行 | 指明来源、版权、已修改 |

### `enhance/inject.js`（11 处替换 + 1 处头部注释）

| # | 上游写法 | 本仓库写法 | 位置 / 说明 |
|---|---|---|---|
| 1 | `ZCode+ 提示词增强注入脚本（WorkBuddy 社区移植，非 …）` | `ZCode 提示词增强注入脚本（非 …）` | 文件头注释 |
| 2 | `ZCode+ 增强设置` | `ZCode 提示词增强设置` | 设置面板标题 |
| 3 | `发给 ZCode+ 控制器` | `发给 ZCode 增强版控制器` | 文件头注释 |
| 4 | `「ZCode+」` | `「ZCode 增强版」` | 未连接错误提示 |
| 5 | `"zcode-plus-v1"` | `"zcode-enhancer-v1"` | `const OWNER`（仅用于生成 DOM 元素 ID，自包含） |
| 6 | `__zcodePlusControllerVersion` | `__zcodeEnhancerControllerVersion` | 与控制器注入的键保持一致（2 处） |
| 7 | `"__zcodePlusEnhanceRuntime"` | `"__zcodeEnhanceRuntime"` | `const RUNTIME_KEY` |
| 8 | `"zcodePlusEnhance.settings.v1"` | `"zcodeEnhance.settings.v1"` | `const SETTINGS_KEY` |
| 9 | `ZCode+ ` / 其余 `ZCode+` | `ZCode 增强版` | 兜底（2 处） |
| 10 | 文件头注释块 | 追加 MIT 归属注释 5 行 | 指明来源、版权、已修改 |

### `orchestrator.mjs`（4 处替换）

| # | 上游写法 | 本仓库写法 |
|---|---|---|
| 1 | `// Starts the upstream ZCode+ controller` | `// Starts the vendored prompt-enhancer controller` |
| 2 | `启动 ZCode+ 提示词增强控制器` | `启动提示词增强控制器` |
| 3 | `等待 ZCode+ CDP 就绪超时` | `等待提示词增强器 CDP 就绪超时` |
| 4 | `ZCode+ CDP 已就绪` | `提示词增强器 CDP 已就绪` |

> `orchestrator.mjs` 是本项目原创文件，此处列出仅为保持术语一致。

### 文件重命名

| 上游文件名 | 本仓库文件名 |
|---|---|
| `enhance/zcode-plus-config.json` | `enhance/enhancer-config.json` |
| `enhance/zcode-plus.log`（运行产物，未纳入版本控制） | `enhance/enhancer.log` |
| `enhance/.zcode-plus.lock`（运行产物，未纳入版本控制） | `enhance/.enhancer.lock` |

### 改动带来的行为差异（需知悉）

1. **`SETTINGS_KEY` 变化** → 页面 localStorage 中已保存的提示词增强设置会重置一次，
   手动模式（Base URL / API Key）需重新填写。
2. **`CONFIG_FILE` 变化** → 旧部署目录中已有的 `zcode-plus-config.json` 不再被读取，
   首次启动会按新的 `enhancer-config.json` 重新生成默认配置（`zcodePath: ""` 即自动探测）。

## 四、如何从上游更新

```bash
git clone https://github.com/Llliao1113/zcode-plus.git /tmp/zcode-plus
cd /tmp/zcode-plus && git checkout <新的 commit>
```

1. 用新版本的 `controller.mjs` / `inject.js` / `LICENSE` 覆盖 `enhance/` 下的对应文件；
2. **重新执行第三节的改动清单**（顺序执行、最具体的替换在前、品牌串兜底在后）；
3. 重新在文件头追加 MIT 归属注释；
4. `node --check enhance/controller.mjs enhance/inject.js` 校验语法；
5. `grep -rn "zcode-plus\|ZCode+" enhance/` 应**只**命中文件头归属注释；
6. 更新本文件第一、二节的 commit 与抓取日期。
