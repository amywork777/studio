// The file panel beside the model, as a CAD tool's tree reads: Models, Drawings, Pictures and Other,
// a filter at the top, and an assembly opening onto its parts from the GLB Studio made of it.
import { download } from "./hub.js";

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

export const HUB_FILES = ".hub/";
export const extOf = (path) => path.split(".").pop().toLowerCase();
export const isModel = (path) => ["stl", "glb"].includes(extOf(path));
/** Where a file came from: a model Studio made from a STEP file goes by the STEP's path. */
export const sourceOf = (path) =>
  path.startsWith(HUB_FILES) ? path.slice(HUB_FILES.length).replace(/\.glb$/i, "") : path;
const words = (name) => name.replace(/[_-]+/g, " ").trim();
export const labelOf = (path) =>
  words(
    sourceOf(path)
      .split("/")
      .pop()
      .replace(/\.(step|stp|stl|glb|pdf|png|jpe?g|mp4)$/i, ""),
  );
export const kindOf = (path) => {
  const ext = extOf(path);
  if (isModel(path)) return "models";
  if (ext === "pdf") return "drawings";
  if (["png", "jpg", "jpeg"].includes(ext)) return "pictures";
  return "other";
};
const isAssembly = (path) => extOf(path) === "glb" && /(^|\/)assemblies\//.test(sourceOf(path));
const typeOf = (path) =>
  path.startsWith(HUB_FILES) ? "STEP" : extOf(path) === "jpeg" ? "JPG" : extOf(path).toUpperCase();
const folderOf = (path) => sourceOf(path).split("/").slice(0, -1).join("/");
const key = (s) => words(s).toLowerCase();
// A long name gives up its middle, never its end, where a size like M3x8 tells two apart.
const nameHtml = (raw) => {
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  const cut = name.lastIndexOf(" ");
  if (name.length <= 18 || cut < 0 || name.length - cut > 12) {
    return `<span class="nm-head">${esc(name)}</span>`;
  }
  return `<span class="nm-head">${esc(name.slice(0, cut))}</span><span class="nm-tail">${esc(name.slice(cut))}</span>`;
};

const GROUPS = [
  ["models", "Models"],
  ["drawings", "Drawings"],
  ["pictures", "Pictures"],
  ["other", "Other"],
];
const ICON = {
  models: `<svg viewBox="0 0 16 16"><path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5Zm-5.5 3.2L8 8.2 13.5 5M8 8.2v6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  assembly: `<svg viewBox="0 0 16 16"><path d="M5 1.8 8.2 3.6v3.6L5 9 1.8 7.2V3.6Zm6 5.2 3.2 1.8v3.6L11 14.2l-3.2-1.8V8.8ZM1.8 3.6 5 5.4l3.2-1.8M5 5.4V9m2.8-.2L11 10.6l3.2-1.8M11 10.6v3.6" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/></svg>`,
  part: `<svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`,
  drawings: `<svg viewBox="0 0 16 16"><path d="M4 1.8h5.5L12.5 5v9.2H4Zm5.5 0V5h3M6 8h4.5M6 10.5h4.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  pictures: `<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="m2.5 11.5 3.5-3.5 3 3 1.8-1.8 2.7 2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><circle cx="10.5" cy="6.3" r="1.1" fill="currentColor"/></svg>`,
  other: `<svg viewBox="0 0 16 16"><path d="M4 1.8h5.5L12.5 5v9.2H4Zm5.5 0V5h3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
  twist: `<svg viewBox="0 0 12 12"><path d="M4.5 3 7.5 6l-3 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  panel: `<svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="12" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 2.8v10.4" stroke="currentColor" stroke-width="1.2"/></svg>`,
  search: `<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="m10.3 10.3 3.2 3.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
};

/** An assembly's parts, read from the GLB's own node tree: no 3D library needed for the list. */
function treeOf(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) return [];
  const length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
  const nodes = json.nodes ?? [];
  const build = (index, seen) => {
    if (seen.has(index) || nodes[index] === undefined) return null;
    seen.add(index);
    const node = nodes[index];
    const raw = (node.name ?? `Part ${index + 1}`).split("/").pop();
    const [part, where] = raw.split(":");
    return {
      node: index,
      name: where ? `${words(part)} · ${words(where)}` : words(part),
      part: words(part),
      children: (node.children ?? []).map((c) => build(c, seen)).filter(Boolean),
    };
  };
  const roots = (json.scenes?.[json.scene ?? 0]?.nodes ?? []).map((n) => build(n, new Set()));
  // One root named for the assembly is the assembly itself: list what is inside it.
  return roots.length === 1 && roots[0] ? roots[0].children : roots.filter(Boolean);
}

const remember = {
  get(name, fallback) {
    try {
      const value = localStorage.getItem(`studio-hub:${name}`);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(name, value) {
    try {
      localStorage.setItem(`studio-hub:${name}`, JSON.stringify(value));
    } catch {}
  },
};

/**
 * `onOpen(path)` opens a file; `onPart(path, node)` shows an assembly with one of its parts picked
 * (node null for the whole assembly).
 */
export function makeFilePanel(el, work, { onOpen, onPart }) {
  let files = [];
  let current = null;
  let picked = null;
  let query = "";
  const trees = new Map();
  const expanded = new Set();
  const shutGroups = new Set(remember.get("files-shut-groups", []));
  let open = remember.get("files-open", true);

  el.innerHTML = `
    <div class="layers-head">
      <button class="icon-btn" type="button" id="layers-toggle" aria-controls="layers-body">${ICON.panel}</button>
      <span class="layers-title">Files <span class="count" id="layers-count"></span></span>
    </div>
    <div class="layers-body" id="layers-body">
      <label class="layers-search">${ICON.search}<span class="sr">Filter files</span>
        <input id="layers-q" type="search" placeholder="Filter files and parts" autocomplete="off" spellcheck="false"></label>
      <div class="layers-list" id="layers-list" role="tree" aria-label="Files"></div>
    </div>`;
  const list = el.querySelector("#layers-list");
  const input = el.querySelector("#layers-q");
  const toggle = el.querySelector("#layers-toggle");

  const setOpen = (next) => {
    open = next;
    remember.set("files-open", open);
    work.classList.toggle("files-shut", !open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.title = open ? "Hide files" : "Show files";
    toggle.setAttribute("aria-label", toggle.title);
  };
  setOpen(open);
  toggle.addEventListener("click", () => setOpen(!open));

  input.addEventListener("input", () => {
    query = input.value.trim().toLowerCase();
    if (query !== "") loadAllTrees();
    paintList();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && input.value !== "") {
      input.value = "";
      query = "";
      paintList();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      list.querySelector(".row-main, .group-head")?.focus();
    }
  });

  async function loadTree(path) {
    const file = files.find((f) => f.path === path);
    if (file === undefined || trees.has(path)) return;
    trees.set(path, "loading");
    try {
      trees.set(path, treeOf(await (await download(file.object)).arrayBuffer()));
    } catch {
      trees.set(path, []);
    }
    paintList();
  }
  const loadAllTrees = () =>
    files.filter((f) => isAssembly(f.path)).forEach((f) => loadTree(f.path));

  /** The part's own model, when the Version has one: the one made from its STEP first. */
  const fileFor = (part) => {
    const mine = files.filter(
      (f) => isModel(f.path) && !isAssembly(f.path) && key(labelOf(f.path)) === part,
    );
    return mine.find((f) => f.path.startsWith(HUB_FILES)) ?? mine[0] ?? null;
  };

  const hit = (text) => query === "" || text.toLowerCase().includes(query);
  const nodeHits = (n) => hit(n.name) || n.children.some(nodeHits);
  const twisty = (id, isOpen) =>
    `<button class="twisty" type="button" data-twist="${esc(id)}" tabindex="-1" aria-label="${isOpen ? "Hide" : "Show"} parts">${ICON.twist}</button>`;

  function nodeRows(path, nodes, depth) {
    return nodes
      .filter((n) => query === "" || nodeHits(n))
      .map((n) => {
        const id = `${path}#${n.node}`;
        const inner = n.children.length > 0;
        const own = inner ? null : fileFor(key(n.part));
        const isOpen = inner && (expanded.has(id) || query !== "");
        const isPicked = picked?.path === path && picked.node === n.node;
        return `<div class="row" role="treeitem" aria-level="${depth + 1}" ${inner ? `aria-expanded="${isOpen}"` : ""} style="--depth:${depth}">
          ${inner ? twisty(id, isOpen) : `<span class="twisty"></span>`}
          <button class="row-main${isPicked ? " picked" : ""}" type="button" data-of="${esc(path)}" data-node="${n.node}" title="Pick it in the assembly">
            ${inner ? ICON.assembly : ICON.part}<span class="row-name" title="${esc(n.name)}">${nameHtml(n.name)}</span>
          </button>${own ? `<button class="row-open" type="button" data-open="${esc(own.path)}" title="Open its own model">${typeOf(own.path)}</button>` : ""}</div>
          ${isOpen ? nodeRows(path, n.children, depth + 1) : ""}`;
      })
      .join("");
  }

  function fileRow(f, labels) {
    const label = labelOf(f.path);
    const tree = trees.get(f.path);
    const assembly = isAssembly(f.path);
    const nodes = Array.isArray(tree) ? tree : [];
    const partHit = query !== "" && nodes.some(nodeHits);
    if (!hit(label) && !hit(sourceOf(f.path)) && !partHit) return "";
    const isOpen = assembly && (expanded.has(f.path) || partHit);
    const twin = labels.get(`${kindOf(f.path)}:${key(label)}`).size > 1;
    const folder = folderOf(f.path);
    const state = current !== f.path ? "" : picked === null ? " current" : " current-soft";
    return `<div class="row" role="treeitem" aria-level="1" ${assembly ? `aria-expanded="${isOpen}"` : ""} style="--depth:0">
      ${assembly ? twisty(f.path, isOpen) : `<span class="twisty"></span>`}
      <button class="row-main${state}" type="button" data-path="${esc(f.path)}" ${current === f.path ? 'aria-current="true"' : ""} title="${esc(sourceOf(f.path))}">
        ${assembly ? ICON.assembly : ICON[kindOf(f.path)]}<span class="row-name">${nameHtml(label)}${twin && folder ? `<span class="row-where">${esc(words(folder.split("/").pop()))}</span>` : ""}</span><span class="ext">${typeOf(f.path)}</span>
      </button></div>
      ${
        !isOpen
          ? ""
          : tree === "loading" || tree === undefined
            ? `<div class="row-note" style="--depth:1">Reading parts…</div>`
            : nodeRows(f.path, nodes, 1)
      }`;
  }

  function paintList() {
    // A folder beside the name only where two files of a kind share a name but not a folder.
    const labels = new Map();
    for (const f of files) {
      const k = `${kindOf(f.path)}:${key(labelOf(f.path))}`;
      labels.set(k, (labels.get(k) ?? new Set()).add(folderOf(f.path)));
    }
    const order = (a, b) =>
      Number(isAssembly(b.path)) - Number(isAssembly(a.path)) ||
      labelOf(a.path).localeCompare(labelOf(b.path)) ||
      typeOf(a.path).localeCompare(typeOf(b.path));
    const groups = GROUPS.map(([id, name]) => {
      const mine = files.filter((f) => kindOf(f.path) === id).toSorted(order);
      const rows = mine.map((f) => fileRow(f, labels)).filter(Boolean);
      return { id, name, total: mine.length, rows };
    }).filter((g) => g.total > 0 && (query === "" || g.rows.length > 0));
    list.innerHTML =
      files.length === 0
        ? `<p class="layers-empty">No models or drawings in this Version.</p>`
        : groups.length === 0
          ? `<p class="layers-empty">Nothing matches “${esc(query)}”.</p>`
          : groups
              .map((g) => {
                const shut = shutGroups.has(g.id) && query === "";
                return `<section class="group">
                  <button class="group-head" type="button" data-group="${g.id}" aria-expanded="${!shut}">${ICON.twist}<span>${g.name}</span><span class="count">${query === "" ? g.total : `${g.rows.length} of ${g.total}`}</span></button>
                  ${shut ? "" : `<div role="group">${g.rows.join("")}</div>`}
                </section>`;
              })
              .join("");
  }

  list.addEventListener("click", (event) => {
    const own = event.target.closest("[data-open]");
    if (own) return onOpen(own.dataset.open);
    const twist = event.target.closest("[data-twist]");
    if (twist) {
      const id = twist.dataset.twist;
      if (expanded.has(id)) expanded.delete(id);
      else {
        expanded.add(id);
        if (!id.includes("#")) loadTree(id);
      }
      return paintList();
    }
    const group = event.target.closest("[data-group]");
    if (group) {
      const id = group.dataset.group;
      if (shutGroups.has(id)) shutGroups.delete(id);
      else shutGroups.add(id);
      remember.set("files-shut-groups", [...shutGroups]);
      return paintList();
    }
    const row = event.target.closest(".row-main");
    if (!row) return;
    if (row.dataset.path) {
      if (isAssembly(row.dataset.path)) {
        expanded.add(row.dataset.path);
        loadTree(row.dataset.path);
      }
      return onOpen(row.dataset.path);
    }
    const path = row.dataset.of;
    const node = Number(row.dataset.node);
    const again = picked?.path === path && picked.node === node;
    onPart(path, again ? null : node);
  });

  // Up and down walk the rows; right and left open and close an assembly, as a tree does.
  list.addEventListener("keydown", (event) => {
    const row = event.target.closest(".row-main, .group-head");
    if (!row) return;
    const rows = [...list.querySelectorAll(".row-main, .group-head")];
    const at = rows.indexOf(row);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (event.key === "ArrowUp" && at === 0) return input.focus();
      return rows[at + (event.key === "ArrowDown" ? 1 : -1)]?.focus();
    }
    if (!row.classList.contains("row-main")) return;
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const twist = row.parentElement.querySelector("[data-twist]");
    const isOpen = row.parentElement.getAttribute("aria-expanded") === "true";
    if (!twist || isOpen !== (event.key === "ArrowLeft")) return;
    event.preventDefault();
    const selector = row.dataset.path
      ? `[data-path="${CSS.escape(row.dataset.path)}"]`
      : `[data-of="${CSS.escape(row.dataset.of)}"][data-node="${row.dataset.node}"]`;
    twist.click();
    list.querySelector(selector)?.focus();
  });

  return {
    /** The Version's files, the file shown, and the assembly part picked in it (or null). */
    paint(next, file, part) {
      if (next !== files) {
        const before = new Set(files.map((f) => f.object));
        if (next.some((f) => !before.has(f.object))) trees.clear();
        files = next;
      }
      const moved = file !== current || part?.node !== picked?.node;
      current = file;
      picked = part;
      if (file !== null && isAssembly(file) && !trees.has(file)) {
        expanded.add(file);
        loadTree(file);
      }
      el.querySelector("#layers-count").textContent = String(files.length);
      paintList();
      if (moved) list.querySelector(".current, .picked")?.scrollIntoView({ block: "nearest" });
    },
  };
}
