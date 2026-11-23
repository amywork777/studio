// Tries every rule of a hub as Studio calls it, as an Admin, an Editor, a Viewer and an outsider.
// Local: KEY=<anon key> node check-hub.mjs, codes from Mailpit. Hosted: also API=<URL> and
// ADMIN_KEY=<service_role key>, which gets codes without email and deletes what it made.
const API = process.env.API ?? "http://127.0.0.1:54321";
const KEY = process.env.KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;
const MAIL = process.env.MAIL ?? "http://127.0.0.1:54324";
const made = { users: [], teams: [], files: [] };
const run = Date.now().toString(36);
const who = (name) => `${name}+${run}@bracket.test`;

let failures = 0;
const ok = (cond, label, extra = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
};

const call = async (method, path, { token, json, bytes } = {}) => {
  const headers = { apikey: KEY };
  if (token) headers.authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(json);
  }
  if (bytes !== undefined) {
    headers["content-type"] = "application/octet-stream";
    body = bytes;
  }
  const res = await fetch(
    `${API}${path}`,
    body === undefined ? { method, headers } : { method, headers, body },
  );
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, data };
};

const codeFor = async (email) => {
  for (let i = 0; i < 40; i++) {
    const list = await (
      await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    ).json();
    const msg = list.messages?.[0];
    if (msg) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${msg.ID}`)).json();
      const code = (full.Text || full.HTML).match(/\b(\d{6})\b/)?.[1];
      if (code) return { code, subject: full.Subject };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no code email for ${email}`);
};

const admin = (method, path, json) =>
  fetch(`${API}${path}`, {
    method,
    headers: {
      apikey: ADMIN_KEY,
      authorization: `Bearer ${ADMIN_KEY}`,
      "content-type": "application/json",
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  }).then(async (res) => ({ status: res.status, data: await res.json().catch(() => null) }));

const adminCodeFor = async (email) => {
  const user = await admin("POST", "/auth/v1/admin/users", { email, email_confirm: true });
  if (user.status >= 300) throw new Error(`admin user ${user.status} ${JSON.stringify(user.data)}`);
  made.users.push(user.data.id);
  const link = await admin("POST", "/auth/v1/admin/generate_link", { type: "magiclink", email });
  if (!link.data?.email_otp)
    throw new Error(`admin code ${link.status} ${JSON.stringify(link.data)}`);
  return { code: link.data.email_otp, subject: "(admin code, no email)" };
};

const signIn = async (email) => {
  let code;
  let subject;
  if (ADMIN_KEY) {
    ({ code, subject } = await adminCodeFor(email));
  } else {
    const sent = await call("POST", "/auth/v1/otp", { json: { email, create_user: true } });
    if (sent.status !== 200) throw new Error(`otp ${sent.status} ${JSON.stringify(sent.data)}`);
    ({ code, subject } = await codeFor(email));
  }
  const wrong = await call("POST", "/auth/v1/verify", {
    json: { type: "email", email, token: "000000" },
  });
  const v = await call("POST", "/auth/v1/verify", { json: { type: "email", email, token: code } });
  if (v.status !== 200) throw new Error(`verify ${v.status} ${JSON.stringify(v.data)}`);
  return { email, token: v.data.access_token, refresh: v.data.refresh_token, subject, wrong };
};
const rpc = (p, fn, args = {}) =>
  call("POST", `/rest/v1/rpc/${fn}`, { token: p.token, json: args });
const refusal = (r) => (r.status >= 400 ? r.data?.message : null);

const dana = await signIn(who("dana"));
ok(dana.token, "sign in with the emailed code", `subject "${dana.subject}"`);
ok(
  dana.wrong.status >= 400,
  "a wrong code is refused",
  `${dana.wrong.status} ${dana.wrong.data?.error_code}`,
);

const refreshed = await call("POST", "/auth/v1/token?grant_type=refresh_token", {
  json: { refresh_token: dana.refresh },
});
ok(refreshed.status === 200 && refreshed.data.access_token, "session refresh works");
dana.token = refreshed.data.access_token;

const team = (await rpc(dana, "create_team", { p_name: "Bracket Co" })).data;
made.teams.push(team);
ok(typeof team === "string", "make a team", team);

ok(
  (await rpc(dana, "invite_member", { p_team: team, p_email: who("amy"), p_role: "editor" }))
    .status < 300,
  "invite an editor",
);
ok(
  (await rpc(dana, "invite_member", { p_team: team, p_email: who("vic"), p_role: "viewer" }))
    .status < 300,
  "invite a viewer",
);
ok(
  (await rpc(dana, "invite_member", { p_team: team, p_email: who("eli"), p_role: "editor" }))
    .status < 300,
  "third paid seat",
);
const full = await rpc(dana, "invite_member", {
  p_team: team,
  p_email: who("fay"),
  p_role: "editor",
});
ok(refusal(full) === "seats-full", "fourth paid seat refused", refusal(full));
ok(
  (await rpc(dana, "invite_member", { p_team: team, p_email: who("gus"), p_role: "viewer" }))
    .status < 300,
  "viewers stay free past the seats",
);
ok(
  (await rpc(dana, "remove_member", { p_team: team, p_email: who("eli") })).status < 300,
  "withdraw an invite",
);

const amy = await signIn(who("amy"));
const vic = await signIn(who("vic"));
const olly = await signIn(who("olly"));
ok(
  (await rpc(amy, "accept_invites")).data === 1,
  "editor's invite turns into membership on sign-in",
);
ok(
  (await rpc(vic, "accept_invites")).data === 1,
  "viewer's invite turns into membership on sign-in",
);
const amyTeams = (await rpc(amy, "my_teams")).data;
ok(
  amyTeams.length === 1 && amyTeams[0].role === "editor" && amyTeams[0].invites.length === 0,
  "editor sees the team, not its invites",
);
const danaTeams = (await rpc(dana, "my_teams")).data;
ok(
  danaTeams[0].invites.length === 1,
  "admin sees the open invite",
  JSON.stringify(danaTeams[0].invites),
);
ok((await rpc(olly, "my_teams")).data.length === 0, "outsider sees no teams");
const sneak = await rpc(olly, "invite_member", {
  p_team: team,
  p_email: who("olly"),
  p_role: "admin",
});
ok(refusal(sneak) === "not-allowed", "outsider cannot invite themselves", refusal(sneak));
const editorInvite = await rpc(amy, "invite_member", {
  p_team: team,
  p_email: who("hal"),
  p_role: "editor",
});
ok(refusal(editorInvite) === "not-allowed", "editor cannot invite", refusal(editorInvite));

const project = (await rpc(amy, "share_project", { p_team: team, p_name: "bracket" })).data;
ok(typeof project === "string", "editor shares a project", project);
const viewerShare = await rpc(vic, "share_project", { p_team: team, p_name: "nope" });
ok(refusal(viewerShare) === "not-allowed", "viewer cannot share", refusal(viewerShare));

const object = `${team}/${project}/1-${run}.bundle`;
made.files.push(object);
const up = await call("POST", `/storage/v1/object/projects/${object}`, {
  token: amy.token,
  bytes: new TextEncoder().encode("bundle v1"),
});
ok(up.status === 200, "editor uploads a check-in's files", `${up.status}`);
const v1 = await rpc(amy, "check_in", {
  p_project: project,
  p_base: 0,
  p_head: "aaa",
  p_bundle: object,
  p_note: "first",
  p_keep: false,
});
ok(v1.data === 1, "check in Version 1", JSON.stringify(v1.data));

const vicUp = await call("POST", `/storage/v1/object/projects/${team}/${project}/x-${run}.bundle`, {
  token: vic.token,
  bytes: new TextEncoder().encode("x"),
});
ok(vicUp.status >= 400, "viewer cannot upload", `${vicUp.status}`);
const ollyUp = await call(
  "POST",
  `/storage/v1/object/projects/${team}/${project}/y-${run}.bundle`,
  { token: olly.token, bytes: new TextEncoder().encode("x") },
);
ok(ollyUp.status >= 400, "outsider cannot upload", `${ollyUp.status}`);
const vicGet = await call("GET", `/storage/v1/object/authenticated/projects/${object}`, {
  token: vic.token,
});
ok(vicGet.status === 200 && vicGet.data === "bundle v1", "viewer downloads the latest Version");
const ollyGet = await call("GET", `/storage/v1/object/authenticated/projects/${object}`, {
  token: olly.token,
});
ok(ollyGet.status >= 400, "outsider cannot download", `${ollyGet.status}`);
const anonGet = await call("GET", `/storage/v1/object/public/projects/${object}`);
ok(anonGet.status >= 400, "no public link to project files", `${anonGet.status}`);

const ollyRows = await call("GET", `/rest/v1/team_projects?select=id`, { token: olly.token });
ok(Array.isArray(ollyRows.data) && ollyRows.data.length === 0, "outsider reads no projects");
const ollyVersions = await call(
  "GET",
  `/rest/v1/team_project_versions?select=version&project_id=eq.${project}`,
  { token: olly.token },
);
ok(
  Array.isArray(ollyVersions.data) && ollyVersions.data.length === 0,
  "outsider reads no check-ins",
);
const anonRows = await call("GET", `/rest/v1/team_projects?select=id`);
ok(
  anonRows.status >= 400 || anonRows.data.length === 0,
  "signed-out reads no projects",
  `${anonRows.status}`,
);
const forge = await call("PATCH", `/rest/v1/team_projects?id=eq.${project}`, {
  token: amy.token,
  json: { version: 99 },
});
const after = (
  await call("GET", `/rest/v1/team_projects?select=version&id=eq.${project}`, { token: amy.token })
).data[0];
ok(
  after.version === 1,
  "nobody edits a project row directly",
  `PATCH ${forge.status}, version ${after.version}`,
);
const amyFake = await call("POST", `/rest/v1/team_members`, {
  token: amy.token,
  json: {
    team_id: team,
    user_id: "00000000-0000-0000-0000-000000000000",
    email: "x",
    role: "admin",
  },
});
ok(amyFake.status >= 400, "nobody adds themselves to a team directly", `${amyFake.status}`);

const vicOut = await rpc(vic, "check_out", { p_project: project });
ok(refusal(vicOut) === "not-allowed", "viewer cannot check out", refusal(vicOut));
ok((await rpc(dana, "check_out", { p_project: project })).status < 300, "admin checks out");
const amyOut = await rpc(amy, "check_out", { p_project: project });
ok(
  refusal(amyOut) === "checked-out" && amyOut.data.details === dana.email,
  "second check-out names the holder",
  `${refusal(amyOut)} ${amyOut.data?.details}`,
);
const amySneak = await rpc(amy, "check_in", {
  p_project: project,
  p_base: 1,
  p_head: "bbb",
  p_bundle: object,
  p_note: "",
  p_keep: false,
});
ok(refusal(amySneak) === "checked-out", "only the holder checks in", refusal(amySneak));
const stale = await rpc(dana, "check_in", {
  p_project: project,
  p_base: 0,
  p_head: "bbb",
  p_bundle: object,
  p_note: "",
  p_keep: false,
});
ok(refusal(stale) === "changed-elsewhere", "check-in on an old Version refused", refusal(stale));
const foreign = await rpc(dana, "check_in", {
  p_project: project,
  p_base: 1,
  p_head: "bbb",
  p_bundle: "other/place.bundle",
  p_note: "",
  p_keep: false,
});
ok(
  refusal(foreign) === "not-allowed",
  "check-in must point at this project's files",
  refusal(foreign),
);
const v2 = await rpc(dana, "check_in", {
  p_project: project,
  p_base: 1,
  p_head: "bbb",
  p_bundle: object,
  p_note: "  ",
  p_keep: true,
});
ok(v2.data === 2, "holder checks in Version 2 and keeps it", JSON.stringify(v2.data));

const amyRelease = await rpc(amy, "release_project", { p_project: project });
ok(
  refusal(amyRelease) === "not-allowed",
  "editor cannot take back someone else's check-out",
  refusal(amyRelease),
);
ok(
  (await rpc(amy, "share_project", { p_team: team, p_name: "plate" })).status < 300,
  "second project",
);
const plate = (
  await call("GET", `/rest/v1/team_projects?select=id&name=eq.plate`, { token: dana.token })
).data[0].id;
ok(
  (await rpc(dana, "release_project", { p_project: plate })).status < 300,
  "admin takes back an editor's check-out",
);

const history = (
  await call(
    "GET",
    `/rest/v1/team_project_versions?select=version,by_email,note&project_id=eq.${project}&order=version.desc`,
    { token: vic.token },
  )
).data;
ok(
  history.length === 2 &&
    history[0].by_email === dana.email &&
    history[0].note === null &&
    history[1].note === "first",
  "check-ins with who and note",
  JSON.stringify(history),
);

ok((await rpc(amy, "check_out", { p_project: plate })).status < 300, "editor checks out the plate");
ok(
  (await rpc(dana, "remove_member", { p_team: team, p_email: amy.email })).status < 300,
  "admin removes the editor",
);
const plateRow = (
  await call("GET", `/rest/v1/team_projects?select=checked_out_email&id=eq.${plate}`, {
    token: dana.token,
  })
).data[0];
ok(plateRow.checked_out_email === null, "removing someone lets go of their check-outs");
ok(
  (await call("GET", `/rest/v1/team_projects?select=id`, { token: amy.token })).data.length === 0,
  "removed editor no longer sees projects",
);
const lastAdmin = await rpc(dana, "remove_member", { p_team: team, p_email: dana.email });
ok(refusal(lastAdmin) === "last-admin", "the last admin cannot leave", refusal(lastAdmin));
ok(
  (await rpc(vic, "remove_member", { p_team: team, p_email: vic.email })).status < 300,
  "a viewer leaves on their own",
);

if (ADMIN_KEY) {
  await admin("DELETE", "/storage/v1/object/projects", { prefixes: made.files });
  for (const id of made.teams) await admin("DELETE", `/rest/v1/teams?id=eq.${id}`);
  for (const id of made.users) await admin("DELETE", `/auth/v1/admin/users/${id}`);
  const left = await admin("GET", `/rest/v1/teams?select=id&id=in.(${made.teams.join(",")})`);
  console.log(
    `\ncleaned up: ${made.users.length} people, ${made.teams.length} team, ${made.files.length} file; teams left: ${left.data?.length}`,
  );
}
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
