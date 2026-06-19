// sidepanel.js — Focus Project (persistent side panel)

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
const COLOR_ORDER = Object.keys(COLOR_HEX);

let selectedColor = COLOR_ORDER[0];
let currentState = { projects: [], activeProjectId: null };
let switching = false;
let myWindowId = null;

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function getMyWindowId() {
  if (myWindowId == null) {
    const win = await chrome.windows.getCurrent();
    myWindowId = win.id;
  }
  return myWindowId;
}

async function loadState() {
  const windowId = await getMyWindowId();
  const res = await send({ type: "GET_STATE", windowId });
  currentState = res && res.ok ? res.state : { projects: [], activeProjectId: null };
  render();
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

function render() {
  const { projects, activeProjectId } = currentState;
  const listEl = document.getElementById("project-list");
  const emptyEl = document.getElementById("empty-state");

  listEl.innerHTML = "";

  if (!projects.length) {
    emptyEl.hidden = false;
  } else {
    emptyEl.hidden = true;
    for (const project of projects) {
      listEl.appendChild(renderCard(project, project.id === activeProjectId));
    }
  }

  if (!switching) {
    const active = projects.find((p) => p.id === activeProjectId);
    setStatus(
      projects.length
        ? `${projects.length} project${projects.length === 1 ? "" : "s"} • Active: ${active ? active.name : "none"}`
        : "No projects yet"
    );
  }

  renderColorRow();
}

function renderCard(project, isActive) {
  const li = document.createElement("li");
  li.className = "project-card" + (isActive ? " project-card--active" : "");
  li.dataset.id = project.id;

  const bar = document.createElement("div");
  bar.className = "project-card__bar";
  bar.style.background = COLOR_HEX[project.color] || COLOR_HEX.grey;

  const body = document.createElement("div");
  body.className = "project-card__body";

  const name = document.createElement("div");
  name.className = "project-card__name";
  name.textContent = project.name;
  name.title = "Double-click to rename";

  const meta = document.createElement("div");
  meta.className = "project-card__meta";
  const count = project.tabs ? project.tabs.length : 0;
  meta.textContent = isActive ? `${count} tab${count === 1 ? "" : "s"} · active` : `${count} tab${count === 1 ? "" : "s"}`;

  body.appendChild(name);
  body.appendChild(meta);

  const del = document.createElement("button");
  del.className = "project-card__delete";
  del.textContent = "×";
  del.title = "Delete project";

  li.appendChild(bar);
  li.appendChild(body);
  li.appendChild(del);

  del.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${project.name}"? (This only removes the saved record — any tabs currently open stay open.)`)) return;
    await send({ type: "DELETE_PROJECT", projectId: project.id });
    await loadState();
  });

  name.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    name.contentEditable = "true";
    name.focus();
    document.execCommand("selectAll", false, null);
  });

  name.addEventListener("click", (e) => {
    if (name.isContentEditable) e.stopPropagation();
  });

  name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      name.blur();
    }
  });

  name.addEventListener("blur", async () => {
    if (!name.isContentEditable) return;
    name.contentEditable = "false";
    const newName = name.textContent.trim();
    if (newName && newName !== project.name) {
      await send({ type: "RENAME_PROJECT", projectId: project.id, name: newName });
      await loadState();
    } else {
      name.textContent = project.name;
    }
  });

  li.addEventListener("click", async () => {
    if (isActive || switching) return;
    switching = true;
    setStatus(`Opening "${project.name}"…`);
    const windowId = await getMyWindowId();
    await send({ type: "SWITCH_PROJECT", windowId, projectId: project.id });
    switching = false;
    await loadState();
  });

  return li;
}

function renderColorRow() {
  const row = document.getElementById("color-swatches");
  row.innerHTML = "";
  for (const color of COLOR_ORDER) {
    const btn = document.createElement("button");
    btn.className = "color-swatch" + (color === selectedColor ? " color-swatch--selected" : "");
    btn.style.background = COLOR_HEX[color];
    btn.title = color;
    btn.type = "button";
    btn.addEventListener("click", () => {
      selectedColor = color;
      renderColorRow();
    });
    row.appendChild(btn);
  }
}

async function createProject() {
  const input = document.getElementById("project-name");
  const name = input.value.trim();
  if (!name) {
    input.focus();
    return;
  }
  const btn = document.getElementById("create-btn");
  btn.disabled = true;
  setStatus("Saving the open tabs…");
  const windowId = await getMyWindowId();
  await send({ type: "CREATE_PROJECT", windowId, name, color: selectedColor });
  input.value = "";
  btn.disabled = false;
  selectedColor = COLOR_ORDER[(currentState.projects.length + 1) % COLOR_ORDER.length];
  await loadState();
}

async function clearWindow() {
  const tabCount = currentState.activeProjectId
    ? "Saving its current tabs and "
    : "";
  if (!confirm(`${tabCount}Close all tabs in this window so you can start a fresh project?`)) return;
  const clearBtn = document.getElementById("clear-btn");
  clearBtn.disabled = true;
  setStatus("Clearing this window…");
  const windowId = await getMyWindowId();
  await send({ type: "CLEAR_WINDOW", windowId });
  clearBtn.disabled = false;
  await loadState();
}

document.getElementById("create-btn").addEventListener("click", createProject);
document.getElementById("project-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") createProject();
});
document.getElementById("clear-btn").addEventListener("click", clearWindow);

loadState();
