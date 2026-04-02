# Timeline Kiosk Application Architecture

This document serves as a comprehensive guide to understanding the entire Raspberry Pi Timeline application. It details how the disparate technologies (React, Rust, SQLite, Axum, Tauri, and Vite) all work together to deliver a self-contained, fully offline Kiosk experience.

---

## 1. High-Level Overview

At its core, this project is a **Tauri Desktop Application** that behaves like two completely different softwares stitched together:
1. **The Display Interface**: A visual screen built in React that runs like a normal desktop app (compiled natively via Tauri) directly on the Raspberry Pi display.
2. **The Hidden Kiosk Server**: A HTTP Web Server built in Rust that launches silently in the background on port `8080`, answering incoming requests from laptops and phones connected to your home Wi-Fi.

Both of these systems share a single brain: a local **SQLite Database File** (`timeline.db`). 

> [!TIP]
> This architecture completely eliminates the need for cloud database subscriptions (like Supabase or Firebase) while providing the same user experience of uploading memories from your personal phone or laptop securely.

---

## 2. Breaking Down the System Workflow

### The Database: `timeline.db`
When you boot up this application, the Rust backend immediately creates a tiny database file directly next to the running executable called `timeline.db`. It sets up an `events` table with robust columns (`id`, `event_date`, `title`, `description`, `image_url`). This file is the permanent memory of the digital photo frame.

### The Display Interface (React + Vite + Tauri Frontend)
Your codebase in the `src/` directory represents the visual frontend.
- When Tauri boots up, it compiles this React code using **Vite** into static HTML and JavaScript. 
- Tauri then injects these static files into a native, high-performance webview window (essentially a minimalist Chrome browser stripped of borders and URLs).
- **Auto-Polling:** Inside `src/routes/index.tsx`, the interface is instructed to use `setInterval` to "poll" the Rust backend every 5 seconds. It safely executes a Tauri command called `invoke("get_events")` asking: *"Hey Rust, are there any new memories in the SQLite database?"*
- If yes, the `TimelineItem` components cascade down the screen to render the chronological history.

### The Uploader Interface (Rust + Axum + HTML Server)
Your codebase in the `src-tauri/` directory represents the hidden backend.
- We imported an incredibly fast web framework called **Axum**. When Tauri launches the desktop display window, we force Axum to simultaneously launch onto your Raspberry Pi's `8080` port.
- This web server has two endpoints:
  - `GET /` -> When your phone connects to the Raspberry Pi over Wi-Fi (`http://192.168.1.X:8080`), Axum serves the Tailwind-styled `src-tauri/src/uploader.html` file right to your browser screen.
  - `POST /api/events` -> When you hit "Send to Display!" on that HTML form, the form shoots a JSON payload to this endpoint. Axum intercepts it, opens up the `timeline.db` SQLite file securely, and inserts the data forever.

Because the React app is actively polling that same database every 5 seconds, it visually updates almost instantly!

---

## 3. Directory and File Breakdown

Here is exactly what every critical file does in this system:

### Core Configuration Files
*   **`package.json`**: Tracks the JavaScript dependencies for the React frontend (like `@tanstack/react-router`).
*   **`src-tauri/Cargo.toml`**: Tracks the Rust dependencies for the backend (like `rusqlite` for the database and `axum` for the local Web Server).
*   **`src-tauri/tauri.conf.json`**: The orchestrator. It tells Tauri where your Vite build is located, what your application icon is, and configuration details for compilation.

### Frontend Files (The Display Window)
*   **`src/routes/index.tsx`**: The main hub of the visual display. This fetches the `TimelineEvent` records via Tauri IPC and renders them down the screen.
*   **`src/components/TimelineItem.tsx`**: The reusable React component that dictates exactly how a single historical memory looks (font sizes, image rendering, margins, layout).

### Backend Files (The Rust Kiosk Server)
*   **`src-tauri/src/lib.rs`**: The backbone of the entire application. It contains the Rust instructions to:
    1. Hook into the `timeline.db` file.
    2. Define Tauri commands (`get_events`) so the React display interface can securely query information.
    3. Initialize the Axum web server on a background asynchronous `Tokio` thread, allowing it to process HTTP requests simultaneously completely insulated from the desktop interface thread.
*   **`src-tauri/src/uploader.html`**: The entire frontend of your Uploader Web Portal. I bundled it straight into the Rust code via `include_str!()` so it compiles securely into the binary executable. Nothing floating around!

---

## 4. The `Arc<Mutex<Connection>>` Magic

> [!WARNING]
> This is arguably the most critically important design pattern in the application.

SQLite databases are strictly single-file architectures. If two different programs try to write to a SQLite file at the exact same millisecond, the entire database crashes and corrupts.

Because we have **two** things running simultaneously (The React UI polling data via Tauri, and the Axum Server accepting new inputs via your phone), they could easily crash into each other.

In `src-tauri/src/lib.rs`, the SQLite connection object is wrapped in an `Arc<Mutex<Connection>>`.
1. **`Mutex` (Mutual Exclusion):** This serves as a lock on a door. Whether Tauri tries to fetch events, or Axum tries to write an event, they must "lock" the Mutex. The other system physically has to wait in line until the transaction is safe and 100% complete.
2. **`Arc` (Atomic Reference Count):** This allows us to give one master key to the Tauri Display state, and one master key to the Axum Server thread, allowing them to both own the Mutex securely.

---

## 5. Deployment: GitHub Actions CI/CD

### The Problem This Solves

The Raspberry Pi uses a fundamentally different CPU architecture than a Mac (`ARM64 Linux` vs `x86_64 macOS`). You cannot compile the Tauri app on your Mac and drag it onto the Pi — the binaries are completely incompatible. 

The old approach would be to install Rust, Node.js, and all build tools directly on the Pi and compile everything there. While that works, it takes 20-30 minutes of compilation time on the Pi's slower hardware, and needs to be repeated every time you update the app.

Instead, we use **GitHub Actions** to cross-compile the app for the Pi in the cloud — the Pi only ever needs to download and install a ready-made `.deb` file.

---

### How It Works: `.github/workflows/build-pi.yml`

This YAML file is a set of instructions that GitHub's cloud computers follow automatically whenever you trigger a new release. Here is what each step does:

1. **Checkout code** — Downloads the latest version of your repository onto the cloud server.
2. **Install Linux system dependencies** — Installs the native Linux libraries (like `libwebkit2gtk`) that Tauri needs to render its window on Linux. It also installs `gcc-aarch64-linux-gnu`, a special compiler that can produce ARM64 code while running on an x86 server.
3. **Install Rust** — Installs the Rust compiler and adds the `aarch64-unknown-linux-gnu` compilation target, which tells Rust to produce ARM64 Linux binaries.
4. **Cache dependencies** — Saves previously compiled Rust and npm packages to make future builds significantly faster (typically cuts build time from 15 minutes down to 3-5 minutes after the first run).
5. **Install Node.js + pnpm** — Installs the JavaScript tools needed to compile the React frontend.
6. **Install JS dependencies** — Runs `pnpm install` to fetch all frontend packages.
7. **Build with `tauri-action`** — Tauri's official GitHub Action compiles both the React frontend (via Vite) and the Rust backend (cross-compiled for ARM64). It then bundles them into a `.deb` installer file and attaches it to a new GitHub Release automatically.

> [!NOTE]
> The `CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER` environment variable is the critical piece that makes cross-compilation work. It tells the Rust linker to use the ARM64 cross-compiler (`aarch64-linux-gnu-gcc`) instead of the default x86 linker. Without this, the build would produce a binary that runs on the cloud server but crashes on the Pi.

---

### Triggering a New Release

The workflow fires on **two conditions**:

1. **A version tag push** — The primary trigger. When you push a tag starting with `v` (like `v1.0`, `v1.1`, `v2.0`), the workflow starts automatically.
2. **Manual dispatch** — You can also click "Run workflow" from the **Actions** tab in your GitHub repository at any time without making a new commit.

**Workflow for releasing a new version of the app from your Mac:**

```bash
# 1. Commit all your changes
git add .
git commit -m "Add new memories feature"

# 2. Create a version tag
git tag v1.0

# 3. Push both the code and the tag
git push && git push --tags
```

After ~10-15 minutes, a new entry will appear on your GitHub repository's **"Releases"** page (the bookmark icon on the right sidebar) with the `.deb` file attached.

---

### Installing on the Raspberry Pi

Once a release exists on GitHub, the Pi only needs two commands — **ever**. No Rust, no Node.js, no building anything locally.

```bash
# 1. Download the installer from your GitHub Releases page
#    (replace the URL with the actual link from the Releases page)
wget https://github.com/YOUR_USERNAME/TestingTauri/releases/download/v1.0/timeline-app_0.1.0_arm64.deb

# 2. Install it like any standard Linux application
sudo dpkg -i timeline-app_0.1.0_arm64.deb
```

To **launch** the kiosk display:
```bash
timeline-app
```

To **update** to a newer version in the future, simply `wget` the new `.deb` file and run `dpkg -i` again — it automatically overwrites the old installation. The `timeline.db` database file (stored safely in `~/.local/share/timeline-app/`) is never touched during an update, so all your memories are preserved.

---

### Summary: Full Development Cycle

```
Edit code on Mac
      │
      ▼
git push && git push --tags
      │
      ▼
GitHub Actions cloud server builds ARM64 .deb (~10-15 min)
      │
      ▼
.deb file appears on GitHub Releases page
      │
      ▼
Pi: wget + dpkg -i   (30 seconds)
      │
      ▼
timeline-app is live on the Pi display
```
