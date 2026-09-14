#!/usr/bin/env node
/*
 * ZCode Cost Meter controller
 * Starts ZCode with a loopback-only CDP endpoint, injects the sidebar, and
 * reads ZCode's local usage database in read-only mode. No credentials are read.
 */
import { spawn, execFileSync, execSync } from "node:child_process";
import { createServer } from "node:net";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PRICES,
  OFFICIAL_PRICING_URL,
  OFFICIAL_PRICE_VERSION,
  defaultConfig,
  sanitizeConfig,
  summarizeRows,
  peakPhaseAt
} from "./meter-core.mjs";

const VERSION = "0.3.2";
const INSTALL_DIR = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(INSTALL_DIR, "zcode-cost-meter-config.json");
const LOG_FILE = path.join(INSTALL_DIR, "zcode-cost-meter.log");
const LOCK_FILE = path.join(INSTALL_DIR, ".controller.lock");
// ZCode 数据目录：可用 ZCODE_HOME 覆盖，便于便携安装与多机复用
const ZCODE_HOME = process.env.ZCODE_HOME || path.join(os.homedir(), ".zcode");
const DEFAULT_DB = path.join(ZCODE_HOME, "cli", "db", "db.sqlite");
const ZCODE_V2_CONFIG = path.join(ZCODE_HOME, "v2", "config.json");
// 分发场景不硬编码安装路径：按平台候选链探测，探测失败再引导用户显式配置
const ZCODE_BIN = process.platform === "win32" ? "ZCode.exe" : process.platform === "darwin" ? "ZCode.app" : "zcode";
const PORT_MIN = 9361;
const PORT_MAX = 9375;
const DISCOVERY_PORTS = [
  ...Array.from({ length: 18 }, (_, index) => 9333 + index),
  ...Array.from({ length: PORT_MAX - PORT_MIN + 1 }, (_, index) => PORT_MIN + index)
];
let balanceState = { status: "idle", isAvailable: null, currency: "CNY", total: null, granted: null, toppedUp: null, updatedAt: null, error: null };
let balanceRefreshPromise = null;

function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.map(String).join(" ")}`;
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
  if (process.stdout.isTTY) console.log(line);
}

function safeError(error) {
  return String(error?.message || error || "未知错误").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 600);
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

// 把 ~、%VAR%、$VAR 展开为真实路径，使配置文件可以写成跨机器可用的形式
function expandPath(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  if (text === "~") text = os.homedir();
  else if (text.startsWith("~/") || text.startsWith("~\\")) text = path.join(os.homedir(), text.slice(2));
  text = text.replace(/%([^%]+)%/g, (whole, name) => process.env[name] ?? process.env[name.toUpperCase()] ?? whole);
  text = text.replace(/^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/, (whole, name) => process.env[name] ?? whole);
  return path.normalize(text);
}

function isFile(target) {
  try { return fs.statSync(target).isFile(); } catch { return false; }
}

function isDirectory(target) {
  try { return fs.statSync(target).isDirectory(); } catch { return false; }
}

function listDriveRoots() {
  const roots = [];
  for (let code = "C".charCodeAt(0); code <= "Z".charCodeAt(0); code++) {
    const root = `${String.fromCharCode(code)}:\\`;
    try { if (fs.existsSync(root)) roots.push(root); } catch {}
  }
  return roots;
}

// macOS 允许直接填 .app 包路径：解析到内部可执行文件（读不到 Info.plist 时退回 ZCode）
function resolveMacApp(target) {
  if (process.platform !== "darwin" || !/\.app[\\/]?$/i.test(target) || !isDirectory(target)) return target;
  let name = "ZCode";
  try {
    const plist = fs.readFileSync(path.join(target, "Contents", "Info.plist"), "utf8");
    const matched = plist.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/);
    if (matched) name = matched[1];
  } catch {}
  const inner = path.join(target, "Contents", "MacOS", name);
  return isFile(inner) ? inner : target;
}

// 按平台候选链探测 ZCode 可执行文件：环境变量 > 程序所在目录逐级向上 > 盘符常见位置 > 标准安装位置 > PATH
function findZcodePath() {
  const configured = String(process.env.ZCODE_COST_METER_ZCODE || "").trim();
  if (configured) {
    const resolved = resolveMacApp(expandPath(configured));
    if (isFile(resolved)) return { path: resolved, source: "环境变量 ZCODE_COST_METER_ZCODE", tried: [resolved] };
    return {
      path: "",
      source: "环境变量 ZCODE_COST_METER_ZCODE",
      tried: [resolved],
      error: `环境变量 ZCODE_COST_METER_ZCODE 指向的路径不是可用的 ${ZCODE_BIN}：${resolved}`
    };
  }
  const candidates = [];
  const add = (target, source) => { if (target) candidates.push({ path: expandPath(target), source }); };
  let cursor = INSTALL_DIR;
  for (let depth = 0; depth < 6 && cursor; depth++) {
    add(path.join(cursor, ZCODE_BIN), "程序所在位置");
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (process.platform === "win32") {
    for (const root of listDriveRoots()) add(path.join(root, "zcode", "ZCode.exe"), "盘符常见位置");
    for (const key of ["ProgramFiles", "ProgramFiles(x86)"]) {
      const base = process.env[key];
      if (base) add(path.join(base, "ZCode", "ZCode.exe"), "标准安装位置");
    }
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    add(path.join(localAppData, "Programs", "ZCode", "ZCode.exe"), "标准安装位置");
    // PATH 可能含失效网络路径导致 where 变慢，限制 5 秒
    try {
      const out = execSync("where ZCode.exe", { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
      add(out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0], "PATH");
    } catch {}
  } else if (process.platform === "darwin") {
    add("/Applications/ZCode.app", "标准安装位置");
    add(path.join(os.homedir(), "Applications", "ZCode.app"), "标准安装位置");
    try {
      const out = execSync("mdfind \"kMDItemFSName == 'ZCode.app'\"", { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
      for (const line of out.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 10)) add(line, "Spotlight");
    } catch {}
  } else {
    try {
      const out = execSync("command -v zcode", { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] });
      const onPath = out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0];
      if (onPath) {
        try { add(fs.realpathSync(onPath), "PATH"); } catch {}
        add(onPath, "PATH");
      }
    } catch {}
    add("/opt/ZCode/zcode", "标准安装位置");
    add("/usr/local/bin/zcode", "标准安装位置");
    add(path.join(os.homedir(), ".local", "bin", "zcode"), "标准安装位置");
  }
  const tried = [];
  for (const candidate of candidates) {
    tried.push(candidate.path);
    const resolved = resolveMacApp(candidate.path);
    if (isFile(resolved)) return { path: resolved, source: candidate.source, tried };
  }
  return { path: "", source: null, tried };
}

function loadRuntimeConfig() {
  const raw = readJson(CONFIG_FILE, {});
  const configuredZcode = String(raw.zcodePath || "").trim();
  const configuredDb = String(raw.dbPath || "").trim();
  // 配置留空即走自动探测，避免把某一台机器的绝对路径固化下来
  let zcodePath = "";
  let zcodePathSource = "配置文件";
  let zcodePathTried = [];
  if (configuredZcode) {
    zcodePath = resolveMacApp(expandPath(configuredZcode));
    zcodePathTried = [zcodePath];
  } else {
    const detected = findZcodePath();
    zcodePath = detected.path;
    zcodePathSource = detected.source;
    zcodePathTried = detected.tried;
  }
  return {
    ...sanitizeConfig(raw),
    zcodePath,
    zcodePathSource,
    zcodePathTried,
    dbPath: configuredDb ? expandPath(configuredDb) : DEFAULT_DB,
    dbPathIsDefault: !configuredDb,
    port: Math.min(PORT_MAX, Math.max(PORT_MIN, Number(raw.port) || PORT_MIN))
  };
}

function saveRuntimeConfig(next) {
  const current = loadRuntimeConfig();
  const safe = sanitizeConfig({ ...current, ...next });
  // 回写磁盘时保留用户原始写法（留空仍是留空），不把本次探测到的绝对路径固化进配置
  const onDisk = readJson(CONFIG_FILE, {});
  const persisted = {
    _readme: [
      "ZCode 会话费用统计配置。价格单位均为每百万 token。",
      "zcodePath / dbPath 留空 \"\" 表示自动探测，可跨机器复用；",
      "也支持 ~ 、%USERPROFILE% 、%LOCALAPPDATA% 、$HOME 等写法，",
      "或用环境变量 ZCODE_COST_METER_ZCODE 指定可执行文件、用 ZCODE_HOME 指定数据目录。",
      "插件只读 dbPath，不读取 credentials.json 或任何 API Key。",
      "第三方 Provider 的实际账单可能与同名模型官方价不同，请按渠道账单修改价格。"
    ],
    _pathHint: "zcodePath / dbPath 留空即自动探测；如需固定，可写绝对路径或含 ~ / %USERPROFILE% 等变量的路径。",
    ...safe,
    zcodePath: String(onDisk?.zcodePath ?? "").trim(),
    dbPath: String(onDisk?.dbPath ?? "").trim(),
    port: current.port
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(persisted, null, 2) + "\n", "utf8");
  return persisted;
}

function mergeOfficialPrices(prices) {
  const officialModels = new Set(DEFAULT_PRICES.map((price) => price.model.toLowerCase()));
  const custom = (Array.isArray(prices) ? prices : []).filter((price) => !(
    String(price?.provider || "*") === "*" && officialModels.has(String(price?.model || "").toLowerCase())
  ));
  return [...DEFAULT_PRICES.map((price) => ({ ...price })), ...custom];
}

function ensureConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    saveRuntimeConfig(defaultConfig());
    return;
  }
  const raw = readJson(CONFIG_FILE, {});
  if (raw?.pricingSource?.version === OFFICIAL_PRICE_VERSION) return;
  saveRuntimeConfig({
    ...raw,
    currency: "CNY",
    prices: mergeOfficialPrices(raw.prices),
    pricingSource: {
      kind: "official",
      currency: "CNY",
      url: OFFICIAL_PRICING_URL,
      version: OFFICIAL_PRICE_VERSION,
      syncedAt: Date.now()
    }
  });
}

function findDeepSeekApiKey() {
  const zcodeConfig = readJson(ZCODE_V2_CONFIG, {});
  for (const provider of Object.values(zcodeConfig?.provider || {})) {
    const baseUrl = String(provider?.options?.baseURL || "");
    let hostname = "";
    try { hostname = new URL(baseUrl).hostname.toLowerCase(); } catch {}
    const apiKey = String(provider?.options?.apiKey || "").trim();
    if ((hostname === "api.deepseek.com" || hostname.endsWith(".deepseek.com")) && apiKey) return apiKey;
  }
  return "";
}

async function refreshOfficialBalance() {
  if (balanceRefreshPromise) return balanceRefreshPromise;
  balanceRefreshPromise = (async () => {
    balanceState = { ...balanceState, status: "loading", error: null };
    try {
      const apiKey = findDeepSeekApiKey();
      if (!apiKey) throw new Error("ZCode 中未找到 DeepSeek 官方 API Key");
      const response = await fetch("https://api.deepseek.com/user/balance", {
        headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(`DeepSeek 余额接口返回 HTTP ${response.status}`);
      const payload = await response.json();
      const info = (Array.isArray(payload?.balance_infos) ? payload.balance_infos : []).find((item) => item.currency === "CNY")
        || payload?.balance_infos?.[0];
      if (!info) throw new Error("DeepSeek 余额响应缺少 balance_infos");
      balanceState = {
        status: "ready",
        isAvailable: payload.is_available === true,
        currency: String(info.currency || "CNY"),
        total: Number(info.total_balance),
        granted: Number(info.granted_balance),
        toppedUp: Number(info.topped_up_balance),
        updatedAt: Date.now(),
        error: null
      };
    } catch (error) {
      balanceState = { ...balanceState, status: "error", updatedAt: Date.now(), error: safeError(error) };
    } finally {
      balanceRefreshPromise = null;
    }
    return balanceState;
  })();
  return balanceRefreshPromise;
}

function maybeRefreshBalance(config) {
  if (config.balance?.enabled === false || balanceRefreshPromise) return;
  const maxAge = Math.max(1, Number(config.balance?.refreshMinutes) || 15) * 60000;
  if (!balanceState.updatedAt || Date.now() - balanceState.updatedAt >= maxAge) void refreshOfficialBalance();
}

async function syncOfficialPrices() {
  const response = await fetch(OFFICIAL_PRICING_URL, {
    headers: { Accept: "text/html", "User-Agent": "ZCodeCostMeter/0.3" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`DeepSeek 官网返回 HTTP ${response.status}`);
  const html = await response.text();
  const plain = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#xA0;/gi, " ");
  for (const marker of ["deepseek-flash", "deepseek-v4-pro", "0.02", "13.5"]) {
    if (!plain.includes(marker)) throw new Error(`DeepSeek 官网价格页结构已变化（缺少 ${marker}），未覆盖本地价格`);
  }
  const current = loadRuntimeConfig();
  return saveRuntimeConfig({
    ...current,
    currency: "CNY",
    prices: mergeOfficialPrices(current.prices),
    pricingSource: {
      kind: "official",
      currency: "CNY",
      url: OFFICIAL_PRICING_URL,
      version: OFFICIAL_PRICE_VERSION,
      syncedAt: Date.now()
    }
  });
}

function acquireLock() {
  const oldPid = Number(readJson(LOCK_FILE));
  if (Number.isInteger(oldPid) && oldPid > 0 && oldPid !== process.pid) {
    try { process.kill(oldPid, 0); return false; } catch {}
  }
  try { fs.writeFileSync(LOCK_FILE, String(process.pid)); } catch {}
  const release = () => {
    try {
      if (String(readJson(LOCK_FILE)) === String(process.pid)) fs.rmSync(LOCK_FILE, { force: true });
    } catch {}
  };
  process.on("exit", release);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));
  return true;
}

function showMessage(text, buttons = "OK") {
  const encoded = Buffer.from(String(text), "utf16le").toString("base64");
  const script = `$t=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}'));Add-Type -AssemblyName PresentationFramework;[System.Windows.MessageBox]::Show($t,'ZCode 费用统计','${buttons}','Information')`;
  try {
    return execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 120000 }).trim();
  } catch { return ""; }
}

function zcodeRunning() {
  try {
    return /ZCode\.exe/i.test(execSync('tasklist /fi "IMAGENAME eq ZCode.exe" /fo csv /nh', { encoding: "utf8" }));
  } catch { return false; }
}

function killZcode() {
  try { execSync("taskkill /IM ZCode.exe /F", { stdio: "ignore" }); } catch {}
}

function portInUse(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => server.close(() => resolve(false)));
    server.listen(port, "127.0.0.1");
  });
}

async function fetchJson(url, timeout = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok ? await response.json() : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function cdpVersion(port) {
  const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
  return version?.webSocketDebuggerUrl ? version : null;
}

async function isZcodeCdp(port) {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  return Array.isArray(targets) && targets.some((t) => /zcode/i.test(`${t.title} ${t.url}`));
}

async function findExistingCdp() {
  for (const port of DISCOVERY_PORTS) {
    const version = await cdpVersion(port);
    if (version && await isZcodeCdp(port)) return { port, version };
  }
  return null;
}

async function findFreePort(preferred) {
  for (let port = preferred; port <= PORT_MAX; port++) if (!await portInUse(port)) return port;
  for (let port = PORT_MIN; port < preferred; port++) if (!await portInUse(port)) return port;
  throw new Error(`调试端口 ${PORT_MIN}-${PORT_MAX} 均被占用`);
}

async function waitForCdp(port, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const version = await cdpVersion(port);
    if (version) return version;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return null;
}

function startOfCstDay(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(now));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return Date.parse(`${get("year")}-${get("month")}-${get("day")}T00:00:00+08:00`);
}

function startOfCstMonth(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit"
  }).formatToParts(new Date(now));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return Date.parse(`${get("year")}-${get("month")}-01T00:00:00+08:00`);
}

const USAGE_COLUMNS = `u.provider_id,u.model_id,u.started_at,u.input_tokens,u.output_tokens,
  u.cache_creation_input_tokens,u.cache_read_input_tokens,1 AS calls`;

function completedRowsSince(db, start) {
  return db.prepare(`SELECT ${USAGE_COLUMNS} FROM model_usage u WHERE u.status='completed' AND u.started_at>=?`).all(start);
}

function sessionRows(db, sessionId, includeSubagents) {
  if (!sessionId) return [];
  if (!includeSubagents) {
    return db.prepare(`SELECT ${USAGE_COLUMNS} FROM model_usage u WHERE u.status='completed' AND u.session_id=?`).all(sessionId);
  }
  return db.prepare(`WITH RECURSIVE tree(id) AS (
    SELECT ? UNION ALL SELECT s.id FROM session s JOIN tree t ON s.parent_id=t.id
  ) SELECT ${USAGE_COLUMNS} FROM model_usage u JOIN tree t ON t.id=u.session_id WHERE u.status='completed'`).all(sessionId);
}

function allRows(db) {
  return db.prepare(`SELECT ${USAGE_COLUMNS} FROM model_usage u WHERE u.status='completed'`).all();
}

function recentSessions(db) {
  return db.prepare(`SELECT id,title,directory,time_updated FROM session
    WHERE parent_id IS NULL AND time_archived IS NULL ORDER BY time_updated DESC LIMIT 50`).all();
}

function sessionById(db, id) {
  if (!id) return null;
  return db.prepare(`SELECT id,title,directory,time_updated FROM session
    WHERE id=? AND parent_id IS NULL LIMIT 1`).get(id) || null;
}

function snapshot(requestedSessionId) {
  const config = loadRuntimeConfig();
  maybeRefreshBalance(config);
  if (!fs.existsSync(config.dbPath)) {
    throw new Error(
      `找不到 ZCode 用量数据库：${config.dbPath}\n`
      + `若 ZCode 数据目录不在默认位置，请设置环境变量 ZCODE_HOME（当前解析为 ${ZCODE_HOME}），`
      + `或在配置文件的 dbPath 中填写：${CONFIG_FILE}`
    );
  }
  const db = new DatabaseSync(config.dbPath, { readOnly: true });
  try {
    let sessions = recentSessions(db);
    const selected = sessions.find((s) => s.id === requestedSessionId) || sessionById(db, requestedSessionId) || sessions[0] || null;
    if (selected && !sessions.some((sessionItem) => sessionItem.id === selected.id)) sessions = [selected, ...sessions];
    const todayStart = startOfCstDay();
    const monthStart = startOfCstMonth();
    const session = summarizeRows(sessionRows(db, selected?.id, config.includeSubagents), config);
    const today = summarizeRows(completedRowsSince(db, todayStart), config);
    const month = summarizeRows(completedRowsSince(db, monthStart), config);
    const total = summarizeRows(allRows(db), config);
    const unknown = [...new Set([...session.unknownModels, ...today.unknownModels])];
    const peakPhase = peakPhaseAt(Date.now(), config.peakPricing);
    return {
      ok: true,
      version: VERSION,
      generatedAt: Date.now(),
      selectedSession: selected,
      sessions,
      session,
      today,
      month,
      total,
      unknownModels: unknown,
      budget: config.budget,
      budgetPeriod: config.budgetPeriod,
      currency: config.currency,
      refreshSeconds: config.refreshSeconds,
      includeSubagents: config.includeSubagents,
      display: config.display,
      balanceConfig: config.balance,
      balance: { ...balanceState },
      pricingSource: config.pricingSource,
      peak: peakPhase?.inPeak === true,
      peakPhase,
      peakPricing: config.peakPricing
    };
  } finally { db.close(); }
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.targets = new Set();
    this.closed = false;
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      const timer = setTimeout(() => reject(new Error("连接 CDP 超时")), 15000);
      this.ws.addEventListener("open", () => { clearTimeout(timer); resolve(); });
      this.ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP WebSocket 连接失败")); });
      this.ws.addEventListener("close", () => {
        this.closed = true;
        for (const p of this.pending.values()) p.reject(new Error("CDP 已关闭"));
        this.pending.clear();
      });
      this.ws.addEventListener("message", (event) => this.onMessage(event.data));
    });
  }
  onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.id && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      return;
    }
    if (msg.method === "Target.attachedToTarget") void this.attach(msg.params);
    if (msg.method === "Runtime.bindingCalled" && msg.params?.name === "__zcodeCostMeter") {
      void handleBinding(this, msg.sessionId, msg.params.payload);
    }
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.ws.send(JSON.stringify(message)); }
      catch (error) { this.pending.delete(id); reject(error); }
    });
  }
  async attach(params) {
    const info = params?.targetInfo;
    if (!info || !["page", "webview"].includes(info.type) || this.targets.has(info.targetId)) return;
    this.targets.add(info.targetId);
    const sessionId = params.sessionId;
    try {
      await this.send("Runtime.enable", {}, sessionId);
      await this.send("Runtime.addBinding", { name: "__zcodeCostMeter" }, sessionId);
      await this.send("Page.enable", {}, sessionId);
      await this.send("Page.addScriptToEvaluateOnNewDocument", { source: INJECT_SOURCE }, sessionId);
      await this.send("Runtime.evaluate", { expression: INJECT_SOURCE }, sessionId);
      log(`已注入 target=${info.targetId}`);
    } catch (error) { log("注入失败:", safeError(error)); }
  }
  reply(sessionId, id, result) {
    const expression = `window.__zcodeCostMeterReply?.(${Number(id) || 0},${JSON.stringify(JSON.stringify(result))})`;
    return this.send("Runtime.evaluate", { expression }, sessionId).catch((error) => log("页面回复失败:", safeError(error)));
  }
}

async function handleBinding(cdp, sessionId, payload) {
  let msg;
  try { msg = JSON.parse(payload); } catch { return; }
  if (!Number.isFinite(msg?.id)) return;
  try {
    if (msg.type === "snapshot") await cdp.reply(sessionId, msg.id, snapshot(String(msg.sessionId || "")));
    else if (msg.type === "config") await cdp.reply(sessionId, msg.id, { ok: true, config: loadRuntimeConfig() });
    else if (msg.type === "saveConfig") await cdp.reply(sessionId, msg.id, { ok: true, config: saveRuntimeConfig(msg.config || {}) });
    else if (msg.type === "refreshBalance") await cdp.reply(sessionId, msg.id, { ok: true, balance: await refreshOfficialBalance() });
    else if (msg.type === "syncOfficialPrices") await cdp.reply(sessionId, msg.id, { ok: true, config: await syncOfficialPrices(), models: DEFAULT_PRICES.map((price) => price.model) });
    else await cdp.reply(sessionId, msg.id, { ok: false, error: "未知请求" });
  } catch (error) {
    log("请求失败:", safeError(error));
    await cdp.reply(sessionId, msg.id, { ok: false, error: safeError(error) });
  }
}

let INJECT_SOURCE = "";
try {
  INJECT_SOURCE = `globalThis.__zcodeCostMeterVersion=${JSON.stringify(VERSION)};\n`
    + fs.readFileSync(path.join(INSTALL_DIR, "inject.js"), "utf8");
} catch (error) {
  log("读取 inject.js 失败:", safeError(error));
  process.exit(1);
}

async function serve(url) {
  const cdp = new CdpConnection(url);
  await cdp.connect();
  await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  const targets = await cdp.send("Target.getTargets");
  for (const info of targets.targetInfos || []) {
    if (!["page", "webview"].includes(info.type)) continue;
    try { await cdp.send("Target.attachToTarget", { targetId: info.targetId, flatten: true }); }
    catch (error) { log("附着页面失败:", safeError(error)); }
  }
  log("CDP 已连接");
  while (!cdp.closed) await new Promise((resolve) => setTimeout(resolve, 1000));
}

async function main() {
  ensureConfig();
  if (!acquireLock()) process.exit(0);
  const config = loadRuntimeConfig();
  const existing = await findExistingCdp();
  if (existing) return serve(existing.version.webSocketDebuggerUrl);
  if (!fs.existsSync(config.zcodePath)) {
    const tried = config.zcodePathTried.length ? config.zcodePathTried.slice(0, 12).join("\n") : "（无候选路径）";
    showMessage(
      `未找到 ZCode 可执行文件（${ZCODE_BIN}）。\n\n已尝试以下位置：\n${tried}\n\n`
      + `解决方法（任选其一）：\n`
      + `1) 在配置文件中填写 zcodePath：\n${CONFIG_FILE}\n`
      + `2) 设置环境变量 ZCODE_COST_METER_ZCODE 指向 ZCode 可执行文件。`
    );
    process.exit(1);
  }
  if (zcodeRunning()) {
    const choice = showMessage("ZCode 当前正在运行。费用统计需要用 CDP 模式重启 ZCode；未发送的草稿可能丢失。是否现在重启？", "YesNo");
    if (!/Yes/i.test(choice)) process.exit(0);
    killZcode();
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const port = await findFreePort(config.port);
  log(`使用端口 ${port} 启动 ZCode`);
  const child = spawn(config.zcodePath, [`--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${port}`], {
    cwd: path.dirname(config.zcodePath), stdio: "ignore", shell: false
  });
  child.once("error", (error) => { showMessage(`启动 ZCode 失败：${safeError(error)}`); process.exit(1); });
  child.once("exit", () => process.exit(0));
  const version = await waitForCdp(port);
  if (!version) throw new Error("等待 ZCode CDP 就绪超时");
  await serve(version.webSocketDebuggerUrl);
}

if (process.argv.includes("--snapshot")) {
  ensureConfig();
  console.log(JSON.stringify(snapshot(process.argv[process.argv.indexOf("--snapshot") + 1] || ""), null, 2));
} else if (process.argv.includes("--paths")) {
  const config = loadRuntimeConfig();
  console.log(JSON.stringify({
    version: VERSION,
    platform: process.platform,
    zcodeHome: ZCODE_HOME,
    zcodePath: config.zcodePath,
    zcodePathSource: config.zcodePathSource,
    zcodePathExists: fs.existsSync(config.zcodePath),
    zcodePathTried: config.zcodePathTried,
    dbPath: config.dbPath,
    dbPathExists: fs.existsSync(config.dbPath),
    port: config.port
  }, null, 2));
} else if (process.argv.includes("--version")) {
  console.log(VERSION);
} else {
  main().catch((error) => { log("致命错误:", safeError(error)); showMessage(`费用统计启动失败：${safeError(error)}\n\n日志：${LOG_FILE}`); process.exit(1); });
}
