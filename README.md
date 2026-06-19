# Focus Project

A single-purpose browser extension — no account, no server, no cross-device sync.
Everything is stored locally in the browser's own `chrome.storage.local`, on this
machine only.

The UI lives in Chrome's **Side Panel**: not a small popup that closes the moment
you click away, but a persistent panel docked to the side of the window that stays
open while you browse and switch tabs.

## What it does

- Saves your open tabs as a **project**.
- Click a project in the side panel: its tabs open, whatever else you had open in
  that window closes.
- While a project is active, adding or closing tabs updates it automatically in
  the background — no need to hit "save" by hand.
- Chrome's native tab-group bracket/label is **not** used — tabs just open
  normally. The color you pick for a project shows up on the side panel card and
  on the **toolbar icon**: the icon recolors to match whichever project is active
  in that window, with the project's first letter as a badge. So even with the
  panel closed, a glance at the toolbar tells you which project you're in.
- **Pinned tabs** are never part of any project and are never closed — pin
  always-open tabs like Gmail or Slack and they'll stay put no matter which
  project you switch to.
- **Multiple windows are fully supported.** Each window tracks its own active
  project independently — working in one window and switching projects in
  another never touches the first window's tabs.
- **Clear tabs** (next to the color picker): closes every non-pinned tab in the
  current window and detaches it from whatever project was active there, so you
  start a brand new project from a clean slate instead of it inheriting leftover
  tabs from the previous one.

## Install (developer mode — not from the Web Store)

1. Download/open this folder (open it in VS Code with `code .` if you want to
   look at or tweak the files).
2. Go to `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top right.
4. Click **Load unpacked**.
5. Select the `focus-project` folder.
6. Click the amber icon that appears in the toolbar — the panel opens on the
   right edge of the window. Click again to close it.
   (If you don't see the icon in the toolbar, pin it from the puzzle-piece menu.)

## Usage

- **Open/close the panel:** click the toolbar icon.
- **New project:** open the tabs you want to work with, pick a color below, type
  a name, hit "Save". The open tabs now belong to that project.
- **Switch projects:** click a different project in the panel — the current
  tabs close, that project's tabs open. The panel stays open so you can watch
  the switch happen.
- **Rename:** double-click a project's name, type the new one, click away or hit
  Enter.
- **Delete:** click the "×" that appears when you hover a card. This only
  removes the saved record — it doesn't close whatever tabs happen to be open
  right now.
- **Start a fresh project:** click "Clear tabs" first to close everything in the
  window (safely saving the outgoing project first), then open the tabs for the
  new project and hit "Save".

## Known limitations (kept simple on purpose)

- Chrome doesn't let an extension recolor the actual tab strip or window frame
  at runtime (Firefox allows this, Chrome doesn't). That's why the color cue
  lives on the toolbar icon instead of the tab strip itself.
- Pages starting with `chrome://` (settings, extensions, etc.) aren't saved into
  a project's tab list.
- Data is entirely local, so resetting your Chrome profile or removing the
  extension deletes the projects too. There's no export feature yet — worth
  adding later if you don't want to risk losing an important list.

## Files

- `manifest.json` — extension definition and permissions (`tabs`, `storage`, `sidePanel`)
- `background.js` — all the logic: creating/switching/clearing projects, autosave, toolbar appearance
- `sidepanel.html` / `sidepanel.css` / `sidepanel.js` — the persistent side panel UI
- `icons/` — extension icons
