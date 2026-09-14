export const MILLION = 1_000_000;
export const WEEKEND_OFFPEAK_EFFECTIVE_MS = Date.parse("2026-08-22T16:00:00Z");
export const OFFICIAL_PRICING_URL = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing";
export const OFFICIAL_PRICE_VERSION = "2026-09-14-cny-v4.1";

export const DEFAULT_PRICES = [
  {
    provider: "*",
    model: "deepseek-flash",
    label: "DeepSeek V4.1 Flash（官网人民币价）",
    input: 1,
    cacheRead: 0.02,
    cacheWrite: 1,
    output: 4,
    peakMultiplier: 2,
    sourceUrl: OFFICIAL_PRICING_URL
  },
  {
    provider: "*",
    model: "deepseek-v4-flash",
    label: "DeepSeek V4.1 Flash 兼容名（官网人民币价）",
    input: 1,
    cacheRead: 0.02,
    cacheWrite: 1,
    output: 4,
    peakMultiplier: 2,
    sourceUrl: OFFICIAL_PRICING_URL
  },
  {
    provider: "*",
    model: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro（官网人民币价）",
    input: 4.5,
    cacheRead: 0.15,
    cacheWrite: 4.5,
    output: 13.5,
    peakMultiplier: 2,
    sourceUrl: OFFICIAL_PRICING_URL
  }
];

export function defaultConfig() {
  return {
    currency: "CNY",
    refreshSeconds: 2,
    budget: 0,
    includeSubagents: true,
    budgetPeriod: "month",
    display: {
      showSessionCost: true,
      showTodayCost: true,
      showBalance: true,
      showPeakStrip: true,
      compactSidebar: false
    },
    balance: {
      enabled: true,
      refreshMinutes: 15,
      showProgressBar: true
    },
    pricingSource: {
      kind: "official",
      currency: "CNY",
      url: OFFICIAL_PRICING_URL,
      version: OFFICIAL_PRICE_VERSION,
      syncedAt: null
    },
    peakPricing: {
      enabled: true,
      timezone: "Asia/Shanghai",
      windows: [[9, 12], [14, 18]],
      weekendOffPeak: true,
      alertEnabled: true,
      alertAheadMinutes: 2,
      alertTarget: "both",
      alertPosition: "center",
      systemNotification: false
    },
    prices: DEFAULT_PRICES.map((item) => ({ ...item }))
  };
}

function nonNegative(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function sanitizeConfig(raw = {}) {
  const base = defaultConfig();
  const prices = Array.isArray(raw.prices) ? raw.prices : base.prices;
  return {
    currency: raw.currency === "USD" ? "USD" : "CNY",
    refreshSeconds: Math.min(60, Math.max(2, Math.round(nonNegative(raw.refreshSeconds, 2)))),
    budget: nonNegative(raw.budget),
    includeSubagents: raw.includeSubagents !== false,
    budgetPeriod: ["day", "month", "total"].includes(raw.budgetPeriod) ? raw.budgetPeriod : "month",
    display: {
      ...base.display,
      ...(raw.display && typeof raw.display === "object" ? raw.display : {}),
      showSessionCost: raw.display?.showSessionCost !== false,
      showTodayCost: raw.display?.showTodayCost !== false,
      showBalance: raw.display?.showBalance !== false,
      showPeakStrip: raw.display?.showPeakStrip !== false,
      compactSidebar: raw.display?.compactSidebar === true
    },
    balance: {
      ...base.balance,
      ...(raw.balance && typeof raw.balance === "object" ? raw.balance : {}),
      enabled: raw.balance?.enabled !== false,
      refreshMinutes: Math.min(1440, Math.max(1, Math.round(nonNegative(raw.balance?.refreshMinutes, 15)))),
      showProgressBar: raw.balance?.showProgressBar !== false
    },
    pricingSource: {
      ...base.pricingSource,
      ...(raw.pricingSource && typeof raw.pricingSource === "object" ? raw.pricingSource : {}),
      kind: raw.pricingSource?.kind === "custom" ? "custom" : "official",
      currency: "CNY",
      url: OFFICIAL_PRICING_URL,
      version: String(raw.pricingSource?.version || ""),
      syncedAt: Number.isFinite(Number(raw.pricingSource?.syncedAt)) ? Number(raw.pricingSource.syncedAt) : null
    },
    peakPricing: {
      ...base.peakPricing,
      ...(raw.peakPricing && typeof raw.peakPricing === "object" ? raw.peakPricing : {}),
      enabled: raw.peakPricing?.enabled !== false,
      weekendOffPeak: raw.peakPricing?.weekendOffPeak !== false,
      alertEnabled: raw.peakPricing?.alertEnabled !== false,
      alertAheadMinutes: Math.min(30, Math.max(1, Math.round(nonNegative(raw.peakPricing?.alertAheadMinutes, 2)))),
      alertTarget: ["peak", "offpeak", "both"].includes(raw.peakPricing?.alertTarget) ? raw.peakPricing.alertTarget : "both",
      alertPosition: raw.peakPricing?.alertPosition === "corner" ? "corner" : "center",
      systemNotification: raw.peakPricing?.systemNotification === true
    },
    prices: prices
      .filter((p) => p && String(p.model || "").trim())
      .slice(0, 300)
      .map((p) => ({
        provider: String(p.provider || "*").trim() || "*",
        model: String(p.model).trim(),
        label: String(p.label || p.model).trim().slice(0, 120),
        input: nonNegative(p.input),
        cacheRead: nonNegative(p.cacheRead),
        cacheWrite: nonNegative(p.cacheWrite, nonNegative(p.input)),
        output: nonNegative(p.output),
        peakMultiplier: Math.max(1, nonNegative(p.peakMultiplier, 1)),
        sourceUrl: String(p.sourceUrl || "").slice(0, 500)
      }))
  };
}

export function findPrice(config, provider, model) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const p = norm(provider);
  const m = norm(model);
  return config.prices.find((x) => norm(x.provider) === p && norm(x.model) === m)
    || config.prices.find((x) => x.provider === "*" && norm(x.model) === m)
    || null;
}

export function isPeakAt(epochMs, peakPricing) {
  if (!peakPricing?.enabled) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: peakPricing.timezone || "Asia/Shanghai",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(new Date(Number(epochMs) || 0));
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  if (peakPricing.weekendOffPeak && Number(epochMs) >= WEEKEND_OFFPEAK_EFFECTIVE_MS && (weekday === "Sat" || weekday === "Sun")) return false;
  return (peakPricing.windows || []).some(([start, end]) => hour >= start && hour < end);
}

/**
 * Return the current pricing tier and the next real tier transition. The scan
 * uses the same isPeakAt predicate as billing, so display, alerts and charging
 * cannot drift apart. Fifteen-minute probes are refined to the exact boundary.
 */
export function peakPhaseAt(epochMs, peakPricing) {
  const now = Number(epochMs);
  if (!Number.isFinite(now) || !peakPricing?.enabled || !Array.isArray(peakPricing.windows) || !peakPricing.windows.length) return null;
  const inPeak = isPeakAt(now, peakPricing);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: peakPricing.timezone || "Asia/Shanghai",
    weekday: "short"
  }).formatToParts(new Date(now));
  const weekday = parts.find((part) => part.type === "weekday")?.value || "";
  const weekend = peakPricing.weekendOffPeak && now >= WEEKEND_OFFPEAK_EFFECTIVE_MS && (weekday === "Sat" || weekday === "Sun");
  const step = 15 * 60 * 1000;
  const limit = now + 8 * 24 * 60 * 60 * 1000;
  let left = now;
  for (let probe = now + step; probe <= limit; probe += step) {
    if (isPeakAt(probe, peakPricing) === inPeak) {
      left = probe;
      continue;
    }
    let low = left;
    let high = probe;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (isPeakAt(middle, peakPricing) === inPeak) low = middle;
      else high = middle;
    }
    return { inPeak, weekend: Boolean(weekend), nextAtMs: high, nextIntoPeak: !inPeak };
  }
  return { inPeak, weekend: Boolean(weekend), nextAtMs: null, nextIntoPeak: !inPeak };
}

export function shouldShowPeakAlert(phase, epochMs, alertConfig = {}, lastAlertAtMs = 0) {
  if (!phase || !Number.isFinite(phase.nextAtMs) || alertConfig.enabled === false) return false;
  if (Number(lastAlertAtMs) === phase.nextAtMs) return false;
  const target = ["peak", "offpeak", "both"].includes(alertConfig.target) ? alertConfig.target : "both";
  const entering = phase.nextIntoPeak ? "peak" : "offpeak";
  if (target !== "both" && target !== entering) return false;
  const aheadMinutes = Math.min(30, Math.max(1, Number(alertConfig.aheadMinutes) || 2));
  const now = Number(epochMs);
  return Number.isFinite(now) && now >= phase.nextAtMs - aheadMinutes * 60 * 1000 && now < phase.nextAtMs;
}

export function priceUsage(row, config) {
  const price = findPrice(config, row.provider_id, row.model_id);
  const input = nonNegative(row.input_tokens);
  const cacheRead = Math.min(input, nonNegative(row.cache_read_input_tokens));
  const cacheWrite = Math.min(input - cacheRead, nonNegative(row.cache_creation_input_tokens));
  const inputMiss = Math.max(0, input - cacheRead - cacheWrite);
  const output = nonNegative(row.output_tokens);
  if (!price) {
    return { cost: 0, priced: false, input, inputMiss, cacheRead, cacheWrite, output, multiplier: 1 };
  }
  const multiplier = isPeakAt(row.started_at, config.peakPricing) ? price.peakMultiplier : 1;
  const cost = multiplier * (
    inputMiss * price.input
    + cacheRead * price.cacheRead
    + cacheWrite * price.cacheWrite
    + output * price.output
  ) / MILLION;
  return { cost, priced: true, input, inputMiss, cacheRead, cacheWrite, output, multiplier };
}

export function summarizeRows(rows, config) {
  const result = {
    cost: 0,
    calls: 0,
    input: 0,
    inputMiss: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    pricedCalls: 0,
    unpricedCalls: 0,
    unknownModels: [],
    models: []
  };
  const models = new Map();
  const unknown = new Set();
  for (const row of rows || []) {
    const priced = priceUsage(row, config);
    const calls = Math.max(1, Number(row.calls) || 1);
    result.cost += priced.cost;
    result.calls += calls;
    result.input += priced.input;
    result.inputMiss += priced.inputMiss;
    result.cacheRead += priced.cacheRead;
    result.cacheWrite += priced.cacheWrite;
    result.output += priced.output;
    if (priced.priced) result.pricedCalls += calls;
    else {
      result.unpricedCalls += calls;
      unknown.add(`${row.provider_id}/${row.model_id}`);
    }
    const key = `${row.provider_id}\u0000${row.model_id}`;
    const current = models.get(key) || {
      provider: row.provider_id,
      model: row.model_id,
      cost: 0,
      calls: 0,
      input: 0,
      cacheRead: 0,
      output: 0,
      priced: priced.priced
    };
    current.cost += priced.cost;
    current.calls += calls;
    current.input += priced.input;
    current.cacheRead += priced.cacheRead;
    current.output += priced.output;
    current.priced ||= priced.priced;
    models.set(key, current);
  }
  result.models = [...models.values()].sort((a, b) => b.cost - a.cost || b.input + b.output - a.input - a.output);
  result.unknownModels = [...unknown].sort();
  result.cacheHitRate = result.input ? result.cacheRead / result.input : 0;
  return result;
}
