// ==========================================
// ROOT & CONFIG TEMPLATES
// ==========================================

const GITIGNORE_CONTENT = `.venv
.env

__pycache__/
**/__pycache__/
*.py[cod]
node_modules/
dist/
.vscode/
.expo/
`;

const VSCODE_SETTINGS_CONTENT = JSON.stringify(
  {
    "python.defaultInterpreterPath": "\${workspaceFolder}/.venv/bin/python",
    "python.analysis.extraPaths": ["./backend"],
  },
  null,
  2,
);

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
    if not os.path.exists(FRONTEND_DIR):
        return

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

function getConfigPyContent(isApp = false) {
  if (isApp) return "";
  return CONFIG_PY_CONTENT;
}

function getMainPyContent(withAuth, isApp = false) {
  const authImport = withAuth ? "from routers import auth\n" : "";
  const authRouter = withAuth
    ? 'app.include_router(auth.router, prefix="/auth", tags=["auth"])'
    : "# app.include_router(auth.router)";

  if (isApp) {
    return `import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import AsyncSessionLocal, Base, engine
import models
${authImport}load_dotenv()


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
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "https://*.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
${authRouter}


@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok", "service": "api"}

# To run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
`;
  }

  return `import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import DIST_DIR, build_frontend
from database import AsyncSessionLocal, Base, engine
import models
${authImport}load_dotenv()

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
${authRouter}


@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok", "service": "api"}

# ------------------------------
# Static Files & React SPA Fallback (Must remain at bottom)
# ------------------------------
assets_path = os.path.join(DIST_DIR, "assets")
if os.path.exists(assets_path):
    app.mount("/assets", StaticFiles(directory=assets_path), name="assets")


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
        "status": "ready",
        "detail": "API online. Connect your frontend client or view /docs.",
    }

# To run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
`;
}

const DATABASE_CONTENT = `import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

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

class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
`;

// ==========================================
// AUTH TEMPLATES
// ==========================================

const MODELS_AUTH_CONTENT = `import uuid
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    password: Mapped[str] = mapped_column(String, nullable=False)
`;

const SCHEMAS_AUTH_CONTENT = `from pydantic import BaseModel, EmailStr


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
`;

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

    token = create_access_token(user_id=str(new_user.id))
    return TokenResponse(access_token=token, user=UserResponse.model_validate(new_user))


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    query = await db.execute(select(User).where(User.email == credentials.email))
    user = query.scalars().first()

    if not user or not verify_password(credentials.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(user_id=str(user.id))
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/profile", response_model=UserResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    return current_user
`;

// ==========================================
// CLIENT TEMPLATES (Vite & Expo)
// ==========================================

const VITE_CONFIG_CONTENT = `import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`;

const INDEX_CSS_CONTENT = `@import "tailwindcss";\n`;

const WEB_APP_TSX_CONTENT = `import { useState, useEffect } from "react";
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

const EXPO_APP_TSX_CONTENT = `import React, { useState, useEffect } from "react";
import { StyleSheet, Text, View, SafeAreaView, StatusBar, TouchableOpacity, Linking } from "react-native";
import { CheckCircle2, Server, Smartphone } from "lucide-react-native";

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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconBox}>
            <CheckCircle2 color="#34d399" size={24} />
          </View>
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.title}>Mobile Startup Complete</Text>
            <Text style={styles.subtitle}>Expo & FastAPI are ready</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.rowLabel}>
            <Smartphone color="#a3a3a3" size={18} />
            <Text style={styles.label}>Expo Client</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Metro Online</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.rowLabel}>
            <Server color="#a3a3a3" size={18} />
            <Text style={styles.label}>FastAPI Engine</Text>
          </View>
          <View style={[styles.badge, backendStatus === "error" && styles.badgeError]}>
            <Text style={[styles.badgeText, backendStatus === "error" && styles.badgeTextError]}>
              {backendStatus === "connected" ? "Online" : backendStatus === "checking" ? "Checking..." : "Offline"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => Linking.openURL("http://localhost:8000/docs")}
        >
          <Text style={styles.buttonText}>Open Swagger API Docs</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    backgroundColor: "#171717",
    borderColor: "#262626",
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    color: "#a3a3a3",
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0a0a0a",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#262626",
  },
  rowLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    color: "#e5e5e5",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
  },
  badge: {
    backgroundColor: "rgba(52, 211, 153, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(52, 211, 153, 0.2)",
  },
  badgeError: {
    backgroundColor: "rgba(244, 63, 94, 0.1)",
    borderColor: "rgba(244, 63, 94, 0.2)",
  },
  badgeText: {
    color: "#34d399",
    fontSize: 12,
    fontWeight: "500",
  },
  badgeTextError: {
    color: "#f43f5e",
  },
  button: {
    marginTop: 14,
    backgroundColor: "#ffffff",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#0a0a0a",
    fontSize: 14,
    fontWeight: "600",
  },
});
`;

module.exports = {
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
};
