// Studio's team hub in a browser: everyone on a team, and anyone a project is shared with, sees its
// Versions, models and drawings, and comments on a spot on the model. Admins and Editors pass a
// comment to the agent in their Studio with Fix this. The project itself (its scripts and history)
// never comes here: the hub hands this page only a Version's models, drawings and pictures.
import {
  download,
  href,
  me,
  onSignOut,
  params as startParams,
  rpc,
  select,
  sendCode,
  signOut,
  verifyCode,
} from "./hub.js";
import { makeViewer } from "./viewer.js";

const app = document.getElementById("app");
const bar = document.getElementById("bar");

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const hue = (email) => {
  let hash = 0;
  for (const char of email.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 200 + (hash % 120);
};
const colorOf = (email) => `hsl(${hue(email)} 52% 52%)`;
/** A person's first name from their email: dana.kim@… is Dana. */
const nameOf = (email) => {
  const word = String(email ?? "").split(/[@+._-]/)[0] ?? "";
  return word === "" ? String(email ?? "") : word.charAt(0).toUpperCase() + word.slice(1);
};
const avatar = (email, size = "") =>
  `<span class="av ${size}" style="background:${colorOf(email)}" title="${esc(email)}" aria-hidden="true">${esc(nameOf(email).charAt(0))}</span>`;
const ago = (iso) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};
const extOf = (path) => path.split(".").pop().toLowerCase();
const isModel = (path) => ["stl", "glb"].includes(extOf(path));
const HUB_FILES = ".hub/";
const THUMB = `${HUB_FILES}thumb.png`;
/** Where a file came from: a model Studio made from a STEP file goes by the STEP's path. */
const sourceOf = (path) =>
  path.startsWith(HUB_FILES) ? path.slice(HUB_FILES.length).replace(/\.glb$/i, "") : path;
const labelOf = (path) =>
  sourceOf(path)
    .split("/")
    .pop()
    .replace(/\.(step|stp|stl|glb|pdf|png)$/i, "")
    .replace(/[_-]+/g, " ");
const kindOf = (path) => (isModel(path) ? "model" : extOf(path) === "pdf" ? "drawing" : "picture");

const ICON = {
  agent: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5v2M4.5 5h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="6" cy="9" r="1" fill="currentColor"/><circle cx="10" cy="9" r="1" fill="currentColor"/></svg>`,
  link: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  lock: `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>`,
  cube: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4Z M4 7.4l8 4.6 8-4.6M12 12v9.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
};

// Where the page is: the projects, one project (at a Version, on a file), or a share link.
let route = new URLSearchParams(startParams);
function go(query, { replace = false } = {}) {
  const url = href(query);
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  route = new URLSearchParams(location.search);
  render();
}
window.addEventListener("popstate", () => {
  route = new URLSearchParams(location.search);
  render();
});
document.addEventListener("click", (event) => {
  const link = event.target.closest?.("a[data-go]");
  if (!link || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  go(JSON.parse(link.dataset.go));
});
const goAttr = (query) => `href="${esc(href(query))}" data-go='${esc(JSON.stringify(query))}'`;

let stopPage = () => {};
onSignOut(() => render());

function paintBar(crumbs = "") {
  const session = me();
  bar.innerHTML = `<a class="brand" ${goAttr({})}><span class="mark" aria-hidden="true"></span>Studio</a>
    <span class="crumbs">${crumbs}</span>
    <span class="who">${
      session === null
        ? ""
        : `${avatar(session.email)}<span class="who-name">${esc(session.email)}</span><button class="btn quiet small" id="signout" type="button">Sign out</button>`
    }</span>`;
  document.getElementById("signout")?.addEventListener("click", signOut);
}

async function render() {
  stopPage();
  stopPage = () => {};
  if (me() === null) return signInView();
  const link = route.get("link");
  if (link) return openLink(link);
  const review = route.get("review");
  if (review) return openReview(review);
  const project = route.get("project");
  return project ? projectView(project) : homeView();
}

// Sign in: an email, then the 6-digit code it receives. A share link waits until then.
function signInView(sentTo = null, error = null) {
  paintBar();
  const shared = route.get("link") !== null;
  app.className = "page center";
  app.innerHTML = `<section class="card narrow signin">
    <span class="mark big" aria-hidden="true"></span>
    <h1>${shared ? "A project was shared with you" : "Sign in to your team"}</h1>
    <p class="muted">${shared ? "Sign in with your email to see its models and drawings and comment on them." : "See your team's projects, every Version, and comment right on the model."} Studio emails you a 6-digit code; there is no password.</p>
    ${
      sentTo === null
        ? `<form id="email-form" class="stack"><label class="label" for="email">Email</label>
            <input type="email" id="email" required autocomplete="email" placeholder="you@company.com">
            <button class="btn primary wide" type="submit">Email me a code</button></form>`
        : `<form id="code-form" class="stack"><label class="label" for="code">Code sent to ${esc(sentTo)}</label>
            <input type="text" id="code" class="code" inputmode="numeric" autocomplete="one-time-code" required placeholder="123456">
            <button class="btn primary wide" type="submit">Sign in</button>
            <button class="btn quiet" type="button" id="again">Use another email</button></form>`
    }
    ${error ? `<p class="error">${esc(error)}</p>` : ""}
  </section>`;
  document.getElementById("email-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim().toLowerCase();
    try {
      await sendCode(email);
      signInView(email);
    } catch (cause) {
      signInView(null, cause.message);
    }
  });
  document.getElementById("again")?.addEventListener("click", () => signInView());
  document.getElementById("code-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = document.getElementById("code").value.replace(/\s+/g, "");
    try {
      await verifyCode(sentTo, token);
      render();
    } catch (cause) {
      signInView(sentTo, cause.message);
    }
  });
  (document.getElementById("code") ?? document.getElementById("email"))?.focus();
}

function failView(message) {
  paintBar();
  app.className = "page center";
  app.innerHTML = `<section class="card narrow"><p class="error">${esc(message)}</p><a class="btn" ${goAttr({})}>All projects</a></section>`;
}

async function openLink(token) {
  app.className = "page center";
  app.innerHTML = `<p class="muted">Opening the shared project…</p>`;
  try {
    const project = await rpc("open_share_link", { p_token: token });
    go({ project }, { replace: true });
  } catch (cause) {
    failView(cause.message);
  }
}

// An older review link (Studio's Copy review link) opens its project at the reviewed Version.
async function openReview(id) {
  try {
    const [review] = await select(
      `team_reviews?select=project_id,version&id=eq.${encodeURIComponent(id)}`,
    );
    if (review === undefined) return failView("That review is not on a team this email is on.");
    go({ project: review.project_id, v: review.version }, { replace: true });
  } catch (cause) {
    failView(cause.message);
  }
}

const statusOf = (people, releasedRev) => {
  if (releasedRev) return ["released", `Rev ${releasedRev}`];
  const decisions = people.map((p) => p.decision);
  if (decisions.includes("changes")) return ["changes", "Changes requested"];
  if (decisions.length > 0 && decisions.every((d) => d === "approved"))
    return ["approved", "Approved"];
  return ["review", "In review"];
};

// The projects: each team's, then any shared with this person, newest change first.
async function homeView() {
  paintBar();
  app.className = "page";
  app.innerHTML = `<div class="home"><div class="home-head"><h1>Projects</h1></div><div class="grid">${'<div class="tile ghost"></div>'.repeat(3)}</div></div>`;
  let teams, projects, versions, thumbs, open, asked;
  try {
    [teams, projects] = await Promise.all([
      rpc("my_teams"),
      select(
        `team_projects?select=id,team_id,name,version,updated_at,checked_out_email,teams(name)&order=updated_at.desc`,
      ),
    ]);
    const ids = projects.map((p) => p.id).join(",");
    [versions, thumbs, open, asked] =
      projects.length === 0
        ? [[], [], [], []]
        : await Promise.all([
            select(
              `team_project_versions?select=project_id,version,by_email,at,released_rev&project_id=in.(${ids})&order=version.desc`,
            ),
            select(
              `team_version_files?select=project_id,version,path,object&project_id=in.(${ids})&path=ilike.*.png`,
            ),
            select(
              `team_review_comments?select=project_id&project_id=in.(${ids})&resolved_in=is.null&reply_to=is.null`,
            ),
            select(
              `team_review_people?select=decision,team_reviews(project_id,version)&email=eq.${encodeURIComponent(me().email)}&decision=is.null`,
            ),
          ]);
  } catch (cause) {
    return failView(cause.message);
  }
  const latest = new Map();
  for (const v of versions) if (!latest.has(v.project_id)) latest.set(v.project_id, v);
  const thumbOf = (p) => {
    const mine = thumbs.filter((f) => f.project_id === p.id && f.version === p.version);
    return (
      mine.find((f) => f.path === THUMB) ??
      mine.find((f) => f.path.startsWith("pictures/")) ??
      mine[0] ??
      null
    );
  };
  const openCount = (p) => open.filter((c) => c.project_id === p.id).length;
  const waiting = new Set(
    asked
      .filter((a) => a.team_reviews !== null)
      .map((a) => `${a.team_reviews.project_id}:${a.team_reviews.version}`),
  );
  const card = (p) => {
    const v = latest.get(p.id);
    const thumb = thumbOf(p);
    const count = openCount(p);
    return `<a class="tile" ${goAttr({ project: p.id })}>
      <span class="thumb" ${thumb ? `data-thumb="${esc(thumb.object)}"` : ""}>${thumb ? "" : `<span class="thumb-empty">${ICON.cube}</span>`}</span>
      <span class="tile-body">
        <span class="tile-top"><b class="tile-name">${esc(p.name)}</b>
          ${v?.released_rev ? `<span class="tag">Rev ${esc(v.released_rev)}</span>` : ""}
          ${waiting.has(`${p.id}:${p.version}`) ? `<span class="tag accent">Your review</span>` : ""}</span>
        <span class="tile-meta">${
          v
            ? `${avatar(v.by_email, "sm")}<span>${esc(nameOf(v.by_email))} · Version ${v.version} · ${ago(v.at)}</span>`
            : `<span>Nothing checked in yet</span>`
        }</span>
        <span class="tile-foot">
          ${p.checked_out_email ? `<span class="editing">${ICON.lock}${esc(nameOf(p.checked_out_email))} is editing</span>` : `<span></span>`}
          ${count > 0 ? `<span class="count" title="Open comments">${count} open</span>` : ""}
        </span>
      </span></a>`;
  };
  const sections = [];
  for (const team of teams) {
    const mine = projects.filter((p) => p.team_id === team.id);
    sections.push(`<section class="home-section"><div class="home-head">
      <h2>${esc(team.name)}</h2><span class="muted small">${team.members?.length ?? 0} people · you are ${team.role === "admin" ? "an Admin" : team.role === "editor" ? "an Editor" : "a Viewer"}</span></div>
      ${
        mine.length === 0
          ? `<p class="empty">No projects yet. In Studio, Share with team puts one here.</p>`
          : `<div class="grid">${mine.map(card).join("")}</div>`
      }</section>`);
  }
  const guest = projects.filter((p) => p.teams === null);
  if (guest.length > 0) {
    sections.push(`<section class="home-section"><div class="home-head"><h2>Shared with you</h2></div>
      <div class="grid">${guest.map(card).join("")}</div></section>`);
  }
  app.innerHTML = `<div class="home">${
    sections.length === 0
      ? `<section class="card narrow"><h1>No projects yet</h1><p class="muted">You are not on a team. Ask an Admin to invite this email, or open a link someone shared with you.</p></section>`
      : sections.join("")
  }</div>`;
  for (const el of app.querySelectorAll("[data-thumb]")) {
    download(el.dataset.thumb)
      .then((blob) => {
        const img = document.createElement("img");
        img.alt = "";
        img.src = URL.createObjectURL(blob);
        el.replaceChildren(img);
      })
      .catch(() => {});
  }
}

const COMMENT_COLS =
  "id,version,by_email,body,at,anchor,reply_to,resolved_in,agent_sees,fix_by,fix_at";

async function loadProject(id) {
  const [rows, role, teams] = await Promise.all([
    select(
      `team_projects?select=id,team_id,name,version,updated_at,checked_out_email,teams(name)&id=eq.${encodeURIComponent(id)}`,
    ),
    rpc("project_role", { p_project: id }),
    rpc("my_teams"),
  ]);
  const project = rows[0];
  if (project === undefined) return null;
  const q = encodeURIComponent(id);
  const [versions, files, comments, reviews] = await Promise.all([
    select(
      `team_project_versions?select=version,by_email,note,at,released_rev&project_id=eq.${q}&order=version.desc`,
    ),
    select(`team_version_files?select=version,path,object,size&project_id=eq.${q}&order=path`),
    select(`team_review_comments?select=${COMMENT_COLS}&project_id=eq.${q}&order=at.asc`),
    select(
      `team_reviews?select=id,version,requested_email,created_at,team_review_people(email,decision)&project_id=eq.${q}`,
    ),
  ]);
  const team = teams.find((t) => t.id === project.team_id) ?? null;
  return { project, role, team, versions, files, comments, reviews };
}

// One project: the model on the left, its comments and Versions on the right.
async function projectView(id) {
  paintBar();
  app.className = "page full";
  app.innerHTML = `<p class="muted pad">Loading the project…</p>`;
  let data;
  try {
    data = await loadProject(id);
  } catch (cause) {
    return failView(cause.message);
  }
  if (data === null) {
    return failView("This project is not on a team this email is on, or its link was turned off.");
  }
  const editor = data.role === "admin" || data.role === "editor";
  const state = {
    data,
    version: Number(route.get("v")) || data.project.version,
    file: route.get("file"),
    tab: "comments",
    pending: null,
    replyTo: null,
    active: null,
    error: null,
    earlier: false,
  };
  const filesOf = () =>
    state.data.files.filter((f) => f.version === state.version && f.path !== THUMB);
  const pickFile = () => {
    const files = filesOf();
    const kept = files.find((f) => f.path === state.file);
    state.file = (kept ?? files.find((f) => isModel(f.path)) ?? files[0] ?? null)?.path ?? null;
  };
  pickFile();

  paintBar(
    `<span class="sep">/</span><a ${goAttr({})}>${esc(data.project.teams?.name ?? "Shared with you")}</a><span class="sep">/</span><b>${esc(data.project.name)}</b>`,
  );
  app.innerHTML = `<div class="work">
    <section class="canvas">
      <div class="canvas-top" id="canvas-top"></div>
      <div class="viewer" id="viewer" tabindex="0" aria-label="The selected file"></div>
      <div class="files" id="files" role="tablist" aria-label="Files"></div>
    </section>
    <aside class="side">
      <div class="side-tabs" role="tablist">
        <button type="button" role="tab" data-tab="comments">Comments</button>
        <button type="button" role="tab" data-tab="versions">Versions</button>
        ${editor ? `<button type="button" class="btn primary small share-btn" id="share">${ICON.link}Share</button>` : ""}
      </div>
      <div class="side-body" id="side"></div>
      <form class="composer" id="composer"></form>
    </aside>
  </div>
  <dialog class="sheet" id="share-dialog"></dialog>`;

  const viewer = makeViewer(document.getElementById("viewer"), {
    onPick: (point) => {
      state.pending = point;
      state.replyTo = null;
      state.tab = "comments";
      paintSide();
      paintComposer();
      paintPins();
      document.getElementById("comment")?.focus();
    },
    onPin: (commentId) => focusComment(commentId),
  });

  const fileObj = () =>
    state.data.files.find((f) => f.version === state.version && f.path === state.file) ?? null;
  const currentReview = () => state.data.reviews.find((r) => r.version === state.version) ?? null;
  const versionRow = (n) => state.data.versions.find((v) => v.version === n) ?? null;
  const roleOf = (email) =>
    state.data.team?.members?.find((m) => m.email.toLowerCase() === email.toLowerCase())?.role;
  const outside = (email) => {
    const r = roleOf(email);
    return r !== "admin" && r !== "editor";
  };
  const top = () => state.data.comments.filter((c) => c.reply_to === null);
  const here = () => top().filter((c) => c.version === state.version);
  const earlierOpen = () =>
    top().filter((c) => c.version < state.version && c.resolved_in === null);
  const pinNumber = (comment) =>
    here()
      .filter((c) => c.anchor?.point)
      .findIndex((c) => c.id === comment.id) + 1;

  const setUrl = () =>
    history.replaceState(
      null,
      "",
      href({
        project: id,
        v: state.version === state.data.project.version ? null : state.version,
        file: state.file,
      }),
    );

  function paintTop() {
    const v = versionRow(state.version);
    const review = currentReview();
    const [cls, label] = review
      ? statusOf(review.team_review_people, v?.released_rev)
      : [null, null];
    document.getElementById("canvas-top").innerHTML = `
      <label class="version-pick"><span class="sr">Version</span>
        <select id="version">${state.data.versions
          .map(
            (each) =>
              `<option value="${each.version}" ${each.version === state.version ? "selected" : ""}>Version ${each.version}${each.released_rev ? ` · Rev ${esc(each.released_rev)}` : ""}${each.version === state.data.project.version ? " · latest" : ""}</option>`,
          )
          .join("")}</select></label>
      ${review ? `<span class="pill ${cls}">${label}</span>` : v?.released_rev ? `<span class="pill released">Rev ${esc(v.released_rev)}</span>` : ""}
      ${v ? `<span class="by">${avatar(v.by_email, "sm")}<span>${esc(nameOf(v.by_email))} checked it in ${ago(v.at)}</span></span>` : ""}
      <span class="grow"></span>
      ${state.data.project.checked_out_email ? `<span class="editing">${ICON.lock}${esc(nameOf(state.data.project.checked_out_email))} is editing in Studio</span>` : ""}
      ${state.version === state.data.project.version ? "" : `<button class="btn small" type="button" id="to-latest">Go to Version ${state.data.project.version}</button>`}`;
    const switchTo = (n) => {
      state.version = n;
      state.pending = null;
      state.replyTo = null;
      pickFile();
      setUrl();
      paintAll();
      showFile();
    };
    document
      .getElementById("version")
      ?.addEventListener("change", (event) => switchTo(Number(event.target.value)));
    document
      .getElementById("to-latest")
      ?.addEventListener("click", () => switchTo(state.data.project.version));
  }

  function paintFiles() {
    const files = filesOf();
    const el = document.getElementById("files");
    el.innerHTML =
      files.length === 0
        ? `<span class="muted small">${state.data.versions.length === 0 ? "Nothing checked in yet." : "This Version has no models or drawings to show."}</span>`
        : files
            .map(
              (f) =>
                `<button class="file" type="button" role="tab" data-path="${esc(f.path)}" aria-selected="${state.file === f.path}" title="${esc(sourceOf(f.path))}"><span class="kind ${kindOf(f.path)}">${kindOf(f.path)}</span>${esc(labelOf(f.path))}</button>`,
            )
            .join("");
    el.querySelectorAll(".file").forEach((button) =>
      button.addEventListener("click", () => {
        state.file = button.dataset.path;
        state.pending = null;
        setUrl();
        paintFiles();
        paintComposer();
        showFile();
      }),
    );
  }

  const agentControls = (c) => {
    if (!editor || c.reply_to !== null || c.resolved_in !== null) return "";
    const see = outside(c.by_email)
      ? `<label class="switch" title="An outside reviewer's comment reaches the agent only when you let it."><input type="checkbox" data-see="${c.id}" ${c.agent_sees ? "checked" : ""}><span class="track"></span>Let agent see this</label>`
      : `<span class="agent-sees" title="Teammates' comments reach the agent in Studio.">${ICON.agent}Agent sees this</span>`;
    // Queued says the agent sees it; Undo takes it off the queue and leaves what it may see.
    return `<span class="agent-row">${
      c.fix_at !== null
        ? `<span class="queued">${ICON.agent}Queued for the agent<button class="linkbtn" type="button" data-fix="${c.id}" data-on="false">Undo</button></span>`
        : `${see}<button class="btn small fix" type="button" data-fix="${c.id}" data-on="true" title="${outside(c.by_email) && !c.agent_sees ? "Also lets the agent read it. " : ""}Studio offers it to the agent when someone on the team opens this project.">Fix this</button>`
    }</span>`;
  };

  const commentHtml = (c, numbered) => {
    const n = numbered ? pinNumber(c) : 0;
    const replies = state.data.comments.filter((r) => r.reply_to === c.id);
    return `<li class="comment${state.active === c.id ? " active" : ""}${c.resolved_in !== null ? " done" : ""}" data-comment="${c.id}">
      <div class="c-head">${avatar(c.by_email)}<b title="${esc(c.by_email)}">${esc(nameOf(c.by_email))}</b>
        ${editor && outside(c.by_email) ? `<span class="tag">Outside</span>` : ""}
        <span class="muted small">${ago(c.at)}</span>
        <span class="grow"></span>
        ${n > 0 ? `<span class="num" style="--pin:${colorOf(c.by_email)}">${n}</span>` : ""}
        ${numbered ? "" : `<span class="tag">Version ${c.version}</span>`}</div>
      ${c.anchor ? `<div class="c-on muted small">on ${esc(labelOf(c.anchor.file))}</div>` : ""}
      <p class="c-text">${esc(c.body)}</p>
      ${c.resolved_in !== null ? `<span class="resolved">Fixed in Version ${c.resolved_in}</span>` : ""}
      ${replies.map((r) => `<div class="reply">${avatar(r.by_email, "sm")}<div><span class="c-head"><b title="${esc(r.by_email)}">${esc(nameOf(r.by_email))}</b><span class="muted small">${ago(r.at)}</span></span><p class="c-text">${esc(r.body)}</p></div></div>`).join("")}
      <div class="c-actions">
        ${numbered ? `<button class="linkbtn" type="button" data-reply="${c.id}">Reply</button>` : ""}
        ${agentControls(c)}
      </div>
    </li>`;
  };

  const act = (work) => async () => {
    state.error = null;
    try {
      await work();
      await refresh();
    } catch (cause) {
      state.error = cause.message;
      paintSide();
    }
  };

  function paintSide() {
    document.querySelectorAll(".side-tabs [data-tab]").forEach((tab) => {
      tab.setAttribute("aria-selected", String(tab.dataset.tab === state.tab));
    });
    const side = document.getElementById("side");
    if (state.tab === "versions") {
      side.innerHTML = `<ol class="versions">${state.data.versions
        .map((v) => {
          const review = state.data.reviews.find((r) => r.version === v.version);
          const [cls, label] = review
            ? statusOf(review.team_review_people, v.released_rev)
            : [null, null];
          const count = top().filter((c) => c.version === v.version).length;
          return `<li><button type="button" data-version="${v.version}" aria-current="${v.version === state.version}">
            <span class="v-head"><b>Version ${v.version}</b>${v.released_rev ? `<span class="tag">Rev ${esc(v.released_rev)}</span>` : ""}${review && !v.released_rev ? `<span class="pill ${cls}">${label}</span>` : ""}</span>
            <span class="v-note">${esc(v.note ?? "No note")}</span>
            <span class="v-meta muted small">${avatar(v.by_email, "sm")}${esc(nameOf(v.by_email))} · ${ago(v.at)}${count > 0 ? ` · ${count} comment${count === 1 ? "" : "s"}` : ""}</span>
          </button></li>`;
        })
        .join("")}</ol>`;
      side.querySelectorAll("[data-version]").forEach((button) =>
        button.addEventListener("click", () => {
          state.version = Number(button.dataset.version);
          state.tab = "comments";
          pickFile();
          setUrl();
          paintAll();
          showFile();
        }),
      );
      return;
    }
    const review = currentReview();
    const v = versionRow(state.version);
    const mine = review?.team_review_people.find((p) => p.email === me().email);
    const earlier = earlierOpen();
    side.innerHTML = `
      ${v?.note ? `<div class="what"><span class="label">What changed</span><p>${esc(v.note)}</p></div>` : ""}
      ${
        review
          ? `<div class="review-box"><span class="label">Review</span><div class="people">${review.team_review_people
              .map(
                (p) =>
                  `<span class="person">${avatar(p.email, "sm")}${esc(nameOf(p.email))}<span class="${p.decision === "approved" ? "ok" : p.decision === "changes" ? "warn" : "muted"}">${p.decision === "approved" ? "Approved" : p.decision === "changes" ? "Changes" : "Waiting"}</span></span>`,
              )
              .join("")}</div>
            ${
              mine && !v?.released_rev
                ? `<div class="row"><button class="btn small" type="button" id="changes" ${mine.decision === "changes" ? "disabled" : ""}>Request changes</button><button class="btn small primary" type="button" id="approve" ${mine.decision === "approved" ? "disabled" : ""}>Approve</button></div>`
                : ""
            }</div>`
          : ""
      }
      ${
        here().length === 0
          ? `<div class="empty-comments">${ICON.cube}<p>No comments on this Version yet.</p><p class="muted small">Click a spot on the model to pin one there.</p></div>`
          : `<ul class="comments">${here()
              .map((c) => commentHtml(c, true))
              .join("")}</ul>`
      }
      ${
        earlier.length === 0
          ? ""
          : `<div class="earlier"><button class="linkbtn" type="button" id="earlier">${state.earlier ? "Hide" : "Show"} ${earlier.length} still open from earlier Versions</button>
            ${state.earlier ? `<ul class="comments">${earlier.map((c) => commentHtml(c, false)).join("")}</ul>` : ""}</div>`
      }
      ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}`;
    document.getElementById("approve")?.addEventListener(
      "click",
      act(() => rpc("decide_review", { p_review: review.id, p_decision: "approved" })),
    );
    document.getElementById("changes")?.addEventListener(
      "click",
      act(() => rpc("decide_review", { p_review: review.id, p_decision: "changes" })),
    );
    document.getElementById("earlier")?.addEventListener("click", () => {
      state.earlier = !state.earlier;
      paintSide();
    });
    side.querySelectorAll("[data-reply]").forEach((button) =>
      button.addEventListener("click", () => {
        state.replyTo = state.data.comments.find((c) => c.id === button.dataset.reply) ?? null;
        state.pending = null;
        paintComposer();
        paintPins();
        document.getElementById("comment")?.focus();
      }),
    );
    side.querySelectorAll("[data-see]").forEach((box) =>
      box.addEventListener(
        "change",
        act(() => rpc("let_agent_see", { p_comment: box.dataset.see, p_on: box.checked })),
      ),
    );
    side.querySelectorAll("[data-fix]").forEach((button) =>
      button.addEventListener(
        "click",
        act(() =>
          rpc("queue_fix", { p_comment: button.dataset.fix, p_on: button.dataset.on === "true" }),
        ),
      ),
    );
    side.querySelectorAll(".comment").forEach((li) =>
      li.addEventListener("click", (event) => {
        if (event.target.closest("button, input, label")) return;
        focusComment(li.dataset.comment, { scroll: false });
      }),
    );
  }

  function paintComposer() {
    const form = document.getElementById("composer");
    const draft = document.getElementById("comment")?.value ?? "";
    form.innerHTML = `
      ${state.pending ? `<span class="chip"><span class="dot" style="--pin:${colorOf(me().email)}"></span>Pinned on ${esc(labelOf(state.file ?? ""))}<button class="linkbtn" type="button" id="unpin">Remove</button></span>` : ""}
      ${state.replyTo ? `<span class="chip">Replying to ${esc(nameOf(state.replyTo.by_email))}<button class="linkbtn" type="button" id="unreply">Cancel</button></span>` : ""}
      <div class="compose-row">${avatar(me().email)}
        <textarea id="comment" rows="1" aria-label="Comment" placeholder="${state.replyTo ? "Reply" : state.pending ? "What should change here?" : "Comment, or click the model"}">${esc(draft)}</textarea>
        <button class="btn primary small" type="submit">${state.replyTo ? "Reply" : "Post"}</button></div>`;
    document.getElementById("unpin")?.addEventListener("click", () => {
      state.pending = null;
      paintComposer();
      paintPins();
    });
    document.getElementById("unreply")?.addEventListener("click", () => {
      state.replyTo = null;
      paintComposer();
    });
    const box = document.getElementById("comment");
    const grow = () => {
      box.style.height = "auto";
      box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
    };
    box.addEventListener("input", grow);
    box.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) form.requestSubmit();
    });
    grow();
  }

  document.getElementById("composer").addEventListener("submit", async (event) => {
    event.preventDefault();
    const box = document.getElementById("comment");
    const body = box.value.trim();
    if (body === "") return;
    state.error = null;
    try {
      const made = await rpc("comment_version", {
        p_project: id,
        p_version: state.replyTo?.version ?? state.version,
        p_body: body,
        p_anchor: state.pending && state.file ? { file: state.file, point: state.pending } : null,
        p_reply_to: state.replyTo?.id ?? null,
      });
      box.value = "";
      state.active = state.replyTo?.id ?? made;
      state.pending = null;
      state.replyTo = null;
      paintComposer();
      await refresh();
    } catch (cause) {
      state.error = cause.message;
      paintSide();
    }
  });

  function paintPins() {
    const pins = here()
      .filter((c) => c.anchor?.file === state.file && Array.isArray(c.anchor?.point))
      .map((c) => ({
        id: c.id,
        point: c.anchor.point,
        color: colorOf(c.by_email),
        label: String(pinNumber(c)),
        resolved: c.resolved_in !== null,
        active: state.active === c.id,
      }));
    if (state.pending) {
      pins.push({ point: state.pending, color: colorOf(me().email), label: "+", pending: true });
    }
    viewer.setPins(pins);
  }

  function focusComment(commentId, { scroll = true } = {}) {
    const c = state.data.comments.find((each) => each.id === commentId);
    if (!c) return;
    state.active = commentId;
    state.tab = "comments";
    let reload = false;
    if (c.version !== state.version) {
      state.version = c.version;
      pickFile();
      reload = true;
    }
    if (c.anchor?.file && c.anchor.file !== state.file) {
      state.file = c.anchor.file;
      reload = true;
    }
    setUrl();
    paintAll();
    if (reload) showFile();
    if (scroll) {
      document
        .querySelector(`[data-comment="${CSS.escape(commentId)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }

  const shareDialog = document.getElementById("share-dialog");
  async function paintShare() {
    const q = encodeURIComponent(id);
    const [links, guests] = await Promise.all([
      select(`team_share_links?select=token&project_id=eq.${q}`),
      select(`team_project_guests?select=email,joined_at&project_id=eq.${q}&order=joined_at`),
    ]);
    const token = links[0]?.token ?? null;
    const url = token === null ? "" : new URL(href({ link: token }), location.href).href;
    const members = state.data.team?.members ?? [];
    shareDialog.innerHTML = `<form method="dialog" class="sheet-body">
      <div class="sheet-head"><h2>Share ${esc(state.data.project.name)}</h2><button class="btn quiet small" value="close">Close</button></div>
      <div class="share-link">
        <label class="switch big"><input type="checkbox" id="link-on" ${token ? "checked" : ""}><span class="track"></span><span class="switch-text"><b>Anyone with the link</b><span class="muted small">They sign in with their email, then see the models and drawings and can comment. Never the scripts. Turning it off removes everyone who joined with it.</span></span></label>
        ${token ? `<div class="copy-row"><input readonly value="${esc(url)}" id="link-url" aria-label="Share link"><button class="btn small primary" type="button" id="copy">Copy link</button></div>` : ""}
      </div>
      ${
        guests.length === 0
          ? ""
          : `<div class="people-list"><span class="label">People with the link</span>${guests
              .map(
                (g) =>
                  `<div class="person-row">${avatar(g.email)}<span class="person-text">${esc(g.email)}<span class="muted small">Can view and comment</span></span><button class="linkbtn" type="button" data-remove="${esc(g.email)}">Remove</button></div>`,
              )
              .join("")}</div>`
      }
      <div class="people-list"><span class="label">${esc(state.data.project.teams?.name ?? "Team")}</span>${members
        .map(
          (m) =>
            `<div class="person-row">${avatar(m.email)}<span class="person-text">${esc(m.email)}<span class="muted small">${m.role === "admin" ? "Admin" : m.role === "editor" ? "Editor" : "Viewer"}</span></span></div>`,
        )
        .join("")}
      <p class="muted small">Admins invite teammates from Studio.</p></div>
    </form>`;
    shareDialog.querySelector("#link-on").addEventListener("change", async (event) => {
      await rpc("share_link", { p_project: id, p_on: event.target.checked });
      await paintShare();
    });
    shareDialog.querySelector("#copy")?.addEventListener("click", async (event) => {
      try {
        await navigator.clipboard.writeText(url);
        event.target.textContent = "Copied";
      } catch {
        shareDialog.querySelector("#link-url").select();
      }
    });
    shareDialog.querySelectorAll("[data-remove]").forEach((button) =>
      button.addEventListener("click", async () => {
        await rpc("remove_guest", { p_project: id, p_email: button.dataset.remove });
        await paintShare();
      }),
    );
  }
  document.getElementById("share")?.addEventListener("click", async () => {
    await paintShare();
    shareDialog.showModal();
  });

  document.querySelectorAll(".side-tabs [data-tab]").forEach((tab) =>
    tab.addEventListener("click", () => {
      state.tab = tab.dataset.tab;
      paintSide();
    }),
  );

  function paintAll() {
    paintTop();
    paintFiles();
    paintSide();
    paintComposer();
    paintPins();
  }

  async function showFile() {
    const file = fileObj();
    if (file === null) {
      return viewer.message(
        state.data.versions.length === 0
          ? "Nothing checked in yet."
          : "Nothing to show for this Version.",
      );
    }
    viewer.message("Loading…");
    try {
      const blob = await download(file.object);
      if (fileObj() !== file) return;
      if (isModel(file.path)) await viewer.showModel(await blob.arrayBuffer(), extOf(file.path));
      else await viewer.showFile(blob, extOf(file.path));
      paintPins();
    } catch (cause) {
      viewer.message(cause.message);
    }
  }

  // Others' comments and check-ins arrive while the page is open; a draft is never touched.
  const seenOf = (next) =>
    JSON.stringify([next.comments, next.versions, next.project.checked_out_email]);
  let shown = seenOf(data);
  const apply = (next) => {
    state.data = next;
    shown = seenOf(next);
    paintTop();
    paintFiles();
    paintSide();
    paintPins();
  };
  async function refresh() {
    const next = await loadProject(id);
    if (next !== null) apply(next);
  }
  const poll = setInterval(async () => {
    if (document.hidden) return;
    try {
      const next = await loadProject(id);
      if (next !== null && seenOf(next) !== shown) apply(next);
    } catch {}
  }, 15000);
  stopPage = () => clearInterval(poll);

  paintAll();
  await showFile();
}

render();
