<h1 align="center">pinchtab-mcp</h1>

<p align="center">
  <strong>MCP server for <a href="https://github.com/pinchtab/pinchtab">PinchTab</a> — browser automation for AI agents</strong><br/>
  Works with OpenCode, Cursor, Claude Desktop, and any MCP-compatible client
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MCP-stdio-6B46C1?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyem0tMSAxNXYtNEg3bDUtOXY0aDRsLTUgOXoiLz48L3N2Zz4=" alt="MCP stdio"/>
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js ≥18"/>
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT license"/>
</p>

---

## What is this?

[PinchTab](https://github.com/pinchtab/pinchtab) is a standalone Go binary that gives AI agents full control over a Chrome browser via an HTTP API. It is token-efficient, headless-capable, and supports persistent browser profiles.

**pinchtab-mcp** is a thin [Model Context Protocol](https://modelcontextprotocol.io) (MCP) stdio server that wraps PinchTab's HTTP API — making it available as a standard MCP tool in any compatible AI coding agent or chat client.

```
AI client (OpenCode / Cursor / Claude Desktop)
        │  MCP stdio (JSON-RPC)
        ▼
  pinchtab-mcp  ──HTTP──▶  PinchTab :9867  ──CDP──▶  Chrome
```

### Why a separate MCP wrapper?

PinchTab exposes a plain HTTP API. MCP clients communicate over stdin/stdout using JSON-RPC. This server bridges the two, adding:

- Single `pinchtab` tool with a unified `action` parameter — minimal context bloat
- Typed, validated inputs via Zod
- Auth token forwarding, configurable timeout
- Screenshot responses as MCP image content (base64 JPEG)

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Node.js ≥ 18** | Required to run the MCP server |
| **PinchTab** | The Go binary must be running locally (or in Docker) |

### Install PinchTab

```bash
# macOS / Linux
curl -fsSL https://pinchtab.com/install.sh | bash

# npm
npm install -g pinchtab

# Docker
docker run -d -p 9867:9867 ghcr.io/pinchtab/pinchtab:latest
```

> Full PinchTab docs: [pinchtab.com/docs](https://pinchtab.com/docs)

---

## Setup

### 1. Clone and build

```bash
git clone https://github.com/domci/pinchtab-mcp.git
cd pinchtab-mcp
npm install
npm run build
```

This compiles `src/index.ts` to `dist/index.js`.

### 2. Start PinchTab

In a separate terminal — PinchTab must be running before the MCP server is used:

```bash
# Basic
pinchtab

# With an auth token (recommended)
BRIDGE_TOKEN=my-secret pinchtab
```

### 3. Configure your client

#### OpenCode

Add to `~/.config/opencode/opencode.json` (global) or `opencode.json` in your project root:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "pinchtab": {
      "type": "local",
      "command": ["node", "/absolute/path/to/pinchtab-mcp/dist/index.js"],
      "enabled": true,
      "environment": {
        "PINCHTAB_URL": "http://localhost:9867",
        "PINCHTAB_TOKEN": "my-secret"   // omit if no auth token
      }
    }
  }
}
```

#### Cursor IDE

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "pinchtab": {
      "command": "node",
      "args": ["/absolute/path/to/pinchtab-mcp/dist/index.js"],
      "env": {
        "PINCHTAB_URL": "http://localhost:9867",
        "PINCHTAB_TOKEN": "my-secret"
      },
      "type": "stdio"
    }
  }
}
```

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pinchtab": {
      "command": "node",
      "args": ["/absolute/path/to/pinchtab-mcp/dist/index.js"],
      "env": {
        "PINCHTAB_URL": "http://localhost:9867"
      }
    }
  }
}
```

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PINCHTAB_URL` | `http://localhost:9867` | Base URL of the running PinchTab server |
| `PINCHTAB_TOKEN` | *(empty)* | Bearer token — must match `BRIDGE_TOKEN` set on PinchTab |
| `PINCHTAB_TIMEOUT` | `30000` | HTTP request timeout in milliseconds |

---

## Tool reference

A single `pinchtab` tool is registered. All operations are dispatched via the `action` parameter.

### Actions

| Action | Description | Key parameters |
|--------|-------------|----------------|
| `navigate` | Navigate to a URL | `url`, `newTab?`, `blockImages?`, `timeout?` |
| `snapshot` | Accessibility tree of the current page | `filter?`, `format?`, `diff?`, `maxTokens?`, `depth?` |
| `click` | Click an element | `ref` |
| `type` | Type text into a focused element | `ref`, `text` |
| `fill` | Clear and fill an input | `ref`, `text` |
| `press` | Press a key | `ref`, `key` (e.g. `Enter`, `Tab`) |
| `hover` | Hover over an element | `ref` |
| `scroll` | Scroll the page | `ref?`, `scrollY` |
| `select` | Select a dropdown option | `ref`, `value` |
| `focus` | Focus an element | `ref` |
| `text` | Extract readable page text (~800 tokens) | `mode?` (`readability`\|`raw`) |
| `tabs` | List, open, or close tabs | `tabAction?` (`list`\|`new`\|`close`) |
| `screenshot` | Capture a JPEG screenshot | `quality?` (1–100) |
| `evaluate` | Execute JavaScript in the page | `expression` |
| `pdf` | Export page as PDF | `landscape?`, `scale?` |
| `health` | Check PinchTab connectivity | — |

All actions accept an optional `tabId` to target a specific tab.

### Token strategy

| Scenario | Recommended action | Approx. tokens |
|----------|--------------------|----------------|
| Read page content | `text` | ~800 |
| Find interactive elements | `snapshot` with `filter=interactive&format=compact` | ~3,600 |
| Track page changes | `snapshot` with `diff=true` | delta only |
| Visual verification | `screenshot` | ~2,000 |

---

## Example prompts

```
Navigate to https://news.ycombinator.com and extract the top 10 story titles.
use pinchtab
```

```
Go to https://example.com/login, fill in the username and password fields, and submit the form.
use pinchtab
```

```
Take a screenshot of the current page.
use pinchtab
```

---

## Development

```bash
# Install dependencies
npm install

# Build (TypeScript → dist/)
npm run build

# Run directly
node dist/index.js
```

### Project structure

```
pinchtab-mcp/
├── src/
│   └── index.ts       # MCP stdio server — all logic lives here
├── dist/              # Compiled output (git-ignored)
├── package.json
└── tsconfig.json
```

---

## Security notes

- **`BRIDGE_TOKEN` / `PINCHTAB_TOKEN`** — always set a token in production environments; rotate it regularly.
- **`evaluate`** executes arbitrary JavaScript inside Chrome — restrict access to trusted agents and domains.
- PinchTab should not be exposed to the public internet; keep it on `localhost` or behind a private network.

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Built on top of <a href="https://github.com/pinchtab/pinchtab"><strong>PinchTab</strong></a> by the PinchTab authors · MCP wrapper by <a href="https://github.com/domci">domci</a>
</p>
