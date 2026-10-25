# `pro-setup`

An opinionated, zero-configuration CLI developer tool built to automate the orchestration, scaffolding, and immediate execution of modern full-stack environments.

Rather than simply cloning boilerplates or creating isolated directories, `pro-setup` acts as an automated environment orchestrator: provision isolated Python virtual environments, configure asynchronous database sessions, build modern client templates (Web SPA or Mobile Native), inject modular authentication infrastructure on demand, and concurrently run multi-runtime development servers with integrated signal traps.

---

## ⚡ Quickstart

Run directly from any empty project directory without cloning or installing globally:

```bash
# Web Client (Vite + React-TS + Tailwind v4) + FastAPI (Async SQLAlchemy)
npx github:Sandee004/pro-setup
```

### Modular Flags

```bash
# With production-ready Auth (Argon2id + JWT + Pydantic + User Model)
npx github:Sandee004/pro-setup -auth

# Mobile Target (Expo React Native) instead of Vite Web
npx github:Sandee004/pro-setup -app

# Full Mobile + Auth Stack
npx github:Sandee004/pro-setup -app -auth
```

> **Requirements:** Node.js 18+, Python 3.10+, and npm.

---

## 🎯 Architectural Overview

Standard development setup requires tedious, error-prone manual labor: creating isolated virtual environments, aligning asynchronous database drivers, handling CORS policies, structuring modular routers, setting up modern bundlers, and juggling multiple terminal panes.

`pro-setup` automates these pain points into an end-to-end atomic process:

```
                          ┌───────────────────────────┐
                          │   pro-setup CLI Engine    │
                          └─────────────┬─────────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
┌─────────────────────────┐                               ┌─────────────────────────┐
│     Backend Engine      │                               │      Client Runtime     │
├─────────────────────────┤                               ├─────────────────────────┤
│ • Python .venv Sandbox  │                               │ [Default: Web Client]   │
│ • FastAPI Async Engine  │                               │ • Vite + React + TS     │
│ • SQLAlchemy 2.0 Async  │                               │ • Tailwind CSS v4 Engine│
│ • aiosqlite Integration │                               │ • Lucide Icons + Router │
│ • Auto Schema Migrations│                               ├─────────────────────────┤
│ • (Optional) Argon2/JWT │                               │ [-app: Mobile Client]   │
└────────────┬────────────┘                               │ • Expo Managed Workflow │
             │                                            │ • Native TypeScript     │
             │                                            │ • Cross-Platform Mobile │
             │                                            └────────────┬────────────┘
             │                                                         │
             └──────────────────────────┬──────────────────────────────┘
                                        ▼
                        ┌──────────────────────────────┐
                        │ Concurrent Server Execution  │
                        ├──────────────────────────────┤
                        │ • Uvicorn (Port 8000)        │
                        │ • Vite (5173) or Metro (8081)│
                        │ • Unified SIGINT/SIGTERM     │
                        └──────────────────────────────┘
```

---

## 🌟 Key Features & Engineering Decisions

### 1. Cross-Runtime Environment Orchestration

- **Dual Runtime Management:** Orchestrates Node.js/npm and Python `venv` lifecycles simultaneously. Detects host architecture (macOS, Linux, Windows) to dynamically resolve binary execution paths (`Scripts/python.exe` vs. `bin/python`).
- **Environment Inheritance:** Configures subprocesses to inherit unified system environment variables, bypassing shell isolation boundaries and cross-platform path mismatches.

### 2. High-Performance Asynchronous Python Backend

- **SQLAlchemy 2.0 + `aiosqlite`:** Avoids blocking thread pools by configuring native asynchronous connections for local SQLite databases.
- **Async Thread Safety:** Injects appropriate thread boundary configurations (`check_same_thread=False`) to guarantee stability during concurrent asynchronous API calls.
- **Automated Lifecycle Migration:** Utilizes FastAPI's `lifespan` context manager to automatically provision database schemas on startup without requiring manual migration commands.

### 3. Client Adaptability (Web & Mobile)

- **Vite Web Client (Default):** Generates a React 18 TypeScript application wired with the latest Tailwind CSS v4 engine (via `@tailwindcss/vite` without legacy PostCSS overhead) and Lucide icons.
- **Expo Mobile Client (`-app`):** Generates a clean Expo Managed React Native application with TypeScript and native icon bridges ready for Android/iOS emulation.

### 4. Optional Production-Grade Authentication Layer (`-auth`)

Passing `-auth` injects a full security baseline without third-party boilerplate:

- **Argon2id Password Hashing:** Uses `argon2-cffi` for memory-hard, brute-force resistant password security.
- **Stateless JWT Tokens:** Encodes standard HS256 authentication payloads with configurable expiration and secret injection.
- **Strict Pydantic Validation:** Type validation on incoming auth payloads (`UserCreate`, `UserLogin`) with automated email format checks via `EmailStr`.
- **Dependency Injection Guard:** Includes reusable `get_current_user` FastAPI security dependencies protecting authenticated profile routes.

### 5. Unified Lifecycle Process Management

- Eliminates manual terminal switching. Upon completing scaffolding, `pro-setup` spawns both dev servers concurrently and streams stdout/stderr directly.
- Listens for process signals (`SIGINT`, `SIGTERM`) to trigger clean tree termination, preventing orphan zombie processes from binding to ports `8000` or `5173`.

---

## 📂 Generated Workspace Topology

### Web Scaffold (Default)

```text
my-project/
├── .gitignore
├── .vscode/
│   └── settings.json          # Injects backend resolution path for Pyright/Pylance
├── .venv/                     # Isolated Python virtual environment
├── backend/
│   ├── config.py              # Environment configuration & SPA watcher
│   ├── database.py            # Async engine & sessionmaker
│   ├── main.py                # FastAPI app initialization, CORS, Static routes
│   ├── models.py              # SQLAlchemy database tables
│   ├── requirements.txt       # Frozen Python dependencies
│   ├── schemas.py             # Pydantic validation schemas
│   ├── utils.py               # (Optional: -auth) Argon2 hashing & JWT decode
│   └── routers/
│       └── auth.py            # (Optional: -auth) Signup, Login, Profile endpoints
└── frontend/
    ├── src/
    │   ├── App.tsx            # Pre-configured status card checking backend health
    │   ├── index.css          # Tailwind CSS v4 setup
    │   └── main.tsx
    ├── vite.config.ts         # Vite bundler with Tailwind plugin
    ├── package.json
    └── tsconfig.json
```

### Mobile Scaffold (`-app`)

```text
my-project/
├── backend/                   # FastAPI backend architecture (same as above)
└── mobile/
    ├── App.tsx                # Native mobile status card with API health polling
    ├── app.json               # Expo configuration
    ├── package.json           # React Native & Lucide dependencies
    └── tsconfig.json
```

---

## 🛠️ CLI Reference

| Flag      | Parameter | Description                                                                      |
| :-------- | :-------- | :------------------------------------------------------------------------------- |
| `default` | _(none)_  | Scaffolds FastAPI backend + React Vite frontend with Tailwind v4. Launches both. |
| `-auth`   | `--auth`  | Injects Argon2id, PyJWT, User models, Auth schemas, utils, and `/auth` routes.   |
| `-app`    | `--app`   | Swaps Vite web frontend for an Expo React Native mobile project in `mobile/`.    |

---

## 💻 Local Development & Extension

If you want to clone this repository and customize the templates for your personal stack:

```bash
# 1. Clone repository
git clone https://github.com/Sandee004/pro-setup.git
cd pro-setup

# 2. Register binary locally
npm link

# 3. Test your modified setup anywhere on your machine
mkdir ~/test-scaffold && cd ~/test-scaffold
pro-setup -auth
```

### Customizing Templates

Templates are cleanly separated from process execution:

- `templates.js`: Contains all file contents, source code templates, and configuration objects.
- `index.js`: Contains CLI flag parsing, directory generation, dependency installation, and server spawn orchestration.

---

## 📜 License

This project is open-source and available under the [MIT License](LICENSE).

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776ab?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18+-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Expo](https://img.shields.io/badge/Expo-SDK--51+-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
