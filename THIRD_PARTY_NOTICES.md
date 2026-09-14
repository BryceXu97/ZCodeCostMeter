# Third-party notices / 第三方组件声明

ZCode Cost Meter is an independent, unofficial community project. It redistributes
code from one upstream project, references a second one by design only, and embeds
three icons from an icon set. Each is attributed below.

本项目是独立的非官方社区作品。它所分发、借鉴与内嵌的第三方组件逐项声明如下。
**本文件是项目的唯一权威署名声明**；每次更新 `enhance/` 时都必须同步维护。

逐文件来源与固定修订版本见 [`UPSTREAMS.md`](UPSTREAMS.md)。

---

## 1. ZCode+ —— 已 vendored 的上游代码

| 项目 | 说明 |
|---|---|
| 来源 | https://github.com/Llliao1113/zcode-plus |
| 固定版本 | commit `e812bab7c5127c569d9b7d666cc63c350abcef9a`（2026-09-13），controller `1.3.2` |
| 许可证 | MIT |
| 许可证全文 | 见随附的 [`enhance/LICENSE`](enhance/LICENSE) |

**MIT 要求保留的版权声明原文**（本项目已逐字保留）：

```text
MIT License

Copyright (c) 2026 Llliao1113
```

**分发内容**：`enhance/controller.mjs` 与 `enhance/inject.js` 是上游项目的 **vendored 副本**
（即文件是整体复制进来的，不只是参考实现），并随附上游 `LICENSE`。

**本地副本的状态：已修改（modified）。** 为融入本项目，对标识符、运行产物文件名
与用户可见的产品字符串做了中性化重命名，因此这两个文件**与上游不再逐字节相同**。
全部改动逐条列于 [`UPSTREAMS.md`](UPSTREAMS.md)。

**合规依据**：MIT 的许可条件是「上述版权声明与许可声明须包含在本软件的所有副本或实质性部分中」。
`enhance/LICENSE` 是从上游**逐字节复制**的，且与代码一同分发，该条件已满足。

## 2. dsh-cost-meter —— 仅设计参考，未分发代码

| 项目 | 说明 |
|---|---|
| 来源 | https://github.com/Han-1413141/dsh-cost-meter |
| 许可证 | MIT — `Copyright (c) 2026 dsh-cost-meter contributors` |
| 分发内容 | **无任何源代码** |

本项目的产品概念与账目/呈现风格曾参考该项目，但实现是针对不同宿主应用、不同数据源
**独立编写**的（本项目读取 ZCode 本地 SQLite 账本，而非 DeepSeek Harness 的插件 API）。
对本仓库文件与该上游源码做过词法指纹比对，除通用 JavaScript 惯用写法外**未发现共享代码**。

## 3. Lucide 图标 —— ISC / MIT

| 项目 | 说明 |
|---|---|
| 来源 | https://github.com/lucide-icons/lucide |
| 版本 | v1.8.0 |
| 使用图标 | `Sparkles`、`LoaderCircle`、`Undo2`、`X`（位于 `enhance/inject.js`） |
| 许可证 | ISC — `Copyright (c) 2026 Lucide Icons and Contributors` |
| 许可证全文 | https://github.com/lucide-icons/lucide/blob/main/LICENSE |

**附加声明**：上述 `X` 图标属于 Lucide 中派生自 [Feather](https://github.com/feathericons/feather)
项目的那一批，以 MIT 许可证分发：

```text
The MIT License (MIT)

Copyright (c) 2013-present Cole Bemis
```

---

## 商标与隶属关系声明

- **ZCode** 是其各自权利人的产品名称。
- 本项目是**非官方**的社区辅助工具，与 ZCode 桌面应用、ZCode+ 项目、dsh-cost-meter 项目
  **均无隶属、赞助或背书关系**。
- 上游项目名称仅用于履行 MIT / ISC 许可证所要求的作者署名，不表示任何官方关联。

## 第三方组件之外的注意

本项目通过 Chrome DevTools Protocol 向 ZCode 桌面应用注入界面元素，属社区侧的非官方扩展方式。
这属于**目标软件使用条款（EULA）**范畴，与上述开源许可证无关；使用者需自行确认其使用场景
符合 ZCode 的许可条款。
