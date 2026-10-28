#!/usr/bin/env node

const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const {
  GITIGNORE_CONTENT,
  VSCODE_SETTINGS_CONTENT,
  CONFIG_PY_CONTENT,
  getConfigPyContent,
  getMainPyContent,
  DATABASE_CONTENT,
  MODELS_AUTH_CONTENT,
  SCHEMAS_AUTH_CONTENT,
  UTILS_CONTENT,
  AUTH_ROUTER_CONTENT,
  VITE_CONFIG_CONTENT,
  INDEX_CSS_CONTENT,
  WEB_APP_TSX_CONTENT,
  EXPO_APP_TSX_CONTENT,
} = require("./templates");

// ==========================================
// 1. CLI FLAGS
// ==========================================

const args = process.argv.slice(2);
const withAuth = args.includes("-auth") || args.includes("--auth");
const isApp = args.includes("-app") || args.includes("--app");
const isStartOnly =
  args.includes("start") ||
  args.includes("dev") ||
  args.includes("-start") ||
  args.includes("--start");

// ==========================================
// 2. RUNTIME HELPERS
// ==========================================

const isWin = process.platform === "win32";
const npmBin = isWin ? "npm.cmd" : "npm";
const npxBin = isWin ? "npx.cmd" : "npx";

function runCommand(commandStr, label, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    console.log(`\n--- Starting: ${label} ---`);

    const proc = spawn(commandStr, {
      stdio: "inherit",
      cwd,
      shell: true,
      env: process.env,
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code}`));
    });

    proc.on("error", (err) => reject(err));
  });
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${path.relative(process.cwd(), dirPath)}`);
  }
}

function ensureFile(filePath, content = "") {
  if (!fs.existsSync(filePath)) {
    const parent = path.dirname(filePath);
    ensureDir(parent);
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Created file: ${path.relative(process.cwd(), filePath)}`);
  }
}

function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (_) {
      try {
        if (isWin) {
          execSync(`rmdir /s /q "${dirPath}"`, { stdio: "ignore" });
        } else {
          execSync(`rm -rf "${dirPath}"`, { stdio: "ignore" });
        }
      } catch (_) {}
    }
  }
}

function removeFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {
      try {
        if (isWin) {
          execSync(`del /f /q "${filePath}"`, { stdio: "ignore" });
        } else {
          execSync(`rm -f "${filePath}"`, { stdio: "ignore" });
        }
      } catch (_) {}
    }
  }
}

function cleanScaffoldArtifacts(targetDir, isSubdir = true) {
  if (!fs.existsSync(targetDir)) return;
  if (isSubdir) {
    removeDir(path.join(targetDir, ".git"));
  }
  removeDir(path.join(targetDir, ".claude"));
  removeDir(path.join(targetDir, "claude"));
  removeFile(path.join(targetDir, "AGENTS.md"));
  removeFile(path.join(targetDir, "agents.md"));
}

// ==========================================
// 3. SERVER RUNNER
// ==========================================

function freePort(port) {
  try {
    if (isWin) {
      const output = execSync(`netstat -ano | findstr :${port}`, {
        encoding: "utf8",
      });
      const lines = output.trim().split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0") {
          execSync(`taskkill /F /PID ${pid} 2>nul`);
        }
      }
    } else {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`);
    }
  } catch (_) {}
}

function startDevelopmentServers(
  rootDir,
  backendDir,
  clientDir,
  venvDir,
  isAppMode,
) {
  freePort(8000);

  console.log("\n========================================================");
  console.log("🚀 Starting Development Servers...");
  console.log(
    "   • Backend:  http://localhost:8000 (Docs: http://localhost:8000/docs)",
  );
  console.log(
    isAppMode
      ? "   • Mobile:   Expo Metro Bundler"
      : "   • Frontend: http://localhost:5173",
  );
  console.log("   Press Ctrl + C at any time to stop servers.");
  console.log("========================================================\n");

  const venvPython = isWin
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");

  const backendProc = spawn(
    `"${venvPython}" -m uvicorn main:app --reload --port 8000`,
    { stdio: "inherit", cwd: backendDir, shell: true, env: process.env },
  );

  const clientCommand = isAppMode ? `${npmBin} start` : `${npmBin} run dev`;
  const clientProc = spawn(clientCommand, {
    stdio: "inherit",
    cwd: clientDir,
    shell: true,
    env: process.env,
  });

  function shutdown() {
    console.log("\nShutting down servers...");
    try {
      backendProc.kill();
      clientProc.kill();
    } catch (_) {}
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ==========================================
// 4. EXECUTION WORKFLOW
// ==========================================

async function setup() {
  const rootDir = process.cwd();

  try {
    if (withAuth)
      console.log(
        "\n[Auth Mode Enabled]: Scaffolding User auth routes and models.",
      );
    if (isApp)
      console.log(
        "\n[App Mode Enabled]: Target is Expo React Native (mobile/).",
      );
    else console.log("\n[Web Mode Enabled]: Target is Vite React (frontend/).");

    // Step 1: Root .gitignore & .vscode configuration
    console.log("\n--- Creating Root Files ---");
    ensureFile(path.join(rootDir, ".gitignore"), GITIGNORE_CONTENT);

    const vscodeDir = path.join(rootDir, ".vscode");
    ensureDir(vscodeDir);
    ensureFile(path.join(vscodeDir, "settings.json"), VSCODE_SETTINGS_CONTENT);

    // Step 2: Setup Python virtual environment (.venv)
    const venvDir = path.join(rootDir, ".venv");
    if (!fs.existsSync(venvDir)) {
      const pythonCmd = isWin ? "python" : "python3";
      await runCommand(
        `${pythonCmd} -m venv .venv`,
        "Creating Python virtual environment (.venv)",
        rootDir,
      );
    }

    // Step 3: Scaffold Backend Structure
    console.log("\n--- Setting up Backend Structure ---");
    const backendDir = path.join(rootDir, "backend");
    const routersDir = path.join(backendDir, "routers");
    ensureDir(routersDir);

    const pythonPackages = [
      "uvicorn",
      "fastapi",
      "python-dotenv",
      "sqlalchemy[asyncio]",
      "greenlet",
      "aiosqlite",
    ];
    if (withAuth)
      pythonPackages.push("argon2-cffi", "pyjwt", "pydantic[email]");

    const backendFiles = [
      { name: "config.py", content: getConfigPyContent(isApp) },
      { name: "main.py", content: getMainPyContent(withAuth, isApp) },
      { name: "models.py", content: withAuth ? MODELS_AUTH_CONTENT : "" },
      { name: "database.py", content: DATABASE_CONTENT },
      { name: "requirements.txt", content: `${pythonPackages.join("\n")}\n` },
      { name: "schemas.py", content: withAuth ? SCHEMAS_AUTH_CONTENT : "" },
    ];

    if (withAuth) {
      backendFiles.push({ name: "utils.py", content: UTILS_CONTENT });
      ensureFile(path.join(routersDir, "auth.py"), AUTH_ROUTER_CONTENT);
    }

    for (const file of backendFiles) {
      ensureFile(path.join(backendDir, file.name), file.content);
    }

    // Step 4: Install Python packages into .venv
    const venvPip = isWin
      ? path.join(venvDir, "Scripts", "pip.exe")
      : path.join(venvDir, "bin", "pip");

    const reqPath = path.join(backendDir, "requirements.txt");
    await runCommand(
      `"${venvPip}" install -r "${reqPath}"`,
      "Installing Python packages into .venv",
      rootDir,
    );

    // Step 5: Client Scaffolding (Expo Mobile vs. Vite Web)
    let clientDir;

    if (isApp) {
      clientDir = path.join(rootDir, "mobile");
      if (!fs.existsSync(clientDir)) {
        await runCommand(
          `${npxBin} -y create-expo-app@latest mobile --template blank-typescript --no-install --yes`,
          "Scaffolding Expo (React Native TypeScript) project",
          rootDir,
        );

        if (!fs.existsSync(clientDir)) {
          throw new Error("Mobile directory was not created during scaffolding.");
        }

        // Remove git repo and unwanted AI agent files created by create-expo-app
        cleanScaffoldArtifacts(clientDir);

        await runCommand(
          `${npmBin} install`,
          "Installing Expo base dependencies via npm",
          clientDir,
        );

        await runCommand(
          `${npxBin} expo install react-dom react-native-web react-native-svg`,
          "Installing Expo web and SVG dependencies",
          clientDir,
        );

        await runCommand(
          `${npmBin} install lucide-react-native`,
          "Installing Lucide Icons for React Native",
          clientDir,
        );

        fs.writeFileSync(
          path.join(clientDir, "App.tsx"),
          EXPO_APP_TSX_CONTENT,
          "utf8",
        );
      }

      cleanScaffoldArtifacts(clientDir);
      cleanScaffoldArtifacts(rootDir, false);
    } else {
      clientDir = path.join(rootDir, "frontend");
      if (!fs.existsSync(clientDir)) {
        await runCommand(
          `${npxBin} -y create-vite@9.3.1 frontend --template react-ts --eslint --no-immediate`,
          "Scaffolding React (TS) project via Vite",
          rootDir,
        );

        if (!fs.existsSync(clientDir)) {
          throw new Error(
            "Frontend directory was not created during scaffolding.",
          );
        }

        cleanScaffoldArtifacts(clientDir);

        await runCommand(
          `${npmBin} install`,
          "Installing base frontend dependencies via npm",
          clientDir,
        );
      }

      cleanScaffoldArtifacts(clientDir);
      cleanScaffoldArtifacts(rootDir, false);

      await runCommand(
        `${npmBin} install react-router-dom lucide-react`,
        "Installing frontend runtime dependencies",
        clientDir,
      );

      await runCommand(
        `${npmBin} install -D tailwindcss @tailwindcss/vite`,
        "Installing Tailwind v4 Vite plugin",
        clientDir,
      );

      console.log("\n--- Configuring Frontend Structure & Tailwind Plugin ---");

      const srcDir = path.join(clientDir, "src");
      ensureDir(srcDir);

      fs.writeFileSync(
        path.join(clientDir, "vite.config.ts"),
        VITE_CONFIG_CONTENT,
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "index.css"),
        INDEX_CSS_CONTENT,
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "App.tsx"),
        WEB_APP_TSX_CONTENT,
        "utf8",
      );

      const appCssPath = path.join(srcDir, "App.css");
      if (fs.existsSync(appCssPath)) {
        fs.unlinkSync(appCssPath);
        console.log("Removed: src/App.css");
      }
    }

    console.log(
      `\nSetup completed successfully! Python dependencies installed in .venv, backend ready${withAuth ? " (with Auth endpoints)" : ""}, and client ready.`,
    );

    // Step 6: Start both servers and keep terminal active
    startDevelopmentServers(rootDir, backendDir, clientDir, venvDir, isApp);
  } catch (err) {
    console.error(`\nSetup failed: ${err.message}`);
    process.exit(1);
  }
}

setup();
