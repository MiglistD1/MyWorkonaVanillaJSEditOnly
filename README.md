# MyWorkona Dashboard (My Workspace 2.0)

A high-productivity personal dashboard and Chrome Extension designed for workspace management, task tracking with gamification, and deep Google ecosystem integration.

## 🏗️ Architecture & Tech Stack
- **Environment:** Chrome Extension (Manifest V3) + Vanilla JS Dashboard (ES Modules).
- **State Management:** `storage.js` - Hybrid (Chrome Storage + LocalStorage + Firebase Real-time Hook).
- **Rendering Engine:** `contentManager.js` - Dynamic DOM manipulation based on current Space ID.
- **Database/Sync:** Firebase (Firestore, Auth) for multi-device sync; Google Drive for backup; Google Calendar for tasks.
- **Native Messaging:** Python-based bridge for launching Windows applications.

## 📂 File Directory Breakdown

### 🛠️ Core Systems
- `dashboard.html / .js`: The main entry point. Initializes all modules and handles space switching logic.
- `storage.js`: Centralized state. Manages `spaces`, `appSettings`, and device-specific `localSettings`.
- `contentManager.js`: The "Router". Determines whether to render the **Command Center (Space 0)** or a specific **Project Space**.
- `ui-helpers.js`: Shared UI logic: Syntax highlighting for `@reward` and `#tags`, favicon fetching, and complex Task HTML generation.
- `firebaseSync.js`: Manages real-time Firestore synchronization, conflict resolution, and data merging using timestamps.
- `driveSync.js` / `calendarSync.js`: Integration with Google Drive (backup) and Google Calendar (event syncing).

### 📋 Task & Workspace Management
- `todoManager.js`: Core logic for tasks. Handles CRUD, subtasks, recurrence (Daily/Weekly/Monthly), and "Next Up" flagging.
- `masterTodoList.js`: Logic for the **Command Center** view. Aggregates tasks from all active spaces into one view.
- `habitSheet.js`: A specialized habit tracker with streaks, custom reset intervals, and template linking.
- `smartFlow.js`: Advanced workflow engine. Sequence-based tasks with dependencies, built-in Focus Mode, and space-transition popups.
- `customLaunchers.js`: Management of the top-bar shortcuts (Web URLs or Local Apps).

### 🎮 Gamification & Productivity
- `rewardSystem.js`: "Quest Loot System". Scans task text for `@รางวัล` syntax to award virtual "Money", "Time", or "Items" into wallets.
- `focusTimer.js`: Per-space Pomodoro-style timer that can "Lock" the workspace during a session.
- `scheduleMode.js`: Time-based access control for spaces (e.g., only allow access during 09:00 - 17:00).
- `dashboardQuickNote.js`: Global floating/pinned note accessible across all spaces.

### 🎨 Styling (CSS)
- `base.css`: Root variables (Notion-style), dark mode themes, and core UI resets.
- `layout.css`: Sidebar (Spacebar) behavior and main grid structure.
- `components.css`: Styles for common UI elements (pills, cards, buttons, modals).
- `features.css`: Specific styling for Smart Flow, Reward System, and To-Do lists.
- `responsive.css`: Media queries for Mobile/Tablet optimization and the Mobile FAB UI.

### 🔌 Extension & Native Bridge
- `manifest.json`: Extension configuration and permissions.
- `background.js`: Service worker handling extension icon clicks and deep links.
- `rules.json`: Declarative Net Request rules to bypass CSP/X-Frame-Options for Google Keep/Tasks iframes.
- `app_bridge.py / .bat`: Python script and host manifest allowing the web app to trigger local Windows `.exe` files.

## 🔑 Key Features to Remember
1. **Smart Tagging:** Using `#tag` in task text automatically moves it to the tag metadata.
2. **Reward Syntax:** `@รางวัล10บาท_Category` - Scanned upon task completion to update `rewardSystem.js` wallets.
3. **Command Center:** Space ID `0`. A specialized dashboard rendering `masterTodoList.js` and `smartFlow.js` widgets.
4. **Hybrid Sync:** Data is saved locally immediately but debounced for Firebase Cloud sync.

## 📝 Note for AI Editors
- **DOM Manipulation:** This project uses Vanilla JS. Do not use React/Vue patterns.
- **Icons:** Uses SVG symbols defined in `dashboard.html`. Reference them via `<use href="#icon-name">`.
- **State:** Always use `saveData()` after modifying the `spaces` or `appSettings` objects to ensure sync.
- **Mobile:** Mobile UI is largely handled by `responsive.css` and a state-check in `contentManager.js`.