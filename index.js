#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// ==========================================
// 1. CLI FLAGS
// ==========================================

const args = process.argv.slice(2);
const withAuth = args.includes("-auth") || args.includes("--auth");

// ==========================================
// 2. CONFIGURATION & CODE TEMPLATES
// ==========================================

const GITIGNORE_CONTENT = `.venv
.env

__pycache__/
**/__pycache__/
*.py[cod]
node_modules/
dist/
.vscode/
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
${withAuth ? "from routers import auth\n" : ""}
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
    title="API",
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
${withAuth ? 'app.include_router(auth.router, prefix="/auth", tags=["auth"])' : "# app.include_router(auth.router)"}


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

const MODELS_CONTENT = withAuth
  ? `import uuid
from sqlalchemy import Column, String
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
`
  : "";

const SCHEMAS_CONTENT = withAuth
  ? `from pydantic import BaseModel, EmailStr


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    email: EmailStr

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
`
  : "";

const UTILS_CONTENT = `import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
import jwt

from database import get_db
from models import User

ph = PasswordHasher()
security = HTTPBearer(
    scheme_name="JWTBearer",
    description="Enter your JWT access token",
    auto_error=False,
)

SECRET_KEY = os.getenv("JWT_SECRET_KEY", os.getenv("JWT_SECRET", "pinghook-secret-key-change-in-production-2026"))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hashed_password, plain_password)
    except (VerifyMismatchError, VerificationError):
        return False


def create_access_token(user_id: str, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(
    auth: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not auth or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = auth.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_raw: Optional[str] = payload.get("sub")
        if not user_id_raw:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )
        user_id = str(user_id_raw)
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user
`;

const AUTH_ROUTER_CONTENT = `from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User
from schemas import UserCreate, UserLogin, UserResponse, TokenResponse
from utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter()


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing_user_query = await db.execute(
        select(User).where((User.email == user_data.email) | (User.username == user_data.username))
    )
    if existing_user_query.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email or username already exists",
        )

    new_user = User(
        username=user_data.username,
        email=user_data.email,
        password=hash_password(user_data.password),
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    token = create_access_token(user_id=new_user.id)
    return TokenResponse(access_token=token, user=new_user)


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    query = await db.execute(select(User).where(User.email == credentials.email))
    user = query.scalars().first()

    if not user or not verify_password(credentials.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(user_id=user.id)
    return TokenResponse(access_token=token, user=user)


@router.get("/profile", response_model=UserResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    return current_user
`;

// Dependencies
const PYTHON_PACKAGES = [
  "uvicorn",
  "fastapi",
  "python-dotenv",
  "sqlalchemy[asyncio]",
  "greenlet",
  "aiosqlite",
];

if (withAuth) {
  PYTHON_PACKAGES.push("argon2-cffi", "pyjwt", "pydantic[email]");
}

const REQUIREMENTS_CONTENT = `${PYTHON_PACKAGES.join("\n")}\n`;

const VSCODE_SETTINGS_CONTENT = JSON.stringify(
  {
    "python.analysis.extraPaths": ["./backend"],
  },
  null,
  2,
);

const BACKEND_FILES = [
  { name: "config.py", content: CONFIG_PY_CONTENT },
  { name: "main.py", content: MAIN_PY_CONTENT },
  { name: "models.py", content: MODELS_CONTENT },
  { name: "database.py", content: DATABASE_CONTENT },
  { name: "requirements.txt", content: REQUIREMENTS_CONTENT },
  { name: "schemas.py", content: SCHEMAS_CONTENT },
];

if (withAuth) {
  BACKEND_FILES.push({ name: "utils.py", content: UTILS_CONTENT });
}

const VITE_CONFIG_CONTENT = `import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`;

const INDEX_CSS_CONTENT = `@import "tailwindcss";\n`;

const APP_TSX_CONTENT = `import { useState, useEffect } from "react";
import { CheckCircle2, Server, Globe, ExternalLink } from "lucide-react";

export default function App() {
  const [backendStatus, setBackendStatus] = useState<"checking" | "connected" | "error">("checking");

  useEffect(() => {
    fetch("http://localhost:8000/health")
      .then((res) => {
        if (res.ok) setBackendStatus("connected");
        else setBackendStatus("error");
      })
      .catch(() => setBackendStatus("error"));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6 selection:bg-neutral-800">
      <div className="w-full max-w-md border border-neutral-800 bg-neutral-900/60 backdrop-blur-xl p-8 rounded-2xl shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">Project Startup Complete</h1>
            <p className="text-xs text-neutral-400">Vite, Tailwind v4 & FastAPI are live</p>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
            <div className="flex items-center gap-2.5 text-sm">
              <Globe className="w-4 h-4 text-neutral-400" />
              <span className="font-medium text-neutral-200">Frontend Client</span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Port 5173
            </span>
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
            <div className="flex items-center gap-2.5 text-sm">
              <Server className="w-4 h-4 text-neutral-400" />
              <span className="font-medium text-neutral-200">FastAPI Engine</span>
            </div>
            <span
              className={\`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border \${
                backendStatus === "connected"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : backendStatus === "checking"
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
              }\`}
            >
              <span
                className={\`h-1.5 w-1.5 rounded-full \${
                  backendStatus === "connected"
                    ? "bg-emerald-400 animate-pulse"
                    : backendStatus === "checking"
                    ? "bg-amber-400"
                    : "bg-rose-400"
                }\`}
              />
              {backendStatus === "connected" ? "Online" : backendStatus === "checking" ? "Connecting..." : "Offline"}
            </span>
          </div>
        </div>

        <div className="pt-2 flex flex-col gap-2">
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-neutral-100 hover:bg-white text-neutral-900 font-medium text-sm transition-colors"
          >
            Open Swagger API Docs
            <ExternalLink className="w-3.5 h-3.5 text-neutral-600" />
          </a>
        </div>
      </div>
    </div>
  );
}
`;

// ==========================================
// 3. RUNTIME HELPERS
// ==========================================

const isWin = process.platform === "win32";
const npmBin = isWin ? "npm.cmd" : "npm";

function runCommand(commandStr, label, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    console.log(`\n--- Starting: ${label} ---`);

    const proc = spawn(commandStr, { stdio: "inherit", cwd, shell: true });

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
// 4. SERVER RUNNER
// ==========================================

function startDevelopmentServers(rootDir, backendDir, frontendDir, venvDir) {
  console.log("\n========================================================");
  console.log("🚀 Starting both Backend and Frontend Servers...");
  console.log(
    "   • Backend:  http://localhost:8000 (Docs: http://localhost:8000/docs)",
  );
  console.log("   • Frontend: http://localhost:5173");
  console.log("   Press Ctrl + C at any time to stop both servers.");
  console.log("========================================================\n");

  const venvPython = isWin
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");

  // 1. Start FastAPI / Uvicorn
  const backendProc = spawn(
    `"${venvPython}" -m uvicorn main:app --reload --port 8000`,
    { stdio: "inherit", cwd: backendDir, shell: true },
  );

  // 2. Start Vite Dev Server
  const frontendProc = spawn(`${npmBin} run dev`, {
    stdio: "inherit",
    cwd: frontendDir,
    shell: true,
  });

  // Clean shutdown handler
  function shutdown() {
    console.log("\nShutting down backend and frontend servers...");
    try {
      backendProc.kill();
      frontendProc.kill();
    } catch (_) {}
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// ==========================================
// 5. EXECUTION WORKFLOW
// ==========================================

async function setup() {
  const rootDir = process.cwd();

  try {
    if (withAuth) {
      console.log(
        "\n[Auth Mode Enabled]: Setting up User model, schemas, utils, and auth router.",
      );
    }

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

    for (const file of BACKEND_FILES) {
      ensureFile(path.join(backendDir, file.name), file.content);
    }

    if (withAuth) {
      ensureFile(path.join(routersDir, "auth.py"), AUTH_ROUTER_CONTENT);
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

    // Step 5: Scaffold React + TS Frontend
    const frontendDir = path.join(rootDir, "frontend");
    if (!fs.existsSync(frontendDir)) {
      await runCommand(
        `${npmBin} create vite@latest frontend -- --template react-ts --no-immediate`,
        "Scaffolding React (TS) project via Vite",
        rootDir,
      );

      await runCommand(
        `${npmBin} install`,
        "Installing base frontend dependencies",
        frontendDir,
      );
    }

    // Step 6: Install frontend dependencies
    await runCommand(
      `${npmBin} install react-router-dom lucide-react`,
      "Installing frontend runtime dependencies",
      frontendDir,
    );

    await runCommand(
      `${npmBin} install tailwindcss @tailwindcss/vite`,
      "Installing Tailwind v4 Vite plugin",
      frontendDir,
    );

    // Step 7: Overwrite configs, App.tsx, index.css & delete App.css
    console.log("\n--- Configuring Frontend Structure & Tailwind Plugin ---");

    const srcDir = path.join(frontendDir, "src");
    ensureDir(srcDir);

    fs.writeFileSync(
      path.join(frontendDir, "vite.config.ts"),
      VITE_CONFIG_CONTENT,
      "utf8",
    );
    fs.writeFileSync(path.join(srcDir, "index.css"), INDEX_CSS_CONTENT, "utf8");
    fs.writeFileSync(path.join(srcDir, "App.tsx"), APP_TSX_CONTENT, "utf8");

    const appCssPath = path.join(srcDir, "App.css");
    if (fs.existsSync(appCssPath)) {
      fs.unlinkSync(appCssPath);
      console.log("Removed: src/App.css");
    }

    console.log(
      `\nSetup completed successfully! Python dependencies installed in .venv, backend ready${withAuth ? " (with Auth endpoints)" : ""}, and frontend configured.`,
    );

    // Step 8: Start both servers and keep terminal active
    startDevelopmentServers(rootDir, backendDir, frontendDir, venvDir);
  } catch (err) {
    console.error(`\nSetup failed: ${err.message}`);
    process.exit(1);
  }
}

setup();
