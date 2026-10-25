# pro-setup

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776ab?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18+-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Expo](https://img.shields.io/badge/Expo-SDK--51+-000020?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**Scaffold and launch a FastAPI + React (or Expo) full-stack project with a single command.**

`pro-setup` creates an isolated Python virtual environment, an async FastAPI backend on SQLAlchemy 2.0 and `aiosqlite`, and a Vite + React + TypeScript + Tailwind v4 client, or an Expo React Native app with `-app`. Add `-auth` for Argon2id password hashing, JWT sessions and a protected profile route. When scaffolding finishes, it starts both dev servers together and shuts them down cleanly on exit.

---

## ⚡ Quickstart

Run it from any empty project directory. There is nothing to clone or install globally.

```bash
# Web: Vite + React + TypeScript + Tailwind v4, with a FastAPI (async SQLAlchemy) backend
npx github:Sandee004/pro-setup

# Add authentication (Argon2id + JWT + Pydantic + User model)
npx github:Sandee004/pro-setup -auth

# Mobile: Expo React Native instead of the Vite web client
npx github:Sandee004/pro-setup -app

# Mobile with authentication
npx github:Sandee004/pro-setup -app -auth
```

> **Requirements:** Node.js 20+, Python 3.10+, and npm.

---

## 🎯 Why this exists

The first hour of a full-stack project is the same every time: create a virtual environment, pick an async database driver, set up CORS, split the routers, configure a bundler, wire in Tailwind, and keep two terminals running. `pro-setup` does all of it in one step, so you start on the product instead of the plumbing.

### How it works

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
│ • Auto Schema Creation  │                               ├─────────────────────────┤
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

## 🌟 Key features and engineering decisions

### 1. Cross-platform environment setup

- **Two runtimes, one run:** manages the Node.js and Python lifecycles together. It creates the `.venv`, installs both dependency sets, and resolves the interpreter path for the host OS (`Scripts/python.exe` on Windows, `bin/python` on macOS and Linux).
- **Shared environment:** child processes inherit the parent environment, so installs and servers see the same variables and `PATH` as your shell.

### 2. Async FastAPI backend

- **SQLAlchemy 2.0 with `aiosqlite`:** database calls go through an async driver, so they do not block the event loop.
- **Thread-safe SQLite connections:** `check_same_thread=False` is set on the connection so it works across threads under concurrent requests.
- **Schema creation on startup:** FastAPI's `lifespan` handler creates the tables when the app boots, so there is no setup step before the first request. This is schema creation, not versioned migrations. Add Alembic when you need those.

### 3. Web or mobile client

- **Vite web client (default):** React 18 + TypeScript with Tailwind CSS v4 through `@tailwindcss/vite`, so there is no PostCSS config. Lucide icons and a router are included.
- **Expo mobile client (`-app`):** an Expo managed-workflow React Native app in TypeScript with Lucide icons, ready for the Android and iOS simulators.

### 4. Optional authentication (`-auth`)

- **Argon2id hashing** with `argon2-cffi`, a memory-hard algorithm that resists brute-force attacks.
- **JWT sessions:** signed HS256 tokens with configurable expiry and secret.
- **Pydantic validation:** `UserCreate` and `UserLogin` schemas, with email checks through `EmailStr`.
- **Route protection:** a reusable `get_current_user` dependency guards authenticated routes such as the profile endpoint.
- **Ready to use:** adds a `User` model and `/auth` routes for signup, login and profile.

### 5. One process, clean shutdown

- **Single terminal:** once scaffolding completes, Uvicorn (8000) and Vite (5173) or Metro (8081) start together, and their stdout and stderr stream to the same window.
- **Signal handling:** `SIGINT` and `SIGTERM` terminate the whole process tree, so no orphaned servers are left holding your ports.

---

## 📂 Generated workspace

### Web scaffold (default)

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

### Mobile scaffold (`-app`)

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

## 🛠️ CLI reference

| Flag      | Parameter | Description                                                                      |
| :-------- | :-------- | :------------------------------------------------------------------------------- |
| `default` | _(none)_  | Scaffolds FastAPI backend + React Vite frontend with Tailwind v4. Launches both. |
| `-auth`   | `--auth`  | Adds Argon2id, PyJWT, User models, auth schemas, utils, and `/auth` routes.      |
| `-app`    | `--app`   | Swaps the Vite web frontend for an Expo React Native project in `mobile/`.       |

---

## 💻 Local development and extension

To customize the templates for your own stack:

```bash
# 1. Clone the repository
git clone https://github.com/Sandee004/pro-setup.git
cd pro-setup

# 2. Link the binary locally
npm link

# 3. Try your changes anywhere on your machine
mkdir ~/test-scaffold && cd ~/test-scaffold
pro-setup -auth
```

### Customizing templates

Templates are kept separate from process execution:

- `templates.js`: all file contents, source templates and configuration objects.
- `index.js`: CLI flag parsing, directory generation, dependency installation, and server spawn orchestration.

---

## 📜 License

This project is open-source and available under the [MIT License](LICENSE).
