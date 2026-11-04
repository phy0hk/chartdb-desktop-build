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
