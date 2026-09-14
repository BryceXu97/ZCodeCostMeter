#!/usr/bin/env node
// Starts the upstream ZCode+ controller, then attaches the cost sidebar to the
// same Electron CDP instance through a short-lived loopback bridge.
import { spawn } from "node:child_process";
import { createServer, connect } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const LOG = path.join(ROOT, "orchestrator.log");
const SOURCE_PORTS = Array.from({ length: 18 }, (_, i) => 9333 + i);
const BRIDGE_PORTS = Array.from({ length: 15 }, (_, i) => 9361 + i);

const log = (...parts) => {
  try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${parts.join(" ")}\n`); } catch {}
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function versionAt(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1200) });
    const data = response.ok ? await response.json() : null;
    return data?.webSocketDebuggerUrl ? data : null;
  } catch { return null; }
}

async function waitForZCodeCdp(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const port of SOURCE_PORTS) {
      const version = await versionAt(port);
      if (!version) continue;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1200) });
        const targets = response.ok ? await response.json() : [];
        if (targets.some((item) => /zcode/i.test(`${item.title} ${item.url}`))) return port;
      } catch {}
    }
    await delay(700);
  }
  return null;
}

function startBridge(listenPort, targetPort) {
  const server = createServer((client) => {
    const upstream = connect(targetPort, "127.0.0.1");
    client.pipe(upstream);
    upstream.pipe(client);
    const close = () => { client.destroy(); upstream.destroy(); };
    client.on("error", close);
    upstream.on("error", close);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  log("启动 ZCode+ 提示词增强控制器");
  const enhance = spawn(NODE, [path.join(ROOT, "enhance", "controller.mjs")], {
    cwd: path.join(ROOT, "enhance"), detached: true, stdio: "ignore", windowsHide: true
  });
  enhance.unref();

  const sourcePort = await waitForZCodeCdp();
  if (!sourcePort) throw new Error("等待 ZCode+ CDP 就绪超时");
  log(`ZCode+ CDP 已就绪 port=${sourcePort}`);

  let bridge = null;
  let bridgePort = null;
  for (const port of BRIDGE_PORTS) {
    if (port === sourcePort) continue;
    try { bridge = await startBridge(port, sourcePort); bridgePort = port; break; }
    catch {}
  }
  if (!bridge) throw new Error("没有可用的费用侧栏桥接端口");
  log(`临时桥接 ${bridgePort}->${sourcePort}`);

  const meter = spawn(NODE, [path.join(ROOT, "controller.mjs")], {
    cwd: ROOT, detached: true, stdio: "ignore", windowsHide: true
  });
  meter.unref();
  await delay(12000);
  bridge.close();
  log("费用侧栏已附着，临时桥接已关闭");
}

main().catch((error) => { log("启动失败:", error?.stack || error); process.exitCode = 1; });
