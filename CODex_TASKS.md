Codex: You are upgrading GNOMAN 2.0 into a fully self-sufficient, multi-platform application.

Your tasks:

────────────────────────────────────────
1) CORE ARCHITECTURE
────────────────────────────────────────
Convert GNOMAN 2.0 into a modular, self-contained system with:

- A unified backend service (Node.js, Python, or Rust — use existing project language)
- A cross-platform UI layer
- A shared API layer for all platforms
- A plugin system for future extensions

Ensure the backend can run:
- As a local service
- As a remote server
- As a bundled embedded service inside desktop/mobile apps

────────────────────────────────────────
2) CROSS-PLATFORM BUILD TARGETS
────────────────────────────────────────
Add build support for:

✔ Windows (x64 + ARM64)
✔ Linux (x64 + ARM64)
✔ macOS (Intel + Apple Silicon)
✔ Android (APK)
✔ iOS (IPA) — MOST IMPORTANT

Use the following technologies:

Desktop:
  - Electron OR Tauri (prefer Tauri for smaller footprint)
Mobile:
  - React Native OR Flutter (choose whichever integrates best with existing code)
Backend:
  - Package backend as a standalone binary AND as a library callable from mobile/desktop.

────────────────────────────────────────
3) SELF-SUFFICIENCY REQUIREMENTS
────────────────────────────────────────
GNOMAN 2.0 must run with:

- No external dependencies except:
    - Configured APIs (Etherscan, Chainlink, Tenderly, etc.)
- Local database (SQLite recommended)
- Local caching layer
- Built-in update checker
- Built-in logging + diagnostics
- Built-in configuration UI

Add:
- Auto-migration for DB schema
- Auto-recovery if config is missing or corrupted

────────────────────────────────────────
4) SERVER MODE
────────────────────────────────────────
Add a “server mode” where GNOMAN 2.0 can run as:

- A headless daemon
- A system service (systemd, Windows service, macOS launchd)
- A remote API endpoint

Expose:
- REST API
- WebSocket events
- Authentication (token-based)

────────────────────────────────────────
5) MOBILE (iOS PRIORITY)
────────────────────────────────────────
For iOS:

- Use React Native or Flutter with a native bridge to the backend library.
- Backend must compile to iOS ARM64.
- Provide a local HTTP or direct native bridge for API calls.
- Ensure sandbox-safe storage for config + DB.
- Add offline mode.
- Add background task support where allowed by iOS.

For Android:
- Mirror the iOS architecture.
- Use the same shared backend library.

────────────────────────────────────────
6) INSTALLERS + PACKAGING
────────────────────────────────────────
Generate installers for:

Windows:
  - MSI or EXE installer
Linux:
  - .deb, .rpm, AppImage
macOS:
  - .dmg or .pkg
Android:
  - .apk
iOS:
  - Xcode project + build scripts for IPA generation

────────────────────────────────────────
7) CONFIG + ENV
────────────────────────────────────────
Wire in all existing .env keys and ensure:

- Desktop apps read from local config file
- Mobile apps use secure storage
- Server mode uses environment variables

────────────────────────────────────────
8) VALIDATION
────────────────────────────────────────
After implementing:

- Confirm all platforms build successfully
- Confirm backend runs identically on all platforms
- Confirm mobile apps can call the backend
- Confirm server mode works remotely
- Confirm no breaking changes to existing features

Do NOT redesign existing logic.
Extend GNOMAN 2.0 to be fully self-sufficient and multi-platform.
