// background.js — Focus Project
//
// Each window tracks its own active project (activeByWindow). Earlier
// versions kept a single global "active project" guessed from "whichever
// window currently has focus" — opening a second window could overwrite
// the wrong project's data. Now every side panel reports its own windowId
// and all operations are scoped to that id.

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

const COLORS = ["grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange"];
const AUTOSAVE_DEBOUNCE_MS = 800;

const switchingWindows = new Set();      // windowIds currently mid-switch (autosave is paused for these)
const autosaveTimers = new Map();        // windowId -> setTimeout handle

// ---------- storage helpers ----------

async function getState() {
  const data = await chrome.storage.local.get(["projects", "activeByWindow", "activeProjectId"]);

  // Migration from an older version that stored a single global activeProjectId:
  // keep all saved projects, just reset the per-window binding.
  if (data.activeProjectId !== undefined && data.activeByWindow === undefined) {
    await chrome.storage.local.remove("activeProjectId");
    await chrome.storage.local.set({ activeByWindow: {} });
    return { projects: data.projects || [], activeByWindow: {} };
  }

  return {
    projects: data.projects || [],
    activeByWindow: data.activeByWindow || {},
  };
}

async function setState(state) {
  await chrome.storage.local.set({ projects: state.projects, activeByWindow: state.activeByWindow });
}

function stateForWindow(state, windowId) {
  return {
    projects: state.projects,
    activeProjectId: state.activeByWindow[String(windowId)] || null,
  };
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function nextColor(usedCount) {
  return COLORS[usedCount % COLORS.length];
}

// ---------- tab helpers ----------

async function captureCurrentTabs(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs
    .filter((t) => !t.pinned && t.url && !t.url.startsWith("chrome://") && !t.url.startsWith("chrome-extension://"))
    .map((t) => ({ url: t.url, title: t.title || t.url }));
}

// ---------- toolbar icon / badge (per window, via the active tab) ----------

function colorIconSet(color) {
  return {
    16: `icons/colors/${color}16.png`,
    32: `icons/colors/${color}32.png`,
    48: `icons/colors/${color}48.png`,
  };
}

const NEUTRAL_ICON_SET = { 16: "icons/icon16.png", 32: "icons/icon32.png", 48: "icons/icon48.png" };

const COLOR_HEX = {
  grey: "#80868b",
  blue: "#1a73e8",
  red: "#d93025",
  yellow: "#f9ab00",
  green: "#1e8e3e",
  pink: "#d01884",
  purple: "#a142f4",
  cyan: "#12b5cb",
  orange: "#fa903e",
};

async function applyAppearanceForWindow(windowId, state) {
  try {
    const tabs = await chrome.tabs.query({ windowId, active: true });
    if (!tabs.length) return;
    const tabId = tabs[0].id;
    const projectId = state.activeByWindow[String(windowId)];
    const project = state.projects.find((p) => p.id === projectId);

    if (project) {
      await chrome.action.setIcon({ tabId, path: colorIconSet(project.color) });
      await chrome.action.setBadgeText({ tabId, text: project.name.trim().slice(0, 1).toUpperCase() });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: COLOR_HEX[project.color] || COLOR_HEX.grey });
      await chrome.action.setTitle({ tabId, title: `Focus Project — ${project.name}` });
    } else {
      await chrome.action.setIcon({ tabId, path: NEUTRAL_ICON_SET });
      await chrome.action.setBadgeText({ tabId, text: "" });
      await chrome.action.setTitle({ tabId, title: "Toggle Focus Project" });
    }
  } catch (e) {
    // A failed icon/badge update never blocks the actual feature.
  }
}

async function refreshAllWindowAppearances() {
  const state = await getState();
  const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
  for (const w of wins) await applyAppearanceForWindow(w.id, state);
}
refreshAllWindowAppearances();

chrome.tabs.onActivated.addListener(async ({ windowId }) => {
  const state = await getState();
  await applyAppearanceForWindow(windowId, state);
});

// ---------- live tracking (per-window autosave) ----------

function scheduleAutosave(windowId) {
  if (windowId == null || switchingWindows.has(windowId)) return;
  if (autosaveTimers.has(windowId)) clearTimeout(autosaveTimers.get(windowId));
  autosaveTimers.set(
    windowId,
    setTimeout(() => autosaveForWindow(windowId), AUTOSAVE_DEBOUNCE_MS)
  );
}

async function autosaveForWindow(windowId) {
  autosaveTimers.delete(windowId);
  if (switchingWindows.has(windowId)) return;
  const state = await getState();
  const projectId = state.activeByWindow[String(windowId)];
  if (!projectId) return;
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;
  project.tabs = await captureCurrentTabs(windowId);
  await setState(state);
}

chrome.tabs.onCreated.addListener((tab) => scheduleAutosave(tab.windowId));
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (removeInfo.isWindowClosing) return; // don't record a fake "empty project" while the window itself is closing
  scheduleAutosave(removeInfo.windowId);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" || changeInfo.pinned !== undefined) {
    scheduleAutosave(tab.windowId);
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  switchingWindows.delete(windowId);
  if (autosaveTimers.has(windowId)) {
    clearTimeout(autosaveTimers.get(windowId));
    autosaveTimers.delete(windowId);
  }
  const state = await getState();
  if (state.activeByWindow[String(windowId)] !== undefined) {
    delete state.activeByWindow[String(windowId)];
    await setState(state);
  }
});

// ---------- main actions ----------

async function createProject(windowId, name, color) {
  const tabs = await captureCurrentTabs(windowId);
  const state = await getState();

  const project = {
    id: genId(),
    name: name.trim() || "Untitled Project",
    color: color || nextColor(state.projects.length),
    tabs,
  };

  state.projects.push(project);
  state.activeByWindow[String(windowId)] = project.id;
  await setState(state);
  await applyAppearanceForWindow(windowId, state);

  return project;
}

async function switchToProject(windowId, projectId) {
  switchingWindows.add(windowId);
  try {
    const state = await getState();

    // Flush the window's current project before leaving it.
    const currentProjectId = state.activeByWindow[String(windowId)];
    if (currentProjectId) {
      const current = state.projects.find((p) => p.id === currentProjectId);
      if (current) current.tabs = await captureCurrentTabs(windowId);
    }

    const target = state.projects.find((p) => p.id === projectId);
    if (!target) return;

    const oldTabs = await chrome.tabs.query({ windowId });
    const oldNonPinnedIds = oldTabs.filter((t) => !t.pinned).map((t) => t.id);

    const urls = target.tabs.length ? target.tabs.map((t) => t.url) : ["chrome://newtab/"];

    for (let i = 0; i < urls.length; i++) {
      await chrome.tabs.create({ windowId, url: urls[i], active: i === 0 });
    }

    if (oldNonPinnedIds.length) {
      await chrome.tabs.remove(oldNonPinnedIds);
    }

    state.activeByWindow[String(windowId)] = projectId;
    await setState(state);
    await applyAppearanceForWindow(windowId, state);
  } finally {
    switchingWindows.delete(windowId);
  }
}

async function deleteProject(projectId) {
  const state = await getState();
  state.projects = state.projects.filter((p) => p.id !== projectId);

  const affected = [];
  for (const [winId, pid] of Object.entries(state.activeByWindow)) {
    if (pid === projectId) {
      delete state.activeByWindow[winId];
      affected.push(Number(winId));
    }
  }

  await setState(state);
  for (const winId of affected) await applyAppearanceForWindow(winId, state);
}

async function renameProject(projectId, name) {
  const state = await getState();
  const project = state.projects.find((p) => p.id === projectId);
  if (project) project.name = name.trim() || project.name;
  await setState(state);

  for (const [winId, pid] of Object.entries(state.activeByWindow)) {
    if (pid === projectId) await applyAppearanceForWindow(Number(winId), state);
  }
}

// Detach this window from whatever project it had, flushing that project's
// final tab state first, then close every non-pinned tab. Leaves the window
// with no active project, ready for a brand new one.
async function clearWindow(windowId) {
  switchingWindows.add(windowId);
  try {
    const state = await getState();

    const currentProjectId = state.activeByWindow[String(windowId)];
    if (currentProjectId) {
      const current = state.projects.find((p) => p.id === currentProjectId);
      if (current) current.tabs = await captureCurrentTabs(windowId);
      delete state.activeByWindow[String(windowId)];
    }
    await setState(state);

    const tabs = await chrome.tabs.query({ windowId });
    const nonPinnedIds = tabs.filter((t) => !t.pinned).map((t) => t.id);
    if (nonPinnedIds.length) {
      await chrome.tabs.create({ windowId, url: "chrome://newtab/", active: true });
      await chrome.tabs.remove(nonPinnedIds);
    }

    await applyAppearanceForWindow(windowId, state);
  } finally {
    switchingWindows.delete(windowId);
  }
}

// ---------- messaging with the side panel ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case "GET_STATE": {
          const state = await getState();
          sendResponse({ ok: true, state: stateForWindow(state, msg.windowId) });
          break;
        }
        case "CREATE_PROJECT":
          sendResponse({ ok: true, project: await createProject(msg.windowId, msg.name, msg.color) });
          break;
        case "SWITCH_PROJECT":
          await switchToProject(msg.windowId, msg.projectId);
          sendResponse({ ok: true });
          break;
        case "DELETE_PROJECT":
          await deleteProject(msg.projectId);
          sendResponse({ ok: true });
          break;
        case "RENAME_PROJECT":
          await renameProject(msg.projectId, msg.name);
          sendResponse({ ok: true });
          break;
        case "CLEAR_WINDOW":
          await clearWindow(msg.windowId);
          sendResponse({ ok: true });
          break;
        default:
          sendResponse({ ok: false, error: "unknown message type" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();
  return true; // async response pending
});
