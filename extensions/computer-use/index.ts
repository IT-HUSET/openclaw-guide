/**
 * Computer Use — OpenClaw plugin
 *
 * Registers 7 `vm_*` tools for controlling a macOS Lume VM via
 * cua-computer-server WebSocket protocol. Lazy WebSocket connection
 * with mutex-serialized command execution.
 *
 * Requires: Lume VM running cua-computer-server (ws dependency only).
 */

import WebSocket from "ws";

// --- Config ---

export interface PluginConfig {
  vmName?: string;
  lumeApiUrl?: string;
  serverPort?: number;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
  screenshotScale?: number;
  logVerbose?: boolean;
  maxScreenshotBytes?: number;
}

const DEFAULTS = {
  vmName: "openclaw-vm",
  lumeApiUrl: "http://localhost:7777",
  serverPort: 5000,
  connectTimeoutMs: 30_000,
  commandTimeoutMs: 60_000,
  screenshotScale: 0.5,
  logVerbose: false,
  maxScreenshotBytes: 10 * 1024 * 1024, // 10 MB
} as const;

function resolved(cfg: PluginConfig): Required<PluginConfig> {
  return { ...DEFAULTS, ...cfg } as Required<PluginConfig>;
}

const MAX_OUTPUT_BYTES = 50 * 1024; // 50 KB truncation limit for vm_exec

// --- Lazy WebSocket connection ---

let wsPromise: Promise<WebSocket> | null = null;

async function getConnection(cfg: Required<PluginConfig>): Promise<WebSocket> {
  if (wsPromise) return wsPromise;

  wsPromise = (async () => {
    // Fetch VM IP from Lume HTTP API
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.connectTimeoutMs);
    let vmInfo: any;
    try {
      const res = await fetch(
        `${cfg.lumeApiUrl}/lume/vms/${encodeURIComponent(cfg.vmName)}`,
        { signal: ctrl.signal },
      );
      if (!res.ok) throw new Error(`Lume API ${res.status}: ${res.statusText}`);
      vmInfo = await res.json();
    } catch (err: any) {
      if (err.name === "AbortError") throw new Error(`Lume API timeout after ${cfg.connectTimeoutMs}ms`);
      throw new Error(`Lume API error: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }

    if (vmInfo.status !== "running") {
      throw new Error(
        `VM "${cfg.vmName}" is ${vmInfo.status ?? "unknown"}. ` +
        `Start it with: lume start ${cfg.vmName}`,
      );
    }

    const ip = vmInfo.ip;
    if (!ip) throw new Error(`VM "${cfg.vmName}" has no IP address`);

    // Connect WebSocket with timeout
    return new Promise<WebSocket>((resolve, reject) => {
      const wsTimer = setTimeout(() => {
        ws.terminate();
        reject(new Error(`WebSocket connect timeout after ${cfg.connectTimeoutMs}ms`));
      }, cfg.connectTimeoutMs);

      const ws = new WebSocket(`ws://${ip}:${cfg.serverPort}`);

      ws.on("open", () => {
        clearTimeout(wsTimer);
        if (cfg.logVerbose) console.log(`[computer-use] WebSocket connected to ${ip}:${cfg.serverPort}`);

        // Replace connection-phase handlers with post-connect handlers
        ws.removeAllListeners("error");
        ws.on("error", (err) => {
          console.error(`[computer-use] WebSocket error: ${err.message}`);
          wsPromise = null;
        });

        resolve(ws);
      });

      ws.on("error", (err) => {
        clearTimeout(wsTimer);
        wsPromise = null;
        reject(new Error(`WebSocket error: ${err.message}`));
      });

      ws.on("close", () => {
        wsPromise = null;
      });
    });
  })().catch((err) => {
    wsPromise = null;
    throw err;
  });

  return wsPromise;
}

/** Reset cached connection (for test cleanup). */
export function _resetConnection(): void {
  wsPromise = null;
}

// --- Command execution with mutex ---

let commandQueue: Promise<any> = Promise.resolve();

interface WSResponse {
  success: boolean;
  data?: any;
  error?: string;
}

async function sendCommand(
  command: string,
  params: any,
  cfg: Required<PluginConfig>,
): Promise<WSResponse> {
  // Serialize via promise queue
  const result = commandQueue.then(async (): Promise<WSResponse> => {
    const ws = await getConnection(cfg);

    return new Promise<WSResponse>((resolve) => {
      const timer = setTimeout(() => {
        wsPromise = null;
        resolve({ success: false, error: `Command timed out after ${cfg.commandTimeoutMs}ms` });
      }, cfg.commandTimeoutMs);

      const handler = (raw: WebSocket.RawData) => {
        clearTimeout(timer);
        ws.off("message", handler);
        try {
          resolve(JSON.parse(raw.toString()));
        } catch {
          resolve({ success: false, error: "Invalid JSON response from VM" });
        }
      };

      ws.on("message", handler);
      ws.send(JSON.stringify({ command, params }));
    });
  });

  // Update queue head (don't let rejections break the chain)
  commandQueue = result.catch(() => {});
  return result;
}

/** Reset command queue (for test cleanup). */
export function _resetCommandQueue(): void {
  commandQueue = Promise.resolve();
}

// --- Helpers ---

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function hasBinaryContent(s: string): boolean {
  return s.includes("\0");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Tool wrapper with logging + error handling ---

async function runTool(
  name: string,
  cfg: Required<PluginConfig>,
  fn: () => Promise<any>,
): Promise<any> {
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    console.log(`[computer-use] ${name} (${ms}ms) — success`);
    return result;
  } catch (err: any) {
    const ms = Date.now() - start;
    console.error(`[computer-use] ${name} (${ms}ms) — error: ${err.message}`);
    if (err.message.includes("timeout")) {
      return errorResult(`VM command timed out after ${cfg.commandTimeoutMs}ms. Check VM responsiveness.`);
    }
    return errorResult(`VM connection failed: ${err.message}`);
  }
}

// --- Plugin export ---

export default {
  id: "computer-use",
  name: "Computer Use (Lume VM)",

  register(api: any) {
    const raw: PluginConfig =
      api.config?.plugins?.entries?.["computer-use"]?.config ?? {};
    const cfg = resolved(raw);

    console.log(
      `[computer-use] Registered — VM: ${cfg.vmName}, Lume: ${cfg.lumeApiUrl}`,
    );

    // Tool 1: vm_screenshot
    api.registerTool({
      name: "vm_screenshot",
      description:
        "Capture screenshot of VM screen as image. Returns PNG image. " +
        "Full-resolution Retina screenshots may exceed 10 MB.",
      parameters: { type: "object", properties: {} },

      async execute() {
        return runTool("vm_screenshot", cfg, async () => {
          const resp = await sendCommand("screenshot", {}, cfg);
          if (!resp.success) return errorResult(`Screenshot failed: ${resp.error ?? "unknown"}`);

          const b64 = typeof resp.data === "string"
            ? resp.data
            : Buffer.from(resp.data).toString("base64");

          const sizeBytes = Math.ceil(b64.length * 3 / 4);
          if (sizeBytes > cfg.maxScreenshotBytes) {
            return errorResult(
              `Screenshot too large (${formatBytes(sizeBytes)}). ` +
              `Max: ${formatBytes(cfg.maxScreenshotBytes)}. ` +
              `Reduce screen resolution or use vm_exec to capture a smaller region.`,
            );
          }

          return { content: [{ type: "image", data: b64, mimeType: "image/png" }] };
        });
      },
    });

    // Tool 2: vm_exec
    api.registerTool({
      name: "vm_exec",
      description:
        "Run shell command inside VM. Returns stdout and stderr. " +
        "Use for file ops, system commands, etc. " +
        "Security: Intentional shell access inside VM — do NOT pass unsanitized user input.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute in the VM." },
        },
        required: ["command"],
      },

      async execute(_toolId: string, params: { command: string }) {
        return runTool("vm_exec", cfg, async () => {
          const resp = await sendCommand("run_command", { command: params.command }, cfg);
          const [stdout = "", stderr = ""] = Array.isArray(resp.data) ? resp.data : ["", ""];

          if (!resp.success) {
            return errorResult(
              `Command failed: ${resp.error ?? "unknown error"}\nstderr: ${stderr}\nstdout: ${stdout}`,
            );
          }

          if (hasBinaryContent(stdout) || hasBinaryContent(stderr)) {
            return errorResult(
              "Command output contains binary data. Use vm_screenshot to view " +
              "graphical output, or redirect to file and read via shared directory.",
            );
          }

          // Truncate if combined output exceeds byte limit
          let out = `${stdout}\n---stderr---\n${stderr}`;
          if (Buffer.byteLength(out) > MAX_OUTPUT_BYTES) {
            out = Buffer.from(out).subarray(0, MAX_OUTPUT_BYTES).toString() +
              "\n[truncated — output exceeded 50 KB]";
          }

          return textResult(out);
        });
      },
    });

    // Tool 3: vm_click
    api.registerTool({
      name: "vm_click",
      description: "Click at screen coordinates.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "number", description: "X coordinate." },
          y: { type: "number", description: "Y coordinate." },
          button: {
            type: "string",
            enum: ["left", "right", "double"],
            description: 'Click type. Default: "left".',
          },
        },
        required: ["x", "y"],
      },

      async execute(_toolId: string, params: { x: number; y: number; button?: string }) {
        return runTool("vm_click", cfg, async () => {
          const button = params.button ?? "left";
          const cmdMap: Record<string, string> = {
            left: "left_click", right: "right_click", double: "double_click",
          };
          const resp = await sendCommand(cmdMap[button] ?? "left_click", { x: params.x, y: params.y }, cfg);
          if (!resp.success) return errorResult(`Click failed: ${resp.error ?? "unknown"}`);
          return textResult(`Clicked ${button} at (${params.x}, ${params.y})`);
        });
      },
    });

    // Tool 4: vm_type
    api.registerTool({
      name: "vm_type",
      description: "Type text into focused application.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to type." },
        },
        required: ["text"],
      },

      async execute(_toolId: string, params: { text: string }) {
        return runTool("vm_type", cfg, async () => {
          const resp = await sendCommand("type_text", { text: params.text }, cfg);
          if (!resp.success) return errorResult(`Type failed: ${resp.error ?? "unknown"}`);
          return textResult(`Typed ${params.text.length} characters`);
        });
      },
    });

    // Tool 5: vm_key
    api.registerTool({
      name: "vm_key",
      description:
        "Press key or key combination (e.g., 'escape', 'command+s', 'shift+command+n').",
      parameters: {
        type: "object",
        properties: {
          keys: { type: "string", description: "Key or combination (use + for combos)." },
        },
        required: ["keys"],
      },

      async execute(_toolId: string, params: { keys: string }) {
        return runTool("vm_key", cfg, async () => {
          const isCombo = params.keys.includes("+");
          const resp = isCombo
            ? await sendCommand("hotkey", { keys: params.keys.split("+") }, cfg)
            : await sendCommand("press_key", { key: params.keys }, cfg);
          if (!resp.success) return errorResult(`Key press failed: ${resp.error ?? "unknown"}`);
          return textResult(`Pressed ${params.keys}`);
        });
      },
    });

    // Tool 6: vm_launch
    api.registerTool({
      name: "vm_launch",
      description: "Launch macOS application (e.g., 'TextEdit', 'Xcode', 'Safari').",
      parameters: {
        type: "object",
        properties: {
          app: { type: "string", description: "Application name." },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Optional launch arguments.",
          },
        },
        required: ["app"],
      },

      async execute(_toolId: string, params: { app: string; args?: string[] }) {
        return runTool("vm_launch", cfg, async () => {
          const resp = await sendCommand("launch", { app: params.app, args: params.args }, cfg);
          if (!resp.success) return errorResult(`Launch failed: ${resp.error ?? "unknown"}`);
          return textResult(`Launched ${params.app}`);
        });
      },
    });

    // Tool 7: vm_scroll
    api.registerTool({
      name: "vm_scroll",
      description: "Scroll screen up or down.",
      parameters: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["up", "down"],
            description: "Scroll direction.",
          },
          clicks: {
            type: "number",
            description: "Number of scroll clicks. Default: 5.",
          },
        },
        required: ["direction"],
      },

      async execute(_toolId: string, params: { direction: string; clicks?: number }) {
        return runTool("vm_scroll", cfg, async () => {
          const clicks = params.clicks ?? 5;
          const cmd = params.direction === "up" ? "scroll_up" : "scroll_down";
          const resp = await sendCommand(cmd, { clicks }, cfg);
          if (!resp.success) return errorResult(`Scroll failed: ${resp.error ?? "unknown"}`);
          return textResult(`Scrolled ${params.direction} ${clicks} clicks`);
        });
      },
    });
  },
};
