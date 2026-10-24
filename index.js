#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// ==========================================
// 1. CONFIGURATION & STRUCTURE
// ==========================================

const GITIGNORE_CONTENT = `.venv
.env

__pycache__/
**/__pycache__/
*.py[cod]
node_modules/
dist/
`;

const CONFIG_PY_CONTENT = `import os
import subprocess
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"), override=True)

# ------------------------------
# Frontend build configuration
# ------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.normpath(os.path.join(BASE_DIR, "../frontend"))
SRC_DIR = os.path.join(FRONTEND_DIR, "src")
DIST_DIR = os.path.join(FRONTEND_DIR, "dist")


def latest_modified_time(path: str) -> float:
    """Recursively find the latest modification time in a directory."""
    latest_time = 0.0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                latest_time = max(latest_time, os.path.getmtime(os.path.join(root, f)))
            except FileNotFoundError:
                continue
    return latest_time


def frontend_needs_rebuild() -> bool:
    """Return True if src files are newer than dist files or dist is missing."""
    if not os.path.exists(DIST_DIR) or not os.listdir(DIST_DIR):
        return True  # dist missing or empty

    src_time = latest_modified_time(SRC_DIR)
    dist_time = latest_modified_time(DIST_DIR)
    return src_time > dist_time


def build_frontend():
    """Build frontend if it's outdated."""
    try:
        if frontend_needs_rebuild():
            print("⚙️  Detected frontend changes — rebuilding...")
            subprocess.run("npm run build", cwd=FRONTEND_DIR, shell=True, check=True)
            print("✅ Frontend rebuilt successfully.")
        else:
            print("✅ Frontend is up to date.")
    except subprocess.CalledProcessError as e:
        print("❌ Frontend build failed:", e)


# ------------------------------
# Auth and Security Configuration
# ------------------------------
SECRET_KEY = os.getenv("JWT_SECRET", "")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30  # 30 days
`;

const MAIN_PY_CONTENT = `import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import DIST_DIR, build_frontend
from database import AsyncSessionLocal, Base, engine
import models

load_dotenv()

# Build frontend automatically if outdated and not in production deploy override
if os.getenv("RENDER", "false").lower() != "true":
    build_frontend()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-create SQLite database tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="",
    description="",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    swagger_ui_parameters={"persistAuthorization": True},
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://*.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
# app.include_router(auth.router)


@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok", "service": "api"}

# ------------------------------
# Static Files & React SPA Fallback (Must remain at bottom)
# ------------------------------
assets_path = os.path.join(DIST_DIR, "assets")
if os.path.exists(assets_path):
    app.mount("/assets", StaticFiles(directory=assets_path), name="assets")
else:
    print(f"⚠️ Warning: Assets folder not found at {assets_path}.")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    file_path = os.path.join(DIST_DIR, "favicon.ico")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return (
        FileResponse(os.path.join(DIST_DIR, "index.html"))
        if os.path.exists(os.path.join(DIST_DIR, "index.html"))
        else {"error": "Favicon not found"}
    )


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_react(full_path: str):
    potential_file = os.path.join(DIST_DIR, full_path)
    if full_path and os.path.isfile(potential_file):
        return FileResponse(potential_file)

    index_path = os.path.join(DIST_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)

    return {
        "error": "Frontend build not found.",
        "detail": "Please verify 'npm run build' generated dist/index.html before running Uvicorn.",
    }

# To run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
`;

const DATABASE_CONTENT = `import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

BACKEND_DIR = Path(__file__).resolve().parent
if (BACKEND_DIR / ".env").exists():
    load_dotenv(BACKEND_DIR / ".env")
else:
    load_dotenv(BACKEND_DIR.parent / ".env")
load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite+aiosqlite:///{BACKEND_DIR / 'project.db'}"
)

# SQLite requires check_same_thread=False for async/multithreaded access
connect_args = {}
if "sqlite" in DATABASE_URL:
    connect_args = {"check_same_thread": False}

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args=connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
`;

const PYTHON_PACKAGES = [
  "uvicorn",
  "fastapi",
  "python-dotenv",
  "sqlalchemy",
  "aiosqlite",
];

const REQUIREMENTS_CONTENT = `${PYTHON_PACKAGES.join("\n")}\n`;

const BACKEND_FILES = [
  { name: "config.py", content: CONFIG_PY_CONTENT },
  { name: "main.py", content: MAIN_PY_CONTENT },
  { name: "models.py", content: "" },
  { name: "database.py", content: DATABASE_CONTENT },
  { name: "requirements.txt", content: REQUIREMENTS_CONTENT },
  { name: "schemas.py", content: "" },
];

const VITE_CONFIG_CONTENT = `import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`;

const INDEX_CSS_CONTENT = `@import "tailwindcss";\n`;

const APP_TSX_CONTENT = `export default function App() {
  return (
    <>
      <p>Hi</p>
    </>
  );
}
`;

// ==========================================
// 2. RUNTIME HELPERS
// ==========================================

const isWin = process.platform === "win32";
const npmBin = isWin ? "npm.cmd" : "npm";

function runCommand(command, args, label, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    console.log(`\n--- Starting: ${label} ---`);

    const proc = spawn(command, args, { stdio: "inherit", cwd, shell: true });

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

// ==========================================
// 3. EXECUTION WORKFLOW
// ==========================================

async function setup() {
  const rootDir = process.cwd();

  try {
    // Step 1: Root .gitignore
    console.log("\n--- Creating Root Files ---");
    ensureFile(path.join(rootDir, ".gitignore"), GITIGNORE_CONTENT);

    // Step 2: Setup Python virtual environment (.venv)
    const venvDir = path.join(rootDir, ".venv");
    if (!fs.existsSync(venvDir)) {
      const pythonCmd = isWin ? "python" : "python3";
      await runCommand(
        pythonCmd,
        ["-m", "venv", ".venv"],
        "Creating Python virtual environment (.venv)",
        rootDir,
      );
    }

    // Step 3: Scaffold Backend Structure
    console.log("\n--- Setting up Backend Structure ---");
    const backendDir = path.join(rootDir, "backend");
    const routersDir = path.join(backendDir, "routers");
    ensureDir(routersDir);

    for (const file of BACKEND_FILES) {
      ensureFile(path.join(backendDir, file.name), file.content);
    }

    // Step 4: Install Python packages into .venv
    const venvPip = isWin
      ? path.join(venvDir, "Scripts", "pip.exe")
      : path.join(venvDir, "bin", "pip");

    await runCommand(
      venvPip,
      ["install", "-r", path.join(backendDir, "requirements.txt")],
      "Installing Python packages into .venv",
      rootDir,
    );

    // Step 5: Scaffold React + TS Frontend (Direct shell execution, no prompts)
    const frontendDir = path.join(rootDir, "frontend");
    if (!fs.existsSync(frontendDir)) {
      await runCommand(
        npmBin,
        [
          "create",
          "vite@latest",
          "frontend",
          "--",
          "--template",
          "react-ts",
          "--no-immediate",
        ],
        "Scaffolding React (TS) project via Vite",
        rootDir,
      );

      await runCommand(
        npmBin,
        ["install"],
        "Installing base frontend dependencies",
        frontendDir,
      );
    }

    // Step 6: Install frontend dependencies
    await runCommand(
      npmBin,
      ["install", "react-router-dom", "lucide-react"],
      "Installing frontend runtime dependencies",
      frontendDir,
    );

    await runCommand(
      npmBin,
      ["install", "tailwindcss", "@tailwindcss/vite"],
      "Installing Tailwind v4 Vite plugin",
      frontendDir,
    );

    // Step 7: Overwrite configs, App.tsx, index.css & delete App.css
    console.log("\n--- Configuring Frontend Structure & Tailwind Plugin ---");

    fs.writeFileSync(
      path.join(frontendDir, "vite.config.ts"),
      VITE_CONFIG_CONTENT,
      "utf8",
    );
    fs.writeFileSync(
      path.join(frontendDir, "src", "index.css"),
      INDEX_CSS_CONTENT,
      "utf8",
    );
    fs.writeFileSync(
      path.join(frontendDir, "src", "App.tsx"),
      APP_TSX_CONTENT,
      "utf8",
    );

    const appCssPath = path.join(frontendDir, "src", "App.css");
    if (fs.existsSync(appCssPath)) {
      fs.unlinkSync(appCssPath);
      console.log("Removed: src/App.css");
    }

    console.log(
      "\nSetup completed successfully! Python dependencies installed in .venv, backend ready, and frontend configured with Tailwind v4, Lucide, and React Router.",
    );
  } catch (err) {
    console.error(`\nSetup failed: ${err.message}`);
    process.exit(1);
  }
}

setup();
