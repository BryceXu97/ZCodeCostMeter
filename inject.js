/* ZCode Cost Meter sidebar — injected into ZCode Chromium pages over CDP. */
(() => {
  const VERSION = globalThis.__zcodeCostMeterVersion || "dev";
  const RUNTIME = "__zcodeCostMeterRuntime";
  const HOST_ID = "zcode-cost-meter-host";
  const UI_KEY = "zcodeCostMeter.ui.v1";
  const previous = globalThis[RUNTIME];
  if (previous?.version === VERSION && !previous.disposed) return;
  previous?.dispose?.();

  let disposed = false;
  let host = null;
  let shadow = null;
  let root = null;
  let portalHost = null;
  let portalShadow = null;
  let settingsOverlay = null;
  let peakAlert = null;
  let snapshot = null;
  let refreshTimer = 0;
  let activeSyncTimer = 0;
  let refreshBusy = false;
  let requestId = 0;
  const pending = new Map();

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const attr = esc;
  const compact = (value) => {
    const n = Number(value) || 0;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(Math.round(n));
  };
  const money = (value, currency = snapshot?.currency || "CNY") => {
    const n = Number(value) || 0;
    const symbol = currency === "USD" ? "$" : "¥";
    return `${symbol}${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
  };
  const readUi = () => {
    try { return { collapsed: false, sessionId: "", ...JSON.parse(localStorage.getItem(UI_KEY) || "{}") }; }
    catch { return { collapsed: false, sessionId: "" }; }
  };
  const saveUi = (patch) => localStorage.setItem(UI_KEY, JSON.stringify({ ...readUi(), ...patch }));

  window.__zcodeCostMeterReply = (id, payload) => {
    const item = pending.get(Number(id));
    if (!item) return;
    pending.delete(Number(id));
    clearTimeout(item.timer);
    let data;
    try { data = JSON.parse(payload); } catch { data = { ok: false, error: "控制器返回了无效数据" }; }
    data?.ok ? item.resolve(data) : item.reject(new Error(data?.error || "控制器请求失败"));
  };

  function request(type, extra = {}) {
    if (typeof window.__zcodeCostMeter !== "function") return Promise.reject(new Error("费用统计控制器未连接"));
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("控制器响应超时")); }, 15000);
      pending.set(id, { resolve, reject, timer });
      try { window.__zcodeCostMeter(JSON.stringify({ id, type, ...extra })); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  }

  const CSS = `
    :host { all: initial; display: block; width: 100%; min-width: 0; color-scheme: light dark; }
    * { box-sizing: border-box; }
    button, input, select { font: inherit; }
    .panel { position: relative; z-index: 20; width: 100%;
      display: flex; flex-direction: column; overflow: hidden; color: #e8edf5; background: rgba(20,24,32,.97);
      border: 1px solid rgba(255,255,255,.12); border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.2);
      font: 12px/1.45 Inter, "Segoe UI", "Microsoft YaHei", sans-serif; backdrop-filter: blur(18px); }
    .panel.collapsed { min-height: 34px; border-radius: 9px; cursor: pointer; }
    .panel.collapsed .expanded { display: none; }
    .rail { display: none; height: 34px; padding: 0 9px; align-items: center; justify-content: space-between; gap: 8px; }
    .collapsed .rail { display: flex; }
    .rail strong { flex: 1; color: #7dd3fc; font-size: 12px; }
    .rail svg, .icon svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; }
    .head { display: flex; align-items: center; gap: 7px; padding: 8px 9px 7px; border-bottom: 1px solid rgba(255,255,255,.08); }
    .brand { flex: 1; min-width: 0; }
    .brand strong { display: block; font-size: 13px; }
    .brand small { display: block; color: #8d98aa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dot { width: 7px; height: 7px; border-radius: 50%; transition: opacity .16s ease; }
    .dot.peak { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; }
    .dot.offpeak { background: #3b82f6; box-shadow: 0 0 10px #3b82f6; }
    .dot.busy { animation: meter-pulse .8s ease-in-out infinite alternate; }
    @keyframes meter-pulse { from { opacity: .35; } to { opacity: 1; } }
    .icon { width: 27px; height: 27px; display: grid; place-items: center; color: #aab4c4; background: transparent;
      border: 0; border-radius: 7px; cursor: pointer; }
    .icon:hover { color: white; background: rgba(255,255,255,.08); }
    .body { padding: 8px 9px 9px; overflow: auto; scrollbar-width: thin; }
    .cost-line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 12px; }
    .cost-line b { font-size: 16px; font-variant-numeric: tabular-nums; }
    .task-line { margin-top: 5px; color: #8d98aa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 10px; }
    .balance-card { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.08); cursor: pointer; outline: none; }
    .balance-card:hover { color: white; }
    .balance-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .balance-line strong { font-size: 14px; font-variant-numeric: tabular-nums; }
    .balance-line small { color: #8d98aa; }
    .balance-meta { margin-top: 3px; color: #7d8797; font-size: 9px; }
    .balance-track { display: flex; height: 6px; margin-top: 7px; overflow: hidden; border-radius: 99px; background: rgba(255,255,255,.08); }
    .balance-track .spent { background: #f59e0b; }
    .balance-track .remaining { background: #6598ef; }
    .session-select { width: 100%; color: #dce5f1; background: #151a23; border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px; padding: 7px 8px; outline: none; }
    .hero { padding: 16px 2px 12px; text-align: center; }
    .hero .amount { font-size: 31px; font-weight: 720; letter-spacing: -1.2px; color: #7dd3fc; }
    .hero .meta { color: #8d98aa; margin-top: 2px; }
    .periods { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; }
    .period { padding: 8px 6px; border: 1px solid rgba(255,255,255,.08); border-radius: 9px; background: rgba(255,255,255,.035); }
    .period span { color: #8d98aa; display: block; font-size: 10px; }
    .period b { display: block; margin-top: 2px; font-size: 13px; }
    .section { margin-top: 12px; padding-top: 11px; border-top: 1px solid rgba(255,255,255,.08); }
    .section-title { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 7px; color: #aab4c4; font-size: 11px; }
    .stats { display: grid; grid-template-columns: repeat(2,1fr); gap: 6px; }
    .stat { border-radius: 8px; padding: 7px 8px; background: rgba(255,255,255,.035); }
    .stat span { color: #8d98aa; font-size: 10px; display: block; }
    .stat b { font-size: 13px; }
    .bar { height: 6px; overflow: hidden; border-radius: 99px; background: rgba(255,255,255,.1); }
    .bar i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg,#38bdf8,#818cf8); }
    .bar i.warn { background: linear-gradient(90deg,#f59e0b,#ef4444); }
    .model { padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
    .model:last-child { border-bottom: 0; }
    .model-line { display: flex; align-items: baseline; gap: 8px; }
    .model-line b { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px; }
    .model-line em { color: #7dd3fc; font-style: normal; }
    .model small { color: #7d8797; }
    .notice { margin-top: 9px; padding: 8px; border-radius: 8px; color: #fbbf24; background: rgba(245,158,11,.1); border: 1px solid rgba(245,158,11,.18); }
    .phase { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.08); }
    .phase-line { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; }
    .phase-line b { color: #3b82f6; }
    .phase.peak .phase-line b { color: #f59e0b; }
    .phase-track { position: relative; display: grid; grid-template-columns: 1fr 1fr; height: 6px; margin-top: 6px; overflow: hidden; border-radius: 99px; }
    .phase-track i:first-child { background: #f59e0b; }
    .phase-track i:last-child { background: #3b82f6; }
    .phase-marker { position: absolute; top: -2px; bottom: -2px; width: 3px; left: 75%; border-radius: 3px; background: white; box-shadow: 0 0 0 1px #111827; }
    .phase.peak .phase-marker { left: 25%; }
    .error { margin: 10px; padding: 10px; color: #fecaca; background: rgba(239,68,68,.12); border-radius: 8px; }
    .foot { padding: 5px 9px; color: #667085; border-top: 1px solid rgba(255,255,255,.08); font-size: 9px; }
    .overlay { position: fixed; z-index: 2147483100; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(4,7,12,.68); }
    .dialog { width: min(980px, calc(100vw - 48px)); max-height: min(820px, calc(100vh - 48px)); overflow: auto;
      color: #e8edf5; background: #151a23; border: 1px solid rgba(255,255,255,.14); border-radius: 14px; box-shadow: 0 24px 80px rgba(0,0,0,.5); }
    .dialog-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; padding: 13px 15px; background: #151a23; border-bottom: 1px solid rgba(255,255,255,.09); }
    .dialog-head b { flex: 1; font-size: 14px; }
    .form { padding: 15px; }
    .overview-cards { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 16px; }
    .overview-card { padding: 12px; border: 1px solid rgba(255,255,255,.09); border-radius: 10px; background: rgba(255,255,255,.035); }
    .overview-card span { display: block; color: #8d98aa; font-size: 10px; }
    .overview-card b { display: block; margin-top: 4px; font-size: 18px; }
    .settings-section { margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.09); }
    .settings-section h3 { margin: 0 0 10px; font-size: 13px; }
    .settings-hint { margin: -5px 0 10px; color: #7d8797; font-size: 10px; }
    .source-line { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 9px 0; color: #8d98aa; }
    .source-line a { color: #7dd3fc; }
    .status-pill { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 8px; border-radius: 99px; color: #93c5fd; background: rgba(59,130,246,.12); }
    .status-pill.error { color: #fca5a5; background: rgba(239,68,68,.12); }
    .form-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 14px; }
    label { color: #aab4c4; font-size: 11px; }
    input, select { width: 100%; margin-top: 4px; padding: 7px; color: #e8edf5; background: #0f141c; border: 1px solid rgba(255,255,255,.13); border-radius: 7px; }
    .check { display: flex; gap: 7px; align-items: center; padding-top: 22px; }
    .check input { width: auto; margin: 0; }
    .price-wrap { overflow-x: auto; }
    table { width: 100%; min-width: 670px; border-collapse: collapse; }
    th { color: #8d98aa; font-weight: 500; text-align: left; font-size: 10px; }
    th, td { padding: 4px; }
    td input { margin: 0; padding: 6px; }
    .actions { position: sticky; bottom: 0; display: flex; justify-content: space-between; gap: 8px; padding: 12px 15px; background: #151a23; border-top: 1px solid rgba(255,255,255,.09); }
    .btn { padding: 7px 11px; border: 1px solid rgba(255,255,255,.13); border-radius: 8px; color: #dce5f1; background: rgba(255,255,255,.05); cursor: pointer; }
    .btn.primary { color: #06121b; background: #7dd3fc; border-color: #7dd3fc; font-weight: 650; }
    .btn:hover { filter: brightness(1.1); }
    .btn:disabled { opacity: .55; cursor: wait; }
    .peak-alert { position: fixed; z-index: 2147483200; width: 340px; max-width: calc(100vw - 32px); padding: 16px;
      color: #e8edf5; background: #202228; border: 1px solid rgba(255,255,255,.14); border-radius: 14px;
      box-shadow: 0 18px 55px rgba(0,0,0,.48); font: 12px/1.55 Inter, "Segoe UI", "Microsoft YaHei", sans-serif; animation: alert-in .2s ease-out; }
    .peak-alert.center { top: 50%; left: 50%; transform: translate(-50%,-50%); }
    .peak-alert.corner { right: 20px; bottom: 20px; }
    .peak-alert.enter-peak { border-top: 3px solid #f59e0b; }
    .peak-alert.enter-offpeak { border-top: 3px solid #3b82f6; }
    .alert-badge { display: flex; align-items: center; gap: 7px; font-weight: 650; }
    .alert-badge::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 5px color-mix(in srgb,currentColor 15%,transparent); }
    .enter-peak .alert-badge { color: #f59e0b; }
    .enter-offpeak .alert-badge { color: #3b82f6; }
    .alert-title { margin-top: 10px; font-size: 16px; font-weight: 700; }
    .alert-body { margin-top: 7px; color: #c4c9d3; }
    .alert-actions { display: flex; justify-content: flex-end; margin-top: 14px; }
    @keyframes alert-in { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .peak-alert.center { animation-name: alert-center-in; }
    @keyframes alert-center-in { from { opacity: 0; transform: translate(-50%,calc(-50% + 10px)); } to { opacity: 1; transform: translate(-50%,-50%); } }
    @media (prefers-color-scheme: light) {
      .panel { color: #172033; background: rgba(249,251,255,.97); border-color: rgba(15,23,42,.14); box-shadow: 0 14px 45px rgba(15,23,42,.16); }
      .session-select, input, select { color: #172033; background: #fff; border-color: rgba(15,23,42,.15); }
      .period, .stat, .phase { background: rgba(15,23,42,.035); }
      .dialog, .dialog-head, .actions { color: #172033; background: #f9fbff; }
      .peak-alert { color: #172033; background: #f9fbff; }
      .alert-body { color: #475569; }
    }
  `;

  const icon = (name) => name === "collapse"
    ? '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.97 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 8.97a1.7 1.7 0 0 0-.34-1.88L4.2 7.03 7.03 4.2l.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15.03 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.97 1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></svg>';

  function mount() {
    if (disposed || document.getElementById(HOST_ID)) return;
    const footer = document.querySelector('[data-testid="login-trigger"]')?.closest("footer");
    if (!footer) return;
    host = document.createElement("div");
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    root = document.createElement("div");
    root.dataset.role = "meter-root";
    shadow.append(style, root);
    footer.insertBefore(host, footer.firstElementChild);
    portalHost?.remove();
    portalHost = document.createElement("div");
    portalHost.id = `${HOST_ID}-portal`;
    portalHost.style.display = "contents";
    portalShadow = portalHost.attachShadow({ mode: "open" });
    const portalStyle = document.createElement("style");
    portalStyle.textContent = CSS;
    portalShadow.appendChild(portalStyle);
    document.documentElement.appendChild(portalHost);
    syncActiveSession(0);
    render();
    void refresh();
  }

  function summaryCard(label, value) {
    return `<div class="period"><span>${esc(label)}</span><b>${money(value)}</b></div>`;
  }

  function countdown(nextAtMs, now = Date.now()) {
    if (!Number.isFinite(Number(nextAtMs))) return "暂无切换计划";
    const minutes = Math.max(1, Math.ceil((Number(nextAtMs) - now) / 60000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours && rest) return `${hours}小时${rest}分钟`;
    if (hours) return `${hours}小时`;
    return `${minutes}分钟`;
  }

  function phaseMarkup() {
    const phase = snapshot?.peakPhase;
    if (!phase) return "";
    const status = phase.weekend ? "周末 · 全天谷时" : phase.inPeak ? "峰时 · 峰价计费" : "谷时 · 谷价计费";
    const next = phase.nextIntoPeak ? "后进入峰时" : "后进入谷时";
    return `<div class="phase ${phase.inPeak ? "peak" : "offpeak"}"><div class="phase-line"><b>${status}</b><span>${countdown(phase.nextAtMs)}${next}</span></div><div class="phase-track" aria-label="${attr(status)}"><i></i><i></i><span class="phase-marker"></span></div></div>`;
  }

  function render() {
    if (!root) return;
    const ui = readUi();
    if (!snapshot) {
      root.innerHTML = `<aside class="panel${ui.collapsed ? " collapsed" : ""}"><div class="rail"><span>¥</span><strong>读取中</strong><span>›</span></div><div class="expanded error">正在连接费用统计控制器…</div></aside>`;
      bindUi();
      return;
    }
    const s = snapshot.session;
    const display = snapshot.display || {};
    const balance = snapshot.balance || {};
    const balanceText = balance.status === "loading" ? "刷新中…" : balance.status === "ready" ? money(balance.total, balance.currency) : balance.status === "error" ? "点击重试" : "点击查询";
    const available = Math.max(0, Number(balance.total) || 0);
    const spent = Math.max(0, Number(snapshot.today.cost) || 0);
    const balanceBase = available + spent;
    const spentPct = balanceBase > 0 ? Math.min(100, spent / balanceBase * 100) : 0;
    root.innerHTML = `<aside class="panel${ui.collapsed ? " collapsed" : ""}" data-selected-session="${attr(snapshot.selectedSession?.id || "")}">
      <div class="rail" title="展开费用统计"><span>${snapshot.peak ? "峰" : "谷"}</span><strong>今日 ${money(snapshot.today.cost)}</strong><span>⌃</span></div>
      <div class="expanded head"><span class="dot ${snapshot.peak ? "peak" : "offpeak"}"></span><div class="brand"><strong>费用统计</strong><small>DeepSeek 官网计价 · v${esc(snapshot.version)}</small></div>
        <button class="icon" data-action="settings" title="设置">${icon("settings")}</button><button class="icon" data-action="collapse" title="收起">${icon("collapse")}</button></div>
      <div class="expanded body">
        ${display.showTodayCost !== false ? `<div class="cost-line"><span>今日</span><b>${money(snapshot.today.cost)}</b></div>` : ""}
        ${display.showSessionCost !== false ? `<div class="task-line" title="${attr(snapshot.selectedSession?.title || "当前任务")}">本会话 ${money(s.cost)} · ${s.calls} 次 · ${esc(snapshot.selectedSession?.title || "当前任务")}</div>` : ""}
        ${display.showBalance !== false && snapshot.balanceConfig?.enabled !== false ? `<div class="balance-card" data-action="balance" role="button" tabindex="0" title="点击刷新 DeepSeek 官方余额"><div class="balance-line"><span>余额 ↗</span><strong>${balanceText}</strong></div>${balance.status === "ready" ? `<div class="balance-meta">赠金 ${money(balance.granted, balance.currency)} · 充值 ${money(balance.toppedUp, balance.currency)} · ${balance.isAvailable ? "可用" : "不可用"}</div>` : balance.error ? `<div class="balance-meta">${esc(balance.error)}</div>` : ""}${snapshot.balanceConfig?.showProgressBar !== false ? `<div class="balance-track"><i class="spent" style="width:${spentPct}%"></i><i class="remaining" style="width:${100 - spentPct}%"></i></div>` : ""}</div>` : ""}
        ${display.showPeakStrip !== false ? phaseMarkup() : ""}
      </div>
      <div class="expanded foot">余额每 ${snapshot.balanceConfig?.refreshMinutes || 15} 分钟更新 · 点击余额立即刷新</div>
    </aside>`;
    bindUi();
    updatePeakAlert();
  }

  function activeZCodeSessionId() {
    return document.querySelector('[data-session-id]')?.getAttribute("data-session-id") || "";
  }

  function syncActiveSession(delay = 180, explicitId = "") {
    const sessionId = explicitId || activeZCodeSessionId();
    if (!sessionId || readUi().sessionId === sessionId) return;
    saveUi({ sessionId });
    clearTimeout(activeSyncTimer);
    activeSyncTimer = setTimeout(() => void refresh(true), Math.max(0, delay));
  }

  function onDocumentClick(event) {
    const task = event.target?.closest?.('[data-testid^="task-item-sess_"]');
    const testId = task?.getAttribute("data-testid") || "";
    if (testId.startsWith("task-item-")) syncActiveSession(220, testId.slice("task-item-".length));
  }

  function alertWanted(phase, config, now) {
    if (!phase || !Number.isFinite(Number(phase.nextAtMs)) || config?.alertEnabled === false) return false;
    const target = ["peak", "offpeak", "both"].includes(config.alertTarget) ? config.alertTarget : "both";
    const entering = phase.nextIntoPeak ? "peak" : "offpeak";
    if (target !== "both" && target !== entering) return false;
    const ahead = Math.min(30, Math.max(1, Number(config.alertAheadMinutes) || 2)) * 60000;
    return now >= phase.nextAtMs - ahead && now < phase.nextAtMs;
  }

  function showPeakAlert(phase, preview = false) {
    peakAlert?.remove();
    const intoPeak = phase.nextIntoPeak === true;
    const config = snapshot?.peakPricing || {};
    peakAlert = document.createElement("div");
    peakAlert.className = `peak-alert ${config.alertPosition === "corner" ? "corner" : "center"} ${intoPeak ? "enter-peak" : "enter-offpeak"}`;
    peakAlert.setAttribute("role", "alert");
    peakAlert.innerHTML = `<div class="alert-badge">${intoPeak ? "峰价提醒" : "谷价提醒"}</div><div class="alert-title">${intoPeak ? "即将进入峰时" : "即将进入谷时"}${preview ? "（预览）" : ""}</div><div class="alert-body">约 ${countdown(phase.nextAtMs)} 后计费档位切换为${intoPeak ? "峰时价格，请注意本时段调用成本。" : "谷时价格。"}</div><div class="alert-actions"><button class="btn" data-alert-close>知道了</button></div>`;
    peakAlert.querySelector("[data-alert-close]").onclick = () => { peakAlert?.remove(); peakAlert = null; };
    portalShadow.appendChild(peakAlert);
    if (!preview && config.systemNotification && window.Notification?.permission === "granted") {
      try { new Notification(intoPeak ? "即将进入峰时" : "即将进入谷时", { body: peakAlert.querySelector(".alert-body")?.textContent || "" }); } catch {}
    }
  }

  function updatePeakAlert() {
    const phase = snapshot?.peakPhase;
    const config = snapshot?.peakPricing;
    const now = Date.now();
    if (!alertWanted(phase, config, now)) return;
    const key = String(phase.nextAtMs);
    if (localStorage.getItem("zcodeCostMeter.lastPeakAlertAt") === key) return;
    localStorage.setItem("zcodeCostMeter.lastPeakAlertAt", key);
    showPeakAlert(phase);
  }

  function bindUi() {
    const panel = shadow?.querySelector(".panel");
    if (!panel) return;
    panel.querySelector(".rail")?.addEventListener("click", () => { saveUi({ collapsed: false }); render(); });
    panel.querySelector('[data-action="collapse"]')?.addEventListener("click", () => { saveUi({ collapsed: true }); render(); });
    panel.querySelector('[data-action="settings"]')?.addEventListener("click", () => void openSettings());
    const balance = panel.querySelector('[data-action="balance"]');
    const refreshBalance = async () => {
      if (!balance || balance.dataset.busy === "1") return;
      balance.dataset.busy = "1";
      try { await request("refreshBalance"); await refresh(true); }
      catch (error) { alert(`余额刷新失败：${error.message}`); }
      finally { delete balance.dataset.busy; }
    };
    balance?.addEventListener("click", () => void refreshBalance());
    balance?.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void refreshBalance(); } });
    panel.querySelector('[data-action="session"]')?.addEventListener("change", (event) => {
      saveUi({ sessionId: event.target.value });
      void refresh(true);
    });
  }

  async function refresh(immediate = false) {
    if (disposed || refreshBusy) return;
    refreshBusy = true;
    shadow?.querySelector(".dot")?.classList.add("busy");
    try {
      snapshot = await request("snapshot", { sessionId: readUi().sessionId });
      if (snapshot.selectedSession?.id !== readUi().sessionId) saveUi({ sessionId: snapshot.selectedSession?.id || "" });
      render();
    } catch (error) {
      if (root) root.innerHTML = `<aside class="panel"><div class="error"><b>费用统计暂不可用</b><br>${esc(error.message)}</div></aside>`;
    } finally {
      refreshBusy = false;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, Math.max(2, snapshot?.refreshSeconds || 2) * 1000);
    }
  }

  function priceRow(price = {}) {
    return `<tr data-price><td><input data-k="provider" value="${attr(price.provider || "*")}" aria-label="Provider"></td><td><input data-k="model" value="${attr(price.model || "")}" aria-label="模型"></td><td><input data-k="input" type="number" min="0" step="0.001" value="${attr(price.input ?? 0)}"></td><td><input data-k="cacheRead" type="number" min="0" step="0.001" value="${attr(price.cacheRead ?? 0)}"></td><td><input data-k="output" type="number" min="0" step="0.001" value="${attr(price.output ?? 0)}"></td><td><input data-k="peakMultiplier" type="number" min="1" step="0.1" value="${attr(price.peakMultiplier ?? 1)}"></td><td><button class="icon" data-remove title="删除">×</button></td></tr>`;
  }

  async function openSettings() {
    if (settingsOverlay?.isConnected) return;
    let response;
    try { response = await request("config"); }
    catch (error) { return alert(`无法读取费用设置：${error.message}`); }
    const config = response.config;
    const balance = snapshot?.balance || {};
    const balanceLabel = balance.status === "ready"
      ? `${money(balance.total, balance.currency)} · ${balance.isAvailable ? "可用" : "不可用"}`
      : balance.status === "loading" ? "正在刷新" : balance.status === "error" ? `刷新失败：${balance.error || "未知错误"}` : "尚未查询";
    const syncedAt = config.pricingSource?.syncedAt
      ? new Date(config.pricingSource.syncedAt).toLocaleString("zh-CN", { hour12: false })
      : "使用内置官网价格";
    const session = snapshot?.session || {};
    const models = (session.models || []).slice(0, 8);
    const overlay = document.createElement("div");
    settingsOverlay = overlay;
    overlay.className = "overlay";
    overlay.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="费用统计设置">
      <div class="dialog-head"><b>费用统计设置</b><button class="icon" data-close>×</button></div>
      <div class="form">
        <div class="overview-cards">
          <div class="overview-card"><span>本会话</span><b>${money(session.cost)}</b><small>${session.calls || 0} 次调用</small></div>
          <div class="overview-card"><span>今日</span><b>${money(snapshot?.today?.cost)}</b><small>${compact(snapshot?.today?.input)} 输入</small></div>
          <div class="overview-card"><span>本月</span><b>${money(snapshot?.month?.cost)}</b><small>${snapshot?.month?.calls || 0} 次调用</small></div>
          <div class="overview-card"><span>累计</span><b>${money(snapshot?.total?.cost)}</b><small>${snapshot?.total?.calls || 0} 次调用</small></div>
        </div>

        <section class="settings-section"><h3>预算与浮窗显示</h3>
          <div class="form-grid">
            <label>计价币种<select data-field="currency"><option value="CNY" selected>CNY 人民币（官网价）</option></select></label>
            <label>预算金额<input data-field="budget" type="number" min="0" step="0.01" value="${attr(config.budget)}"></label>
            <label>预算周期<select data-field="budgetPeriod"><option value="day"${config.budgetPeriod === "day" ? " selected" : ""}>每日</option><option value="month"${config.budgetPeriod === "month" ? " selected" : ""}>每月</option><option value="total"${config.budgetPeriod === "total" ? " selected" : ""}>累计</option></select></label>
            <label>用量刷新（秒）<input data-field="refreshSeconds" type="number" min="2" max="60" value="${attr(config.refreshSeconds)}"></label>
            <label class="check"><input data-field="includeSubagents" type="checkbox"${config.includeSubagents ? " checked" : ""}>会话包含子任务</label>
            <label class="check"><input data-field="showSessionCost" type="checkbox"${config.display?.showSessionCost !== false ? " checked" : ""}>显示本会话费用</label>
            <label class="check"><input data-field="showTodayCost" type="checkbox"${config.display?.showTodayCost !== false ? " checked" : ""}>显示今日费用</label>
            <label class="check"><input data-field="showPeakStrip" type="checkbox"${config.display?.showPeakStrip !== false ? " checked" : ""}>显示峰谷条</label>
          </div>
        </section>

        <section class="settings-section"><h3>DeepSeek 官方余额</h3>
          <div class="settings-hint">从 ZCode 的 DeepSeek 官方 Provider 读取 API Key，仅由本机控制器调用官方 /user/balance 接口；密钥不会注入页面。</div>
          <div class="form-grid">
            <label class="check"><input data-field="balanceEnabled" type="checkbox"${config.balance?.enabled !== false ? " checked" : ""}>浮窗显示余额</label>
            <label>自动刷新（分钟）<input data-field="balanceRefreshMinutes" type="number" min="1" max="1440" value="${attr(config.balance?.refreshMinutes ?? 15)}"></label>
            <label class="check"><input data-field="balanceProgress" type="checkbox"${config.balance?.showProgressBar !== false ? " checked" : ""}>显示余额进度条</label>
            <div><span class="status-pill${balance.status === "error" ? " error" : ""}" data-balance-status>${esc(balanceLabel)}</span> <button class="btn" data-refresh-balance>立即刷新</button></div>
          </div>
        </section>

        <section class="settings-section"><h3>峰谷计价与提醒</h3>
          <div class="settings-hint">北京时间工作日 09:00–12:00、14:00–18:00 为峰时；其余时段及周末为谷时。浮窗颜色和实际计算共用同一判定。</div>
          <div class="form-grid">
            <label class="check"><input data-field="peakEnabled" type="checkbox"${config.peakPricing.enabled ? " checked" : ""}>启用峰时倍率</label>
            <label class="check"><input data-field="weekendOffPeak" type="checkbox"${config.peakPricing.weekendOffPeak ? " checked" : ""}>周末按谷时</label>
            <label class="check"><input data-field="alertEnabled" type="checkbox"${config.peakPricing.alertEnabled !== false ? " checked" : ""}>峰谷切换提醒</label>
            <label>提前提醒（分钟）<input data-field="alertAheadMinutes" type="number" min="1" max="30" value="${attr(config.peakPricing.alertAheadMinutes ?? 2)}"></label>
            <label>提醒类型<select data-field="alertTarget"><option value="both"${config.peakPricing.alertTarget === "both" ? " selected" : ""}>峰和谷</option><option value="peak"${config.peakPricing.alertTarget === "peak" ? " selected" : ""}>进入峰时</option><option value="offpeak"${config.peakPricing.alertTarget === "offpeak" ? " selected" : ""}>进入谷时</option></select></label>
            <label>提醒位置<select data-field="alertPosition"><option value="center"${config.peakPricing.alertPosition !== "corner" ? " selected" : ""}>屏幕中心</option><option value="corner"${config.peakPricing.alertPosition === "corner" ? " selected" : ""}>右下角</option></select></label>
            <label class="check"><input data-field="systemNotification" type="checkbox"${config.peakPricing.systemNotification ? " checked" : ""}>同步系统通知</label>
            <div><button class="btn" data-preview-peak>预览峰时</button> <button class="btn" data-preview-offpeak>预览谷时</button></div>
          </div>
        </section>

        <section class="settings-section"><h3>官方价格（每百万 token，人民币）</h3>
          <div class="source-line"><span>DeepSeek 官方价格 · ${esc(syncedAt)}</span><span><a href="${attr(config.pricingSource?.url || "https://api-docs.deepseek.com/zh-cn/quick_start/pricing")}" target="_blank" rel="noreferrer">查看官网 ↗</a> <button class="btn" data-sync-prices>从官网同步</button></span></div>
          <div class="price-wrap"><table><thead><tr><th>Provider</th><th>模型</th><th>输入/未命中</th><th>缓存命中</th><th>输出</th><th>峰时倍率</th><th></th></tr></thead><tbody>${config.prices.map(priceRow).join("")}</tbody></table></div>
          <div class="source-line"><span>当前任务模型</span><span>${models.length ? models.map((item) => `${esc(item.model)} ${money(item.cost)}`).join(" · ") : "暂无调用"}</span></div>
        </section>
      </div><div class="actions"><div><button class="btn" data-add>添加自定义价格</button>${snapshot?.unknownModels?.length ? '<button class="btn" data-add-unknown>加入未定价模型</button>' : ""}</div><div><button class="btn" data-close>取消</button> <button class="btn primary" data-save>保存</button></div></div>
    </div>`;
    portalShadow.appendChild(overlay);
    const close = () => { overlay.remove(); if (settingsOverlay === overlay) settingsOverlay = null; };
    overlay.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", close));
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    const tbody = overlay.querySelector("tbody");
    const wireRows = () => overlay.querySelectorAll("[data-remove]").forEach((button) => button.onclick = () => button.closest("tr").remove());
    wireRows();
    overlay.querySelector("[data-add]").onclick = () => { tbody.insertAdjacentHTML("beforeend", priceRow()); wireRows(); };
    overlay.querySelector("[data-preview-peak]").onclick = () => showPeakAlert({ nextAtMs: Date.now() + 120000, nextIntoPeak: true }, true);
    overlay.querySelector("[data-preview-offpeak]").onclick = () => showPeakAlert({ nextAtMs: Date.now() + 120000, nextIntoPeak: false }, true);
    overlay.querySelector("[data-refresh-balance]").onclick = async (event) => {
      const button = event.currentTarget;
      const status = overlay.querySelector("[data-balance-status]");
      button.disabled = true;
      button.textContent = "刷新中…";
      try {
        const result = await request("refreshBalance");
        const item = result.balance || {};
        status.classList.toggle("error", item.status === "error");
        status.textContent = item.status === "ready" ? `${money(item.total, item.currency)} · ${item.isAvailable ? "可用" : "不可用"}` : `刷新失败：${item.error || "未知错误"}`;
        await refresh(true);
      } catch (error) {
        status.classList.add("error");
        status.textContent = `刷新失败：${error.message}`;
      } finally { button.disabled = false; button.textContent = "立即刷新"; }
    };
    overlay.querySelector("[data-sync-prices]").onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "同步中…";
      try {
        await request("syncOfficialPrices");
        close();
        await refresh(true);
        await openSettings();
      } catch (error) { button.disabled = false; button.textContent = "从官网同步"; alert(`价格同步失败：${error.message}`); }
    };
    overlay.querySelector("[data-add-unknown]")?.addEventListener("click", () => {
      const known = new Set([...tbody.querySelectorAll('[data-k="provider"]')].map((el) => `${el.value}/${el.closest("tr").querySelector('[data-k="model"]').value}`));
      for (const item of snapshot.unknownModels || []) {
        if (known.has(item)) continue;
        const slash = item.indexOf("/");
        tbody.insertAdjacentHTML("beforeend", priceRow({ provider: item.slice(0, slash), model: item.slice(slash + 1) }));
      }
      wireRows();
    });
    overlay.querySelector("[data-save]").onclick = async () => {
      const read = (name) => overlay.querySelector(`[data-field="${name}"]`);
      const prices = [...tbody.querySelectorAll("[data-price]")].map((row) => {
        const value = (key) => row.querySelector(`[data-k="${key}"]`).value;
        return { provider: value("provider"), model: value("model"), input: Number(value("input")), cacheRead: Number(value("cacheRead")), cacheWrite: Number(value("input")), output: Number(value("output")), peakMultiplier: Number(value("peakMultiplier")) };
      }).filter((p) => p.model.trim());
      const next = {
        currency: read("currency").value,
        budget: Number(read("budget").value),
        budgetPeriod: read("budgetPeriod").value,
        refreshSeconds: Number(read("refreshSeconds").value),
        includeSubagents: read("includeSubagents").checked,
        display: {
          ...config.display,
          showSessionCost: read("showSessionCost").checked,
          showTodayCost: read("showTodayCost").checked,
          showBalance: read("balanceEnabled").checked,
          showPeakStrip: read("showPeakStrip").checked
        },
        balance: {
          ...config.balance,
          enabled: read("balanceEnabled").checked,
          refreshMinutes: Number(read("balanceRefreshMinutes").value),
          showProgressBar: read("balanceProgress").checked
        },
        peakPricing: {
          ...config.peakPricing,
          enabled: read("peakEnabled").checked,
          weekendOffPeak: read("weekendOffPeak").checked,
          alertEnabled: read("alertEnabled").checked,
          alertAheadMinutes: Number(read("alertAheadMinutes").value),
          alertTarget: read("alertTarget").value,
          alertPosition: read("alertPosition").value,
          systemNotification: read("systemNotification").checked
        },
        prices
      };
      const button = overlay.querySelector("[data-save]");
      button.disabled = true;
      button.textContent = "保存中…";
      try {
        if (next.peakPricing.systemNotification && window.Notification?.permission === "default") void Notification.requestPermission();
        await request("saveConfig", { config: next }); close(); await refresh(true);
      }
      catch (error) { button.disabled = false; button.textContent = "保存"; alert(`保存失败：${error.message}`); }
    };
    overlay.querySelector("input,select,button")?.focus();
  }

  const observer = new MutationObserver(() => {
    if (!disposed && !document.getElementById(HOST_ID)) mount();
    if (!disposed) syncActiveSession();
  });
  const start = () => {
    mount();
    document.addEventListener("click", onDocumentClick, true);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-session-id"] });
  };
  globalThis[RUNTIME] = {
    version: VERSION,
    get disposed() { return disposed; },
    dispose() {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("click", onDocumentClick, true);
      clearTimeout(refreshTimer);
      clearTimeout(activeSyncTimer);
      for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("脚本已卸载")); }
      pending.clear();
      settingsOverlay?.remove();
      peakAlert?.remove();
      portalHost?.remove();
      host?.remove();
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
