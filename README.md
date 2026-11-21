# README

## About

This is the official Wails React-TS template.

You can configure the project by editing `wails.json`. More information about the project settings can be found
here: https://wails.io/docs/reference/project-config

## Live Development

To run in live development mode, run `wails dev` in the project directory. This will run a Vite development
server that will provide very fast hot reload of your frontend changes. If you want to develop in a browser
and have access to your Go methods, there is also a dev server that runs on http://localhost:34115. Connect
to this in your browser, and you can call your Go code from devtools.

### Browser collaboration

The browser can join a session directly with the **Join** toolbar action; it does not need Wails bindings or a desktop build. Browser hosting requires a Go collaboration service that is already listening on a WebSocket URL, because browsers cannot bind an inbound LAN listener. Configure that URL before starting Vite:

```bash
# Terminal 1, from the repository root:
CHARTDB_COLLABORATION_SERVER=1 go run .

# Terminal 2, from frontend/; copy the printed invite URL:
VITE_COLLABORATION_URL=ws://192.168.1.20:43365/collaborate/<session-token> npm run dev
```

The Wails runtime still starts its own service automatically when available. Keep the session token in the URL, and use collaboration only on a trusted LAN; the service is unencrypted. When the host leaves, the session ends for every participant; start a new service/session to collaborate again.

### Collaboration verification

The focused development checks do not require a desktop build:

```bash
# Repository root: Go protocol/session tests
go test -race ./...

# frontend/: unit tests, typecheck, lint
npx vitest run src/lib/collaboration/__tests__ --reporter=dot
npx tsc -b --pretty false
npm run lint

# frontend/: three isolated Firefox clients against a supervised Go service + Vite
npx playwright test e2e/collaboration.spec.ts
```

The Playwright command starts `e2e/dev-servers.mjs`, which runs `CHARTDB_COLLABORATION_SERVER=1 go run .` and the Vite dev server with a generated `VITE_COLLABORATION_URL`. The spec exercises join/presence, live edits, cursors and selection, host rejection/rollback, reconnect/resync, and host-stop session ending.

## Building

> **Resource warning:** Do not compile or package unless you need the generated frontend or desktop artifact. Builds can use substantial CPU and memory and may freeze the operating system. Prefer `wails dev` or the Vite dev server for normal development.

### Prerequisites

- **Node.js:** `20.19+` or `22.12+` for the Vite toolchain. Use one Node version consistently for the whole build.
- **Bun:** Any current stable Bun release can be used instead of Node.js. Bun is optional.
- **Go:** Go `1.26+`, as required by `go.mod`.
- **Wails:** Wails v2.17.1 or a compatible Wails v2 CLI. Install it using the official [Wails installation guide](https://wails.io/docs/gettingstarted/installation).
- **Native dependencies:** Windows needs WebView2, macOS needs Xcode Command Line Tools, and Linux needs the GTK/WebKitGTK development packages required by Wails.

Run the commands below from the `frontend/` directory for a frontend-only build. Run `wails` commands from the repository root.

### Frontend build with different package managers

The repository currently includes `frontend/package-lock.json` and `frontend/bun.lock`. npm and Bun therefore provide the reproducible lockfile-based installs. pnpm and Yarn are also supported, but use their own lockfile if you add one.

| Package manager | Install dependencies            | Build            | Runtime |
| --------------- | ------------------------------- | ---------------- | ------- |
| npm             | `npm ci`                        | `npm run build`  | Node.js |
| pnpm            | `pnpm install`                  | `pnpm run build` | Node.js |
| Yarn            | `yarn install`                  | `yarn build`     | Node.js |
| Bun             | `bun install --frozen-lockfile` | `bun run build`  | Bun     |

For example:

```bash
cd frontend
npm ci
npm run build
```

If you need to pass the optional OpenAI key, set it before the build. In PowerShell use `$env:VITE_OPENAI_API_KEY = "<YOUR_OPEN_AI_KEY>"`; in Bash, macOS, and Linux use:

```bash
VITE_OPENAI_API_KEY=<YOUR_OPEN_AI_KEY> npm run build
```

Do not increase `NODE_OPTIONS` unless the build genuinely needs more memory; doing so can make system-wide freezing more likely. If it is necessary, use `NODE_OPTIONS="--max-old-space-size=4096"` with Node-based commands or the equivalent environment setting for your shell.

### Desktop builds by operating system

Build on the target operating system when possible. These commands create the Wails production package and automatically run the configured frontend build.

**Windows (PowerShell):**

```powershell
wails build -platform windows/amd64
```

**macOS:**

```bash
wails build -platform darwin/universal
```

**Linux:**

```bash
wails build -platform linux/amd64
```

For a native build, `wails build` is also sufficient. Cross-compiling may require additional platform SDKs and is not guaranteed to work from every host OS. Check the [Wails build documentation](https://wails.io/docs/reference/cli#build) for platform-specific options.
