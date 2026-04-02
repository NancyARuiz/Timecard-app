# Tauri Timeline Kiosk — Complete Codebase Explainer

A deep-dive guide for understanding every key file in this project, written for someone new to both Tauri and React.

---

## The Big Picture

This app is **two programs in one binary**:

| Program | Technology | Purpose |
|---|---|---|
| **Kiosk Display** | React + Vite (rendered by Tauri) | The screen on the Raspberry Pi |
| **Upload Server** | Rust + Axum (HTTP on port 8080) | Lets phones/laptops submit memories over Wi-Fi |

Both share a single **SQLite database file** (`timeline.db`) as their common memory.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Tauri Application Process                    │
│                                                                 │
│  ┌──────────────────────┐       ┌──────────────────────────┐   │
│  │  React Kiosk Display  │       │   Axum HTTP Server       │   │
│  │  (Tauri webview)      │       │   port 8080              │   │
│  │                       │       │                          │   │
│  │  invoke("get_events") │       │  POST /api/events        │   │
│  └──────────┬────────────┘       └───────────┬──────────────┘   │
│             │                               │                   │
│             └───────────┬───────────────────┘                   │
│                         ▼                                       │
│                 Arc<Mutex<SQLite>>                               │
│                    timeline.db                                  │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │  HTTP fetch to /api/events
         │
   Phone / Laptop Browser
```

---

## Directory Map

```
TestingTauri/
│
├── src/                        ← React Frontend (the kiosk display)
│   ├── routes/
│   │   ├── __root.tsx          ← TanStack Router: HTML shell, global CSS
│   │   └── index.tsx           ← The main page component (the timeline)
│   ├── components/
│   │   ├── TimelineItem.tsx    ← Renders one event card on the timeline
│   │   ├── AddEventForm.tsx    ← Form to add events via Tauri IPC
│   │   ├── RoundedButton.tsx   ← Reusable button component
│   │   └── RoundedButton.test.tsx ← Vitest unit test
│   ├── router.tsx              ← Creates the TanStack Router instance
│   ├── routeTree.gen.ts        ← Auto-generated route registry (don't edit)
│   └── styles.css              ← Global stylesheet
│
├── src-tauri/                  ← Rust Backend
│   ├── src/
│   │   ├── main.rs             ← Binary entry point (just calls lib.rs::run)
│   │   ├── lib.rs              ← All Rust logic: SQLite, Tauri commands, Axum
│   │   └── uploader.html       ← The phone-facing upload page (baked into binary)
│   ├── Cargo.toml              ← Rust dependency manifest
│   ├── tauri.conf.json         ← Tauri configuration (window, build, icons)
│   └── build.rs                ← Build-time Tauri codegen hook
│
├── vite.config.ts              ← Vite + TanStack Start build configuration
├── package.json                ← JS dependency manifest
└── .github/workflows/
    └── build-pi.yml            ← CI/CD for cross-compiling to ARM64 Raspberry Pi
```

---

## The Rust Side — `src-tauri/`

### `src-tauri/src/main.rs` — The True Entry Point

```rust
fn main() {
    timeline_app_lib::run()
}
```

This is the binary's entry point — the first function that runs when you launch the app. It does **nothing** except call `run()` from `lib.rs`. This pattern (separating the binary entry from the library logic) is a Tauri/Rust convention that makes cross-platform compilation and testing easier.

The `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` line at the top tells the Windows linker *"don't open a terminal console window in release mode"* — you'll see the GUI only.

---

### `src-tauri/src/lib.rs` — The Backbone of Everything

This is the most important file. It does 4 things:

#### 1. Define the data shape (structs)

```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TimelineEvent {
    id: i64,
    event_date: String,
    title: String,
    description: String,
    image_url: String,
}
```

This is the shared data structure that represents one event row from the database. The `#[derive(Serialize, Deserialize)]` annotations (from the `serde` library) are the magic that lets this struct be automatically converted to/from JSON — so Tauri can send it to React as a JavaScript object, and Axum can accept it as a JSON POST body.

#### 2. Define a Tauri Command — `get_events`

```rust
#[tauri::command]
fn get_events(state: State<AppState>) -> Result<Vec<TimelineEvent>, String> {
    let db = state.db.lock()...
    // runs SQL, returns Vec<TimelineEvent>
}
```

`#[tauri::command]` is a Rust macro (code that writes code). It transforms this function into something React can call via `invoke("get_events")`. Think of it as defining an **RPC endpoint** — but instead of HTTP, it crosses the boundary between the JavaScript webview and the native Rust process using Tauri's secure IPC (inter-process communication) bridge.

#### 3. Define Axum HTTP handlers

There are two Axum handlers:
- `api_get_events` → responds to `GET /api/events` — queries SQLite and returns JSON
- `api_add_event` → responds to `POST /api/events` — inserts a new event from JSON body

These are for requests coming from **phones/laptops over Wi-Fi** on port 8080. They are completely separate from the Tauri IPC channel.

```rust
async fn api_add_event(
    AxumState(db): AxumState<Arc<Mutex<Connection>>>,  // receives db handle
    Json(payload): Json<AddEventRequest>,              // auto-parses JSON body
) -> Result<Json<i64>, String> {
    // inserts into SQLite
}
```

#### 4. The `run()` function — Startup orchestration

```rust
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 1. Find/create the OS app data dir
            // 2. Open (or create) timeline.db
            // 3. CREATE TABLE IF NOT EXISTS events (...)
            // 4. Wrap connection in Arc<Mutex<>>
            // 5. Give Tauri state one clone of Arc
            // 6. Spawn Axum server on another async thread with another clone of Arc

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_events])  // register Tauri commands
        .run(tauri::generate_context!())                       // reads tauri.conf.json
}
```

---

### The `Arc<Mutex<Connection>>` Pattern (Critical!)

SQLite can only be safely written to by one thread at a time. Your app has **two** concurrent writers — the Tauri IPC handler and the Axum HTTP handler.

- **`Mutex`** = a lock. Before either side can touch the database, they must "lock" it. If the other side already has the lock, they wait. This prevents data corruption.
- **`Arc`** = "Atomic Reference Counter." This is how you safely share ownership of one object across multiple threads. Each clone of the `Arc` points to the same `Mutex<Connection>` underneath.

```
Arc (clone 1) → Mutex<Connection> ← Arc (clone 2)
     ↑                                     ↑
Tauri AppState                        Axum Router State
```

They both point to **the same single database connection**. The `Mutex` ensures only one can use it at a time.

---

### `src-tauri/src/uploader.html` — The Phone Upload Page

This is a plain HTML file baked directly into the Rust binary at compile time using:

```rust
async fn serve_uploader() -> Html<&'static str> {
    Html(include_str!("uploader.html"))
}
```

`include_str!()` is a Rust macro that reads the file contents at **compile time** and embeds the string directly into the binary. So the HTML page is literally part of the `.deb` package — no server-side file system read needed at runtime.

When a phone visits `http://192.168.1.X:8080`, Axum calls `serve_uploader()` and returns this HTML directly. The page uses vanilla JavaScript with `fetch('/api/events', { method: 'POST', ... })` to submit data.

---

### `src-tauri/Cargo.toml` — Rust Dependencies

| Crate | What it does |
|---|---|
| `tauri = "2"` | The core framework — window management, IPC, OS integration |
| `rusqlite` (bundled) | SQLite driver; `bundled` compiles SQLite from source so there's no system dependency |
| `axum` | Fast async HTTP web framework (like Express.js, but in Rust) |
| `tokio` (rt-multi-thread) | The async runtime that powers Axum — like Node.js's event loop |
| `serde` + `serde_json` | Serialize/deserialize Rust structs to/from JSON |
| `tower-http` (cors) | Middleware; CORS lets browsers from other origins make requests |
| `tauri-plugin-opener` | A Tauri plugin for opening files/URLs |

---

### `src-tauri/tauri.conf.json` — The Orchestrator

```json
{
  "build": {
    "beforeDevCommand": "pnpm dev:vite",   // starts Vite dev server BEFORE Tauri opens its window
    "devUrl": "http://localhost:3000",     // Tauri loads this URL in dev mode (from Vite)
    "beforeBuildCommand": "pnpm build:vite", // compiles React BEFORE Rust build
    "frontendDist": "../.output/public"   // where the compiled frontend lives (Tauri bundles this)
  },
  "app": {
    "windows": [{ "title": "Timeline Kiosk", "width": 800, "height": 600 }],
    "security": { "csp": null }           // Content Security Policy disabled for simplicity
  }
}
```

This file is Tauri's brain. It tells Tauri:
1. Run `pnpm dev:vite` first to get a dev server, then point the native window at it
2. In production, compile the frontend and bundle it inside the binary
3. The app window is 800×600, titled "Timeline Kiosk"

---

### `src-tauri/build.rs` — Tauri Build Codegen

```rust
fn main() {
    tauri_build::build()
}
```

This runs at **compile time** (before your app code compiles). `tauri_build::build()` does things like reading `tauri.conf.json` and generating internal Rust code that `tauri::generate_context!()` (in `lib.rs`) relies on. You never need to modify this file — it's boilerplate.

---

## The React Side — `src/`

### `src/routes/__root.tsx` — The HTML Shell

This is TanStack Router's **root layout**. Think of it as the outermost wrapper that every page in the app lives inside.

```tsx
export const RootComponent: React.FC = () => {
    return (
        <html lang="en">
            <head>
                <HeadContent />   {/* injects meta tags, CSS links */}
            </head>
            <body className="antialiased">
                <Outlet />        {/* renders the current page here */}
                <Scripts />       {/* injects JS bundles */}
            </body>
        </html>
    );
};

export const Route = createRootRoute({
    head: () => ({
        meta: [...],       // sets <meta charset>, <meta viewport>, <title>
        links: [{ rel: "stylesheet", href: appCss }],  // loads styles.css
    }),
    component: RootComponent,
});
```

- **`<Outlet />`** is the TanStack Router placeholder where child routes (like `index.tsx`) render
- **`<HeadContent />`** and **`<Scripts />`** are TanStack Start components that inject the right `<meta>` and `<script>` tags
- `createRootRoute` registers this as the root in TanStack Router's hierarchy

---

### `src/routes/index.tsx` — The Main Timeline Page

This is the page you see when the app opens (the `/` route).

```tsx
const [events, setEvents] = useState<TimelineEvent[]>([]);
const [loading, setLoading] = useState(true);

const fetchEvents = useCallback(async () => {
    const data = await invoke<TimelineEvent[]>("get_events");
    //           ^^^^^^ Tauri IPC - crosses from JS into Rust
    setEvents(data);
}, []);

useEffect(() => {
    void fetchEvents();                    // fetch immediately on mount
    const interval = setInterval(() => {
        void fetchEvents();
    }, 5000);                             // then every 5 seconds
    return () => clearInterval(interval); // cleanup when component unmounts
}, [fetchEvents]);
```

**`invoke("get_events")`** is the key line. This is the **Tauri IPC bridge**:
1. JavaScript calls `invoke("get_events")`
2. Tauri's IPC serializes the request and sends it to the Rust process
3. Rust's `get_events` function executes, queries SQLite, returns `Vec<TimelineEvent>`
4. Tauri serializes the result back to JSON and resolves the JavaScript Promise
5. React state updates, the component re-renders with the new events

The `setInterval` every 5 seconds means if someone submits a memory via the Axum web server (their phone), the React display will pick it up within 5 seconds automatically — without any WebSockets or push notifications.

---

### `src/components/TimelineItem.tsx` — The Event Card

This is a **pure presentational component** — it receives props and renders HTML. No state, no side effects.

```tsx
export interface TimelineEvent {
    id: number;
    event_date: string;
    title: string;
    description: string;
    image_url: string;
}

export function TimelineItem({ event, isLeft }: TimelineItemProps) {
    // renders one card on the left or right side of the timeline
    // isLeft alternates per event to create the zigzag layout
}
```

The `isLeft` prop comes from `index.tsx`:
```tsx
<TimelineItem key={event.id} event={event} isLeft={index % 2 === 0} />
```
Even indexes go left, odd indexes go right → creating the alternating visual timeline.

---

### `src/components/AddEventForm.tsx` — In-App Add Form

This component lets you add events **directly from the Tauri window** (as opposed to the phone-facing uploader). It also uses `invoke`:

```tsx
await invoke("add_event", {
    eventDate: date,
    title,
    description,
    imageUrl,
});
```

> [!NOTE]
> `add_event` is referenced here but looking at `lib.rs`, only `get_events` is registered with `tauri::generate_handler!`. This form would need `add_event` to be implemented and registered in `lib.rs` as a `#[tauri::command]` to work. It's likely a UI scaffold for a future feature.

---

### `src/components/RoundedButton.tsx` — Reusable Button

A minimal reusable component demonstrating the **Props** pattern in React:

```tsx
interface RoundedButtonProps {
    onClick: () => void;  // the parent passes a function
    title: string;        // the parent passes the label
}

export const RoundedButton: React.FC<RoundedButtonProps> = ({ onClick, title }) => {
    return <button onClick={onClick}>{title}</button>;
};
```

The parent "controls" this component entirely through props — the button itself doesn't know or care what it does when clicked.

---

### `src/components/RoundedButton.test.tsx` — Unit Test

```tsx
import { render, fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";

it("calls onClick when clicked", () => {
    const handleClick = vi.fn();          // creates a mock/spy function
    render(<RoundedButton onClick={handleClick} title="Click me" />);
    fireEvent.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
});
```

- **Vitest** is the test runner (similar to Jest but faster, Vite-native)
- **Testing Library** renders components in a simulated DOM and lets you query by accessible role
- `vi.fn()` creates a mock function so you can assert it was called

Run tests with: `pnpm test`

---

## TanStack's Role

**TanStack** is a suite of libraries. This app uses two of them:

### TanStack Router (`@tanstack/react-router`)

A **file-based router** for React, similar in concept to Next.js pages but framework-agnostic. Here's how it works in this app:

| File | What TanStack Router does with it |
|---|---|
| `src/routes/__root.tsx` | The HTML shell — wraps all pages |
| `src/routes/index.tsx` | Registered as the `/` route |
| `src/routeTree.gen.ts` | **Auto-generated** — wires everything together |
| `src/router.tsx` | Creates the router instance from the generated tree |

The Vite plugin (`@tanstack/router-plugin`) watches your `routes/` folder. Every time you add a new file like `src/routes/about.tsx`, it automatically regenerates `routeTree.gen.ts` to include the new route. You never need to manually register routes.

```
routes/__root.tsx  ─── is parent of ───  routes/index.tsx
       │                                        │
  createRootRoute()                      createFileRoute("/")
       │                                        │
       └─────────── routeTree.gen.ts ───────────┘
                           │
                     router.tsx
                    createRouter({ routeTree })
```

### TanStack Start (`@tanstack/react-start`)

This is a **full-stack React meta-framework** (think: TanStack's version of Next.js). In this project, it's used primarily for its:
- **SPA + prerendering** build mode (configured in `vite.config.ts`)
- **`<HeadContent />`** and **`<Scripts />`** components in `__root.tsx`
- Server-side rendering capabilities (though in Tauri mode, it runs as a static SPA)

The Vite config uses `tanstackStart()` plugin in **SPA mode** — this pre-renders `index.html` at build time so Tauri can load it as a static file without a Node.js server.

---

## Build Tooling

### `vite.config.ts` — The Build Pipeline

Vite is the JavaScript bundler and dev server. This config wires together many plugins:

| Plugin | Purpose |
|---|---|
| `tanstackStart()` | Enables TanStack Start's routing and prerendering |
| `tailwindcss()` | Processes Tailwind utility classes at build time |
| `viteReact()` | Transforms JSX/TSX → JavaScript |
| `viteTsConfigPaths()` | Enables TypeScript path aliases (`~/components/...`) |
| `devtools()` | TanStack dev tools panel in the browser |
| `nitro()` | Server adapter (used with TanStack Start for SSR) |

The Tauri-specific config:
```ts
server: {
    port: 3000,
    strictPort: true,     // fail if 3000 is taken (Tauri requires a fixed port)
    host: host || false,  // TAURI_DEV_HOST env var enables remote dev (e.g., device testing)
    watch: {
        ignored: ["**/src-tauri/**"],  // Vite won't watch Rust files (Cargo handles that)
    },
},
```

### `package.json` — The Command Center

```json
"scripts": {
    "dev": "tauri dev",         // starts BOTH Vite dev server AND Tauri window
    "build": "tauri build",     // compiles React + Rust into a distributable
    "dev:vite": "vite dev",     // starts ONLY the Vite dev server (tauri.conf calls this)
    "test": "vitest run",       // run unit tests once
    "lint": "biome check",      // lint + format check
    "fix": "biome check --write" // auto-fix lint issues
}
```

When you run `pnpm dev`:
1. Tauri CLI reads `tauri.conf.json`
2. It runs `beforeDevCommand: "pnpm dev:vite"` → Vite starts on port 3000
3. Tauri compiles the Rust code
4. Tauri opens a native window pointed at `http://localhost:3000`
5. Hot-reload works — change a `.tsx` file, React updates instantly in the native window

---

## How It All Fits Together — Data Flow

### Viewing events (Display → Rust → SQLite):

```
React useEffect fires every 5s
    → invoke("get_events")             [JavaScript → Tauri IPC]
        → get_events() in lib.rs       [Rust acquires Mutex lock]
            → SELECT * FROM events     [SQLite query]
        ← Vec<TimelineEvent>           [Rust releases lock]
    ← JSON array                       [Tauri IPC → JavaScript]
← setEvents(data)                      [React re-renders]
```

### Uploading a memory (Phone → Axum → SQLite):

```
Phone browser submits form
    → POST http://192.168.1.X:8080/api/events   [HTTP over Wi-Fi]
        → api_add_event() in lib.rs             [Axum handler acquires Mutex lock]
            → INSERT INTO events (...)          [SQLite write]
        ← 200 OK with new row ID               [Axum releases lock]
    ← "Memory successfully added!"             [Phone sees success message]
```

```
(5 seconds later, React polls again)
    → invoke("get_events") → new event appears on the timeline
```

---

## The GitHub Actions CI/CD (`build-pi.yml`)

The Raspberry Pi uses **ARM64** CPU architecture. Your Mac uses **x86_64**. You can't run a Mac binary on the Pi.

The workflow **cross-compiles** for ARM64 on GitHub's x86 cloud servers:

```
Push git tag v1.X
    → GitHub Actions starts
        → Install aarch64-linux-gnu-gcc (ARM64 cross-compiler)
        → Install Rust target: aarch64-unknown-linux-gnu
        → pnpm install → Vite build → React compiled
        → tauri build --target aarch64-unknown-linux-gnu
            → Rust compiled for ARM64 using cross-compiler linker
        → .deb package created
    → Attached to GitHub Release
        
Pi: wget .deb && sudo dpkg -i .deb
    → timeline-app is installed
    → timeline.db lives in ~/.local/share/timeline-app/ (never overwritten on updates)
```

The environment variable `CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc` is the critical piece — it tells Rust's linker to produce ARM64 machine code instead of x86_64.

---

## Key Concepts Summary

| Concept | Where you see it | What it means |
|---|---|---|
| **Tauri IPC** | `invoke("get_events")` in `index.tsx` | JavaScript calling a Rust function securely |
| **`#[tauri::command]`** | `lib.rs` `get_events` fn | Macro that exposes a Rust fn to `invoke()` |
| **`tauri::generate_handler![]`** | `lib.rs` `run()` | Registers which commands are callable |
| **`Arc<Mutex<>>`** | `lib.rs` `AppState` | Thread-safe shared ownership of the DB connection |
| **`include_str!()`** | `serve_uploader()` in `lib.rs` | Embeds a file's content into the binary at compile time |
| **`serde`** | `#[derive(Serialize, Deserialize)]` | Auto-converts Rust structs ↔ JSON |
| **File-based routing** | `routes/index.tsx` | TanStack Router auto-discovers routes from file paths |
| **`<Outlet />`** | `__root.tsx` | Where TanStack Router renders the current page |
| **`routeTree.gen.ts`** | Auto-generated | Never edit this; it's the wiring between routes |
| **Tailwind CSS** | All component files | Utility-first CSS; classes like `text-4xl font-bold` |
| **`useEffect` + `setInterval`** | `index.tsx` | React's polling loop to auto-refresh events |
| **`useState`** | `index.tsx`, `AddEventForm.tsx` | React's mechanism to store and update UI data |
