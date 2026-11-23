// Studio Review: a reviewer without Studio signs in with an emailed code, sees a Version's models
// and drawings, pins comments to a spot on a model, and approves or requests changes. It talks to
// the team hub the way Studio does; the hub's rules decide what each person may see and do.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const params = new URLSearchParams(location.search);
// A local test hub may stand in for the hosted one, and only ever a local one.
const LOCAL_HUB = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;
const override = params.get("hub");
const HUB =
  override !== null && LOCAL_HUB.test(override)
    ? { url: override, key: params.get("key") ?? "" }
    : window.STUDIO_HUB;
const SESSION_KEY = `studio-review:${HUB.url}`;

const app = document.getElementById("app");
const whoEl = document.getElementById("who");

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const hue = (email) => {
  let hash = 0;
  for (const char of email.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 190 + (hash % 140);
};
const colorOf = (email) => `hsl(${hue(email)} 48% 46%)`;
const avatar = (email) =>
  `<span class="av" style="background:${colorOf(email)}" aria-hidden="true">${esc(email.charAt(0))}</span>`;
const ago = (iso) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};
const extOf = (path) => path.split(".").pop().toLowerCase();
const isModel = (path) => ["stl", "glb"].includes(extOf(path));

// The sign-in, kept in this browser.
const storage = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    } catch {
      return null;
    }
  },
  set(value) {
    try {
      if (value === null) localStorage.removeItem(SESSION_KEY);
      else localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    } catch {}
  },
};
let session = storage.get();

const REFUSALS = {
  "not-allowed": "Your role on this team does not allow that.",
  "not-a-reviewer": "Only the people asked to review it can approve it.",
  "already-released": "This Version is already released.",
  empty: "Write a comment first.",
  "not-found": "That is no longer on the team.",
};
const words = (data) => {
  if (data?.error_code === "otp_expired")
    return "That code is wrong or has run out. Ask for a new one.";
  if (data?.error_code === "over_email_send_rate_limit")
    return "A code was just sent. Wait a minute, then ask again.";
  return REFUSALS[data?.message] ?? "The team hub refused that. Try again.";
};

async function fresh() {
  if (session === null) throw new Error("Sign in first.");
  if (session.expiresAt - 90 > Date.now() / 1000) return session;
  const res = await fetch(`${HUB.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: HUB.key, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh }),
  });
  if (!res.ok) {
    signOut();
    throw new Error("Sign in again.");
  }
  const body = await res.json();
  session = {
    ...session,
    access: body.access_token,
    refresh: body.refresh_token,
    expiresAt: Date.now() / 1000 + body.expires_in,
  };
  storage.set(session);
  return session;
}

async function api(method, path, { json, auth = true } = {}) {
  const headers = { apikey: HUB.key };
  if (auth) headers.authorization = `Bearer ${(await fresh()).access}`;
  if (json !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${HUB.url}${path}`, {
    method,
    headers,
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  if (res.status === 401 && auth) {
    signOut();
    throw new Error("Sign in again.");
  }
  const text = await res.text();
  let data = null;
  try {
    data = text === "" ? null : JSON.parse(text);
  } catch {}
  if (!res.ok) throw new Error(words(data));
  return data;
}
const select = (query) => api("GET", `/rest/v1/${query}`);
const rpc = (fn, args) => api("POST", `/rest/v1/rpc/${fn}`, { json: args });
async function download(object) {
  const res = await fetch(
    `${HUB.url}/storage/v1/object/authenticated/projects/${object.split("/").map(encodeURIComponent).join("/")}`,
    { headers: { apikey: HUB.key, authorization: `Bearer ${(await fresh()).access}` } },
  );
  if (!res.ok) throw new Error("This file could not be loaded.");
  return res.blob();
}

function signOut() {
  session = null;
  storage.set(null);
  render();
}

function header() {
  whoEl.innerHTML =
    session === null
      ? ""
      : `${avatar(session.email)}<span>${esc(session.email)}</span><button class="btn ghost" id="signout" type="button">Sign out</button>`;
  document.getElementById("signout")?.addEventListener("click", signOut);
}

function render() {
  header();
  if (session === null) return signInView();
  const review = params.get("review");
  return review ? reviewView(review) : inboxView();
}

// Sign in: an email, then the code it receives.
function signInView(sentTo = null, error = null) {
  app.innerHTML = `<section class="card narrow">
    <h1>Review a Version</h1>
    <p class="muted">Sign in with the email your team invited. Studio sends a 6-digit code; there is no password.</p>
    ${
      sentTo === null
        ? `<form id="email-form" class="row"><label class="small muted" for="email">Email</label>
            <input type="email" id="email" required autocomplete="email" placeholder="you@company.com">
            <button class="btn primary" type="submit">Email me a code</button></form>`
        : `<form id="code-form" class="row"><span class="small muted">Code sent to ${esc(sentTo)}.</span>
            <input type="text" id="code" class="code" inputmode="numeric" autocomplete="one-time-code" required placeholder="123456">
            <button class="btn primary" type="submit">Sign in</button>
            <button class="btn ghost" type="button" id="again">Use another email</button></form>`
    }
    ${error ? `<p class="error">${esc(error)}</p>` : ""}
  </section>`;
  document.getElementById("email-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim().toLowerCase();
    try {
      await api("POST", "/auth/v1/otp", { json: { email, create_user: true }, auth: false });
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
      const body = await api("POST", "/auth/v1/verify", {
        json: { type: "email", email: sentTo, token },
        auth: false,
      });
      session = {
        access: body.access_token,
        refresh: body.refresh_token,
        expiresAt: Date.now() / 1000 + body.expires_in,
        email: body.user?.email ?? sentTo,
      };
      storage.set(session);
      await rpc("accept_invites", {});
      render();
    } catch (cause) {
      signInView(sentTo, cause.message);
    }
  });
  document.getElementById("email")?.focus();
  document.getElementById("code")?.focus();
}

const statusOf = (people, releasedRev) => {
  if (releasedRev) return ["released", `Rev ${releasedRev}`];
  const decisions = people.map((p) => p.decision);
  if (decisions.includes("changes")) return ["changes", "Changes requested"];
  if (decisions.length > 0 && decisions.every((d) => d === "approved"))
    return ["approved", "Approved"];
  return ["review", "In review"];
};

// What this person was asked to review, newest first.
async function inboxView() {
  app.innerHTML = `<section class="card"><h1>Waiting for your review</h1><p class="muted">Loading…</p></section>`;
  try {
    const mine = await select(
      `team_review_people?select=review_id,decision&email=eq.${encodeURIComponent(session.email)}`,
    );
    if (mine.length === 0) {
      app.innerHTML = `<section class="card"><h1>Waiting for your review</h1>
        <p class="muted">Nothing yet. When a teammate checks in a Version and asks you to review it, it shows here, and their review link opens it directly.</p></section>`;
      return;
    }
    const ids = mine.map((m) => m.review_id).join(",");
    const reviews = await select(
      `team_reviews?select=id,project_id,version,requested_email,created_at,team_review_people(email,decision)&id=in.(${ids})&order=created_at.desc`,
    );
    const projectIds = [...new Set(reviews.map((r) => r.project_id))].join(",");
    const projects = await select(`team_projects?select=id,name,teams(name)&id=in.(${projectIds})`);
    const byId = new Map(projects.map((p) => [p.id, p]));
    app.innerHTML = `<section class="card"><h1>Waiting for your review</h1><ul class="list">${reviews
      .map((r) => {
        const p = byId.get(r.project_id);
        const me = r.team_review_people.find((x) => x.email === session.email);
        const [cls, label] = statusOf(r.team_review_people, null);
        const yours =
          me?.decision === "approved"
            ? "You approved"
            : me?.decision === "changes"
              ? "You requested changes"
              : "Waiting for you";
        return `<li><a href="?review=${encodeURIComponent(r.id)}${override ? `&hub=${encodeURIComponent(HUB.url)}&key=${encodeURIComponent(HUB.key)}` : ""}">
          ${avatar(r.requested_email)}<b>${esc(p?.name ?? "Project")}</b><span class="ver">Version ${r.version}</span>
          <span class="pill ${cls}">${label}</span><span class="small muted">${esc(p?.teams?.name ?? "")} · asked by ${esc(r.requested_email)} ${ago(r.created_at)} · ${yours}</span></a></li>`;
      })
      .join("")}</ul></section>`;
  } catch (cause) {
    app.innerHTML = `<section class="card"><h1>Waiting for your review</h1><p class="error">${esc(cause.message)}</p></section>`;
  }
}

const COMMENT_COLS = "id,by_email,body,at,anchor,reply_to,resolved_in";
const REVIEW_COLS = `id,project_id,version,requested_email,created_at,team_review_people(email,decision),team_review_comments(${COMMENT_COLS})`;

// One review: the Version's files on the left, decisions and comments on the right.
async function reviewView(id) {
  app.innerHTML = `<section class="card"><p class="muted">Loading the review…</p></section>`;
  let data;
  try {
    data = await loadReview(id);
  } catch (cause) {
    app.innerHTML = `<section class="card"><p class="error">${esc(cause.message)}</p><a href="./">All reviews</a></section>`;
    return;
  }
  if (data === null) {
    app.innerHTML = `<section class="card"><h1>Review not found</h1><p class="muted">It is not on a team this email is on. Sign in with the email that was invited.</p></section>`;
    return;
  }
  const state = {
    data,
    file: data.files.find((f) => isModel(f.path)) ?? data.files[0] ?? null,
    pending: null,
    replyTo: null,
    error: null,
  };
  app.innerHTML = `<div class="head" id="head"></div><div class="work">
    <section class="card"><div class="files" id="files" role="group" aria-label="Files"></div>
      <div class="viewer" id="viewer" tabindex="0" aria-label="The selected file"></div></section>
    <section class="card" id="side"></section></div>`;
  const viewer = makeViewer(document.getElementById("viewer"), (point) => {
    if (!canComment(state.data)) return;
    state.pending = point;
    state.replyTo = null;
    paintSide(state);
    paintPins(state, viewer);
    document.getElementById("comment")?.focus();
  });
  const refresh = async () => {
    state.data = await loadReview(id);
    paint(state, viewer, refresh);
  };
  paint(state, viewer, refresh);
  await showFile(state, viewer);
}

async function loadReview(id) {
  const [review] = await select(
    `team_reviews?select=${REVIEW_COLS}&id=eq.${encodeURIComponent(id)}&team_review_people.order=email.asc&team_review_comments.order=at.asc`,
  );
  if (review === undefined) return null;
  const project = (
    await select(`team_projects?select=id,name,version,teams(name)&id=eq.${review.project_id}`)
  )[0];
  const version = (
    await select(
      `team_project_versions?select=version,note,by_email,at,released_rev&project_id=eq.${review.project_id}&version=eq.${review.version}`,
    )
  )[0];
  const files = await select(
    `team_version_files?select=path,object,size&project_id=eq.${review.project_id}&version=eq.${review.version}&order=path`,
  );
  const previous =
    (
      await select(
        `team_reviews?select=${REVIEW_COLS}&project_id=eq.${review.project_id}&version=lt.${review.version}&order=version.desc&limit=1&team_review_comments.order=at.asc`,
      )
    )[0] ?? null;
  return { review, project, version, files, previous };
}

const canDecide = (data) =>
  !data.version?.released_rev &&
  data.review.team_review_people.some((p) => p.email === session.email);
const canComment = (data) => !data.version?.released_rev;

function paint(state, viewer, refresh) {
  const { review, project, version } = state.data;
  const [cls, label] = statusOf(review.team_review_people, version?.released_rev);
  document.getElementById("head").innerHTML = `<h1>${esc(project?.name ?? "Project")}</h1>
    <span class="ver">Version ${review.version}${project && project.version > review.version ? ` (Version ${project.version} is newer)` : ""}</span>
    <span class="pill ${cls}">${label}</span>
    <span class="small muted">${esc(project?.teams?.name ?? "")} · asked by ${esc(review.requested_email)} ${ago(review.created_at)}</span>
    <a class="small" href="./${override ? `?hub=${encodeURIComponent(HUB.url)}&key=${encodeURIComponent(HUB.key)}` : ""}">All reviews</a>`;
  document.getElementById("files").innerHTML =
    state.data.files.length === 0
      ? `<span class="small muted">This Version has no model or drawing files to show.</span>`
      : state.data.files
          .map(
            (f) =>
              `<button class="file" type="button" data-path="${esc(f.path)}" aria-pressed="${state.file?.path === f.path}">${esc(f.path)}</button>`,
          )
          .join("");
  document.querySelectorAll(".file").forEach((button) =>
    button.addEventListener("click", async () => {
      state.file = state.data.files.find((f) => f.path === button.dataset.path) ?? null;
      state.pending = null;
      paint(state, viewer, refresh);
      await showFile(state, viewer);
    }),
  );
  state.refresh = refresh;
  paintSide(state);
  paintPins(state, viewer);
}

const topLevel = (review) => review.team_review_comments.filter((c) => c.reply_to === null);
const pinNumber = (state, comment) =>
  topLevel(state.data.review)
    .filter((c) => c.anchor?.point)
    .findIndex((c) => c.id === comment.id) + 1;

function commentHtml(state, comment, all, numbered) {
  const n = numbered ? pinNumber(state, comment) : 0;
  const replies = all.filter((c) => c.reply_to === comment.id);
  return `<li class="comment">${avatar(comment.by_email)}<div class="body">
    <span class="meta"><b>${esc(comment.by_email)}</b>${ago(comment.at)}
      ${n > 0 ? `<span class="num" style="background:${colorOf(comment.by_email)}">${n}</span>` : ""}
      ${comment.anchor ? `<span>on ${esc(comment.anchor.file)}</span>` : ""}
      ${comment.resolved_in ? `<span class="pill approved">Resolved in Version ${comment.resolved_in}</span>` : ""}
      ${numbered && canComment(state.data) ? `<button class="linkbtn" type="button" data-reply="${comment.id}">Reply</button>` : ""}</span>
    <span class="text">${esc(comment.body)}</span>
    ${replies.map((r) => `<div class="reply">${avatar(r.by_email)}<div class="body"><span class="meta"><b>${esc(r.by_email)}</b>${ago(r.at)}</span><span class="text">${esc(r.body)}</span></div></div>`).join("")}
  </div></li>`;
}

function paintSide(state) {
  const { review, version, previous } = state.data;
  const side = document.getElementById("side");
  const me = review.team_review_people.find((p) => p.email === session.email);
  const answered =
    previous === null
      ? []
      : previous.team_review_comments.filter(
          (c) => c.reply_to === null && c.resolved_in === review.version,
        );
  side.innerHTML = `
    ${version ? `<div><h2>What changed</h2><p>${esc(version.note ?? "No note")}</p><p class="small muted">${esc(version.by_email)} checked it in ${ago(version.at)}</p></div>` : ""}
    ${answered.length > 0 ? `<div class="answered"><h2>Answered since the review of Version ${previous.version}</h2><ul class="comments">${answered.map((c) => commentHtml(state, c, previous.team_review_comments, false)).join("")}</ul></div>` : ""}
    <div><h2>Reviewers</h2><div class="people">${review.team_review_people
      .map(
        (p) => `<span>${avatar(p.email)}${esc(p.email)}${p.email === session.email ? " (you)" : ""}
        <span class="${p.decision === "approved" ? "decided-ok" : p.decision === "changes" ? "decided-changes" : "muted"}">${p.decision === "approved" ? "Approved" : p.decision === "changes" ? "Requested changes" : "Not yet"}</span></span>`,
      )
      .join("")}</div></div>
    ${
      canDecide(state.data)
        ? `<div class="row">
      <button class="btn warn" type="button" id="changes" ${me?.decision === "changes" ? "disabled" : ""}>Request changes</button>
      <button class="btn ok" type="button" id="approve" ${me?.decision === "approved" ? "disabled" : ""}>Approve</button></div>`
        : ""
    }
    <div><h2>Comments</h2>${
      topLevel(review).length === 0
        ? `<p class="small muted">No comments yet.${canComment(state.data) ? " Click the model to pin one to a spot, or write one below." : ""}</p>`
        : `<ul class="comments">${topLevel(review)
            .map((c) => commentHtml(state, c, review.team_review_comments, true))
            .join("")}</ul>`
    }</div>
    ${
      canComment(state.data)
        ? `<form id="comment-form" class="row">
      ${state.pending ? `<span class="small">Pinned on ${esc(state.file?.path ?? "")}. <button class="linkbtn" type="button" id="unpin">Remove pin</button></span>` : ""}
      ${state.replyTo ? `<span class="small">Replying to ${esc(state.replyTo.by_email)}. <button class="linkbtn" type="button" id="unreply">Cancel</button></span>` : ""}
      <textarea id="comment" aria-label="Comment" placeholder="${state.replyTo ? "Your reply" : "What should change, for example: wall looks thin for the load"}"></textarea>
      <button class="btn primary" type="submit">${state.replyTo ? "Reply" : "Comment"}</button></form>`
        : `<p class="small muted">Released as Rev ${esc(version?.released_rev)}. Reviews close at release.</p>`
    }
    ${state.error ? `<p class="error">${esc(state.error)}</p>` : ""}`;
  const act = (work) => async () => {
    state.error = null;
    try {
      await work();
      await state.refresh();
    } catch (cause) {
      state.error = cause.message;
      paintSide(state);
    }
  };
  document.getElementById("approve")?.addEventListener(
    "click",
    act(() => rpc("decide_review", { p_review: review.id, p_decision: "approved" })),
  );
  document.getElementById("changes")?.addEventListener(
    "click",
    act(() => rpc("decide_review", { p_review: review.id, p_decision: "changes" })),
  );
  document.getElementById("unpin")?.addEventListener("click", () => {
    state.pending = null;
    paintSide(state);
    state.repaintPins?.();
  });
  document.getElementById("unreply")?.addEventListener("click", () => {
    state.replyTo = null;
    paintSide(state);
  });
  side.querySelectorAll("[data-reply]").forEach((button) =>
    button.addEventListener("click", () => {
      state.replyTo =
        review.team_review_comments.find((c) => c.id === button.dataset.reply) ?? null;
      state.pending = null;
      paintSide(state);
      document.getElementById("comment")?.focus();
    }),
  );
  document.getElementById("comment-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const body = document.getElementById("comment").value.trim();
    if (body === "") return;
    act(async () => {
      await rpc("comment_review", {
        p_review: review.id,
        p_body: body,
        p_anchor:
          state.pending && state.file ? { file: state.file.path, point: state.pending } : null,
        p_reply_to: state.replyTo?.id ?? null,
      });
      state.pending = null;
      state.replyTo = null;
    })();
  });
}

function paintPins(state, viewer) {
  state.repaintPins = () => paintPins(state, viewer);
  const pins = topLevel(state.data.review)
    .filter((c) => c.anchor?.file === state.file?.path && Array.isArray(c.anchor?.point))
    .map((c) => ({
      point: c.anchor.point,
      color: colorOf(c.by_email),
      label: String(pinNumber(state, c)),
      resolved: c.resolved_in !== null,
    }));
  if (state.pending)
    pins.push({ point: state.pending, color: colorOf(session.email), label: "+", pending: true });
  viewer.setPins(pins);
}

async function showFile(state, viewer) {
  const file = state.file;
  if (file === null) return viewer.clear("Nothing to show.");
  viewer.clear("Loading…");
  try {
    const blob = await download(file.object);
    if (state.file !== file) return;
    if (isModel(file.path)) await viewer.showModel(await blob.arrayBuffer(), extOf(file.path));
    else viewer.showFile(blob, extOf(file.path));
    paintPins(state, viewer);
  } catch (cause) {
    viewer.clear(cause.message);
  }
}

// The 3D view: orbit to look around, click the model to pick a spot for a pin.
function makeViewer(container, onPick) {
  let renderer = null;
  let scene,
    camera,
    controls,
    model = null;
  let pins = [];
  const pinLayer = document.createElement("div");
  const hint = document.createElement("span");
  hint.className = "hint";

  const ensure3d = () => {
    if (renderer !== null) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100000);
    scene.add(camera);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a99ab, 1.2));
    const light = new THREE.DirectionalLight(0xffffff, 1.6);
    light.position.set(1, 1.5, 2);
    camera.add(light);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.addEventListener("change", draw);
    let down = null;
    renderer.domElement.addEventListener("pointerdown", (e) => {
      down = [e.clientX, e.clientY];
    });
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (
        down === null ||
        Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 ||
        model === null
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObject(model, true)[0];
      if (!hit) return;
      const local = model.worldToLocal(hit.point.clone());
      onPick([round(local.x), round(local.y), round(local.z)]);
    });
    new ResizeObserver(resize).observe(container);
  };
  const round = (n) => Math.round(n * 1000) / 1000;
  const resize = () => {
    if (renderer === null) return;
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    draw();
  };
  function draw() {
    if (renderer === null) return;
    renderer.render(scene, camera);
    const rect = container.getBoundingClientRect();
    pinLayer.innerHTML = "";
    if (model === null) return;
    for (const pin of pins) {
      const at = model.localToWorld(new THREE.Vector3(...pin.point)).project(camera);
      if (at.z > 1) continue;
      const el = document.createElement("span");
      el.className = `pin${pin.pending ? " pending" : ""}${pin.resolved ? " resolved" : ""}`;
      el.style.background = pin.color;
      el.style.left = `${((at.x + 1) / 2) * rect.width}px`;
      el.style.top = `${((1 - at.y) / 2) * rect.height}px`;
      el.innerHTML = `<span>${esc(pin.label)}</span>`;
      pinLayer.appendChild(el);
    }
  }
  const reset = (message) => {
    container.innerHTML = "";
    hint.textContent = message ?? "";
    if (message) container.appendChild(hint);
  };
  return {
    clear(message) {
      if (model !== null) scene.remove(model);
      model = null;
      reset(message);
    },
    async showModel(buffer, ext) {
      ensure3d();
      reset();
      container.append(renderer.domElement, pinLayer, hint);
      hint.textContent = "Drag to turn · scroll to zoom · click the model to pin a comment";
      if (model !== null) scene.remove(model);
      let object;
      if (ext === "stl") {
        const geometry = new STLLoader().parse(buffer);
        geometry.computeVertexNormals();
        object = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: 0xa9bccd, metalness: 0.15, roughness: 0.55 }),
        );
      } else {
        object = await new Promise((resolve, reject) =>
          new GLTFLoader().parse(buffer, "", (gltf) => resolve(gltf.scene), reject),
        );
      }
      model = new THREE.Group();
      model.add(object);
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      object.position.sub(center);
      model.position.set(0, 0, 0);
      scene.add(model);
      const size = box.getSize(new THREE.Vector3()).length() || 1;
      camera.near = size / 1000;
      camera.far = size * 100;
      camera.position.set(size * 0.9, size * 0.6, size * 0.9);
      controls.target.set(0, 0, 0);
      controls.update();
      resize();
    },
    showFile(blob, ext) {
      reset();
      const url = URL.createObjectURL(blob);
      if (ext === "pdf") {
        const frame = document.createElement("iframe");
        frame.src = url;
        frame.title = "Drawing";
        container.appendChild(frame);
      } else {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "Image";
        container.appendChild(img);
      }
    },
    setPins(next) {
      pins = next;
      draw();
    },
  };
}

render();
