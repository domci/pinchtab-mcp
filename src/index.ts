#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PINCHTAB_URL = process.env.PINCHTAB_URL || "http://localhost:9867";
const PINCHTAB_TOKEN = process.env.PINCHTAB_TOKEN || "";
const PINCHTAB_TIMEOUT = parseInt(process.env.PINCHTAB_TIMEOUT || "30000", 10);

async function pinchtabFetch(
  path: string,
  opts: { method?: string; body?: unknown; rawResponse?: boolean } = {}
): Promise<any> {
  const url = `${PINCHTAB_URL}${path}`;
  const headers: Record<string, string> = {};
  if (PINCHTAB_TOKEN) headers["Authorization"] = `Bearer ${PINCHTAB_TOKEN}`;
  if (opts.body) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PINCHTAB_TIMEOUT);

  try {
    const res = await fetch(url, {
      method: opts.method || (opts.body ? "POST" : "GET"),
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    if (opts.rawResponse) return res;
    const text = await res.text();
    if (!res.ok) return { error: `${res.status} ${res.statusText}`, body: text };
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { error: `Request timed out after ${PINCHTAB_TIMEOUT}ms: ${path}` };
    }
    return {
      error: `Connection failed: ${err?.message}. Is PinchTab running at ${PINCHTAB_URL}?`,
    };
  } finally {
    clearTimeout(timer);
  }
}

function textContent(data: unknown) {
  const text =
    typeof data === "string"
      ? data
      : (data as any)?.text ?? JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

const server = new McpServer({
  name: "pinchtab",
  version: "1.0.0",
});

server.tool(
  "pinchtab",
  `Browser control via PinchTab. Actions:
- navigate: go to URL (url, tabId?, newTab?, blockImages?, timeout?)
- snapshot: accessibility tree (filter?, format?, selector?, maxTokens?, depth?, diff?, tabId?)
- click/type/press/fill/hover/scroll/select/focus: act on element (ref, text?, key?, value?, scrollY?, waitNav?, tabId?)
- text: extract readable text (mode?, tabId?)
- tabs: list/new/close tabs (tabAction?, url?, tabId?)
- screenshot: JPEG screenshot (quality?, tabId?)
- evaluate: run JS (expression, tabId?)
- pdf: export page as PDF (landscape?, scale?, tabId?)
- health: check connectivity

Token strategy: use "text" for reading (~800 tokens), "snapshot" with filter=interactive&format=compact for interactions (~3,600 tokens), diff=true on subsequent snapshots.`,
  {
    action: z
      .enum([
        "navigate",
        "snapshot",
        "click",
        "type",
        "press",
        "fill",
        "hover",
        "scroll",
        "select",
        "focus",
        "text",
        "tabs",
        "screenshot",
        "evaluate",
        "pdf",
        "health",
      ])
      .describe("Action to perform"),
    url: z.string().optional().describe("URL for navigate or new tab"),
    ref: z.string().optional().describe("Element ref from snapshot (e.g. e5)"),
    text: z.string().optional().describe("Text to type or fill"),
    key: z.string().optional().describe("Key to press (e.g. Enter, Tab, Escape)"),
    expression: z.string().optional().describe("JavaScript expression to evaluate"),
    selector: z
      .string()
      .optional()
      .describe("CSS selector for snapshot scope or action target"),
    filter: z
      .enum(["interactive", "all"])
      .optional()
      .describe("Snapshot filter: interactive = buttons/links/inputs only"),
    format: z
      .enum(["json", "compact", "text", "yaml"])
      .optional()
      .describe("Snapshot format: compact is most token-efficient"),
    maxTokens: z.number().optional().describe("Truncate snapshot to ~N tokens"),
    depth: z.number().optional().describe("Max snapshot tree depth"),
    diff: z
      .boolean()
      .optional()
      .describe("Snapshot diff: only changes since last snapshot"),
    value: z.string().optional().describe("Value for select dropdown"),
    scrollY: z.number().optional().describe("Pixels to scroll vertically"),
    waitNav: z.boolean().optional().describe("Wait for navigation after action"),
    tabId: z.string().optional().describe("Target tab ID"),
    tabAction: z
      .enum(["list", "new", "close"])
      .optional()
      .describe("Tab sub-action (default: list)"),
    newTab: z.boolean().optional().describe("Open URL in new tab"),
    blockImages: z.boolean().optional().describe("Block image loading"),
    timeout: z.number().optional().describe("Navigation timeout in seconds"),
    quality: z.number().optional().describe("JPEG quality 1-100 (default: 80)"),
    mode: z
      .enum(["readability", "raw"])
      .optional()
      .describe("Text extraction mode"),
    landscape: z.boolean().optional().describe("PDF landscape orientation"),
    scale: z.number().optional().describe("PDF print scale (default: 1.0)"),
  },
  async (params) => {
    const { action } = params;

    // navigate
    if (action === "navigate") {
      const body: any = { url: params.url };
      if (params.tabId) body.tabId = params.tabId;
      if (params.newTab) body.newTab = true;
      if (params.blockImages) body.blockImages = true;
      if (params.timeout) body.timeout = params.timeout;
      return textContent(await pinchtabFetch("/navigate", { body }));
    }

    // snapshot
    if (action === "snapshot") {
      const query = new URLSearchParams();
      if (params.tabId) query.set("tabId", params.tabId);
      if (params.filter) query.set("filter", params.filter);
      if (params.format) query.set("format", params.format);
      if (params.selector) query.set("selector", params.selector);
      if (params.maxTokens) query.set("maxTokens", String(params.maxTokens));
      if (params.depth) query.set("depth", String(params.depth));
      if (params.diff) query.set("diff", "true");
      const qs = query.toString();
      return textContent(
        await pinchtabFetch(`/snapshot${qs ? `?${qs}` : ""}`)
      );
    }

    // element actions
    const elementActions = [
      "click",
      "type",
      "press",
      "fill",
      "hover",
      "scroll",
      "select",
      "focus",
    ];
    if (elementActions.includes(action)) {
      const body: any = { kind: action };
      for (const k of [
        "ref",
        "text",
        "key",
        "selector",
        "value",
        "scrollY",
        "tabId",
        "waitNav",
      ]) {
        if ((params as any)[k] !== undefined) body[k] = (params as any)[k];
      }
      return textContent(await pinchtabFetch("/action", { body }));
    }

    // text
    if (action === "text") {
      const query = new URLSearchParams();
      if (params.tabId) query.set("tabId", params.tabId);
      if (params.mode) query.set("mode", params.mode);
      const qs = query.toString();
      return textContent(
        await pinchtabFetch(`/text${qs ? `?${qs}` : ""}`)
      );
    }

    // tabs
    if (action === "tabs") {
      const tabAction = params.tabAction || "list";
      if (tabAction === "list") {
        return textContent(await pinchtabFetch("/tabs"));
      }
      const body: any = { action: tabAction };
      if (params.url) body.url = params.url;
      if (params.tabId) body.tabId = params.tabId;
      return textContent(await pinchtabFetch("/tab", { body }));
    }

    // screenshot
    if (action === "screenshot") {
      const query = new URLSearchParams();
      if (params.tabId) query.set("tabId", params.tabId);
      if (params.quality) query.set("quality", String(params.quality));
      const qs = query.toString();
      try {
        const res = await pinchtabFetch(
          `/screenshot${qs ? `?${qs}` : ""}`,
          { rawResponse: true }
        );
        if (res instanceof Response) {
          if (!res.ok) {
            return textContent({
              error: `Screenshot failed: ${res.status} ${await res.text()}`,
            });
          }
          const buf = await res.arrayBuffer();
          const b64 = Buffer.from(buf).toString("base64");
          return {
            content: [
              { type: "image" as const, data: b64, mimeType: "image/jpeg" },
            ],
          };
        }
        return textContent(res);
      } catch (err: any) {
        return textContent({ error: `Screenshot failed: ${err?.message}` });
      }
    }

    // evaluate
    if (action === "evaluate") {
      const body: any = { expression: params.expression };
      if (params.tabId) body.tabId = params.tabId;
      return textContent(await pinchtabFetch("/evaluate", { body }));
    }

    // pdf
    if (action === "pdf") {
      const query = new URLSearchParams();
      if (params.tabId) query.set("tabId", params.tabId);
      if (params.landscape) query.set("landscape", "true");
      if (params.scale) query.set("scale", String(params.scale));
      const qs = query.toString();
      return textContent(
        await pinchtabFetch(`/pdf${qs ? `?${qs}` : ""}`)
      );
    }

    // health
    if (action === "health") {
      return textContent(await pinchtabFetch("/health"));
    }

    return textContent({ error: `Unknown action: ${action}` });
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
