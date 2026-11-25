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
  }).then(async (res) => ({
    status: res.status,
    data: await res.json().catch(() => null),
  }));

const adminCodeFor = async (email) => {
  const user = await admin("POST", "/auth/v1/admin/users", {
    email,
    email_confirm: true,
  });
  if (user.status >= 300) throw new Error(`admin user ${user.status} ${JSON.stringify(user.data)}`);
  made.users.push(user.data.id);
  const link = await admin("POST", "/auth/v1/admin/generate_link", {
    type: "magiclink",
    email,
  });
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
    const sent = await call("POST", "/auth/v1/otp", {
      json: { email, create_user: true },
    });
    if (sent.status !== 200) throw new Error(`otp ${sent.status} ${JSON.stringify(sent.data)}`);
    ({ code, subject } = await codeFor(email));
  }
  const wrong = await call("POST", "/auth/v1/verify", {
    json: { type: "email", email, token: "000000" },
  });
  const v = await call("POST", "/auth/v1/verify", {
    json: { type: "email", email, token: code },
  });
  if (v.status !== 200) throw new Error(`verify ${v.status} ${JSON.stringify(v.data)}`);
  return {
    email,
    token: v.data.access_token,
    refresh: v.data.refresh_token,
    subject,
    wrong,
  };
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
  (
    await rpc(dana, "invite_member", {
      p_team: team,
      p_email: who("amy"),
      p_role: "editor",
    })
  ).status < 300,
  "invite an editor",
);
ok(
  (
    await rpc(dana, "invite_member", {
      p_team: team,
      p_email: who("vic"),
      p_role: "viewer",
    })
  ).status < 300,
  "invite a viewer",
);
ok(
  (
    await rpc(dana, "invite_member", {
      p_team: team,
      p_email: who("eli"),
      p_role: "editor",
    })
  ).status < 300,
  "third paid seat",
);
const full = await rpc(dana, "invite_member", {
  p_team: team,
  p_email: who("fay"),
  p_role: "editor",
});
ok(refusal(full) === "seats-full", "fourth paid seat refused", refusal(full));
ok(
  (
    await rpc(dana, "invite_member", {
      p_team: team,
      p_email: who("gus"),
      p_role: "viewer",
    })
  ).status < 300,
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
const viewerShare = await rpc(vic, "share_project", {
  p_team: team,
  p_name: "nope",
});
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
ok(vicGet.status >= 400, "a viewer cannot download the project's history", `${vicGet.status}`);
const amyGet = await call("GET", `/storage/v1/object/authenticated/projects/${object}`, {
  token: amy.token,
});
ok(amyGet.status === 200 && amyGet.data === "bundle v1", "an editor downloads the latest Version");
for (const table of ["team_projects", "team_project_versions"]) {
  for (const columns of ["bundle", "*"]) {
    const read = await call("GET", `/rest/v1/${table}?select=${columns}`, {
      token: vic.token,
    });
    ok(
      read.status >= 400,
      `a viewer reads no bundle path from ${table} (${columns})`,
      `${read.status}`,
    );
  }
  const editorRead = await call("GET", `/rest/v1/${table}?select=bundle`, {
    token: amy.token,
  });
  ok(editorRead.status >= 400, `nobody reads ${table}.bundle directly`, `${editorRead.status}`);
}
ok(
  refusal(await rpc(vic, "project_bundle", { p_project: project })) === "not-allowed",
  "a viewer is not handed the bundle path",
);
ok(
  (await rpc(amy, "project_bundle", { p_project: project })).data === object,
  "an editor is handed the bundle path",
);
const ollyGet = await call("GET", `/storage/v1/object/authenticated/projects/${object}`, {
  token: olly.token,
});
ok(ollyGet.status >= 400, "outsider cannot download", `${ollyGet.status}`);
const anonGet = await call("GET", `/storage/v1/object/public/projects/${object}`);
ok(anonGet.status >= 400, "no public link to project files", `${anonGet.status}`);

const ollyRows = await call("GET", `/rest/v1/team_projects?select=id`, {
  token: olly.token,
});
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
  await call("GET", `/rest/v1/team_projects?select=version&id=eq.${project}`, {
    token: amy.token,
  })
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
const tucked = await rpc(dana, "check_in", {
  p_project: project,
  p_base: 1,
  p_head: "bbb",
  p_bundle: `${team}/${project}/v2/model.stl`,
  p_note: "",
  p_keep: false,
});
ok(
  refusal(tucked) === "not-allowed",
  "a bundle never sits among a Version's review files",
  refusal(tucked),
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
  await call("GET", `/rest/v1/team_projects?select=id&name=eq.plate`, {
    token: dana.token,
  })
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

// Reviews: Dana holds Version 2 (checked in with keep) and asks Amy and Vic to review it.
const ask = (p, version, reviewers) =>
  rpc(p, "request_review", {
    p_project: project,
    p_version: version,
    p_reviewers: reviewers,
  });
ok(
  refusal(await ask(dana, 1, [amy.email])) === "changed-elsewhere",
  "only the latest Version is reviewed",
);
ok(
  refusal(await ask(dana, 2, [amy.email, olly.email])) === "not-on-team",
  "reviewers must be on the team",
);
ok(
  refusal(await ask(dana, 2, [dana.email])) === "no-reviewers",
  "nobody reviews their own Version alone",
);
ok(refusal(await ask(vic, 2, [amy.email])) === "not-allowed", "a viewer cannot ask for a review");
const review = (await ask(dana, 2, [amy.email, vic.email.toUpperCase()])).data;
ok(typeof review === "string", "admin asks the editor and the viewer to review", review);
ok(refusal(await ask(dana, 2, [amy.email])) === "already-in-review", "a Version is reviewed once");
const peek = await call("GET", `/rest/v1/team_reviews?select=id&project_id=eq.${project}`, {
  token: olly.token,
});
ok(Array.isArray(peek.data) && peek.data.length === 0, "outsider sees no reviews");
ok(
  refusal(await rpc(olly, "comment_review", { p_review: review, p_body: "hi" })) === "not-allowed",
  "outsider cannot comment",
);
ok(
  refusal(
    await rpc(olly, "decide_review", {
      p_review: review,
      p_decision: "approved",
    }),
  ) === "not-allowed",
  "outsider cannot decide",
);
ok(
  (
    await rpc(vic, "comment_review", {
      p_review: review,
      p_body: "Holes need more clearance",
    })
  ).status < 300,
  "a viewer comments",
);
ok(
  refusal(await rpc(vic, "comment_review", { p_review: review, p_body: "   " })) === "empty",
  "an empty comment is refused",
);
const seen = (
  await call("GET", `/rest/v1/team_review_comments?select=by_email,body&review_id=eq.${review}`, {
    token: amy.token,
  })
).data;
ok(
  seen.length === 1 && seen[0].by_email === vic.email,
  "teammates read the comment and who wrote it",
  JSON.stringify(seen),
);
ok(
  refusal(
    await rpc(dana, "decide_review", {
      p_review: review,
      p_decision: "approved",
    }),
  ) === "not-a-reviewer",
  "only a named reviewer decides",
);
ok(
  refusal(await rpc(dana, "release_version", { p_project: project, p_version: 2 })) ===
    "not-approved",
  "nothing is released before every reviewer approves",
);
ok(
  (
    await rpc(amy, "decide_review", {
      p_review: review,
      p_decision: "approved",
    })
  ).status < 300,
  "editor approves",
);
ok(
  (await rpc(vic, "decide_review", { p_review: review, p_decision: "changes" })).status < 300,
  "viewer requests changes",
);
ok(
  refusal(await rpc(dana, "release_version", { p_project: project, p_version: 2 })) ===
    "not-approved",
  "a change request blocks release",
);
ok(
  (
    await rpc(vic, "decide_review", {
      p_review: review,
      p_decision: "approved",
    })
  ).status < 300,
  "a reviewer may change their mind",
);
ok(
  refusal(await rpc(amy, "release_version", { p_project: project, p_version: 2 })) ===
    "not-allowed",
  "only an admin releases",
);
const revA = await rpc(dana, "release_version", {
  p_project: project,
  p_version: 2,
});
ok(revA.data === "A", "admin releases Version 2 as Rev A", JSON.stringify(revA.data));
ok(
  refusal(await rpc(dana, "release_version", { p_project: project, p_version: 2 })) ===
    "already-released",
  "a Version is released once",
);
ok(
  refusal(
    await rpc(vic, "decide_review", {
      p_review: review,
      p_decision: "changes",
    }),
  ) === "already-released",
  "decisions close at release",
);
const object3 = `${team}/${project}/3-${run}.bundle`;
made.files.push(object3);
await call("POST", `/storage/v1/object/projects/${object3}`, {
  token: dana.token,
  bytes: new TextEncoder().encode("bundle v3"),
});
await rpc(dana, "check_in", {
  p_project: project,
  p_base: 2,
  p_head: "ccc",
  p_bundle: object3,
  p_note: "Rev B work",
  p_keep: true,
});
const review3 = (await ask(dana, 3, [amy.email])).data;
await rpc(amy, "decide_review", { p_review: review3, p_decision: "approved" });
const revB = await rpc(dana, "release_version", {
  p_project: project,
  p_version: 3,
});
ok(revB.data === "B", "the next released Version is Rev B", JSON.stringify(revB.data));
const revs = (
  await call(
    "GET",
    `/rest/v1/team_project_versions?select=version,released_rev&project_id=eq.${project}&order=version`,
    { token: vic.token },
  )
).data;
ok(
  revs.map((v) => v.released_rev).join(",") === ",A,B",
  "check-ins carry their revision letter",
  JSON.stringify(revs),
);
// Model files for browser review, pinned comments, replies, and resolving.
const model3 = `${team}/${project}/v3/parts/arm.stl`;
made.files.push(model3);
await call("POST", `/storage/v1/object/projects/${model3}`, {
  token: dana.token,
  bytes: new TextEncoder().encode("solid arm"),
});
const files = [{ path: "parts/arm.stl", object: model3, size: 9 }];
ok(
  refusal(
    await rpc(amy, "record_version_files", {
      p_project: project,
      p_version: 3,
      p_files: files,
    }),
  ) === "not-allowed",
  "only the Version's author records its files",
);
ok(
  refusal(
    await rpc(dana, "record_version_files", {
      p_project: project,
      p_version: 3,
      p_files: [{ path: "x.stl", object: "elsewhere/x.stl", size: 1 }],
    }),
  ) === "not-allowed",
  "files must sit in the project's folder",
);
const script3 = `${team}/${project}/v3/parts/arm.py`;
made.files.push(script3);
await call("POST", `/storage/v1/object/projects/${script3}`, {
  token: dana.token,
  bytes: new TextEncoder().encode("import cadquery"),
});
ok(
  refusal(
    await rpc(dana, "record_version_files", {
      p_project: project,
      p_version: 3,
      p_files: [{ path: "parts/arm.py", object: script3, size: 15 }],
    }),
  ) === "not-allowed",
  "only models and drawings are recorded for review, never a script",
);
ok(
  refusal(
    await rpc(dana, "record_version_files", {
      p_project: project,
      p_version: 3,
      p_files: [
        {
          path: "parts/arm.stl",
          object: `${team}/${project}/v2/parts/arm.stl`,
          size: 9,
        },
      ],
    }),
  ) === "not-allowed",
  "a review file sits in its own Version's folder",
);
ok(
  (
    await rpc(dana, "record_version_files", {
      p_project: project,
      p_version: 3,
      p_files: files,
    })
  ).data === 1,
  "the author records Version 3's model",
);
const vicModel = await call("GET", `/storage/v1/object/authenticated/projects/${model3}`, {
  token: vic.token,
});
ok(vicModel.status === 200 && vicModel.data === "solid arm", "a viewer downloads a review file");
const vicScript = await call("GET", `/storage/v1/object/authenticated/projects/${script3}`, {
  token: vic.token,
});
ok(vicScript.status >= 400, "a viewer cannot download a script beside it", `${vicScript.status}`);
const vicBundle3 = await call("GET", `/storage/v1/object/authenticated/projects/${object3}`, {
  token: vic.token,
});
ok(vicBundle3.status >= 400, "nor the Version's bundle", `${vicBundle3.status}`);
const listed = (
  await call(
    "GET",
    `/rest/v1/team_version_files?select=path,object&project_id=eq.${project}&version=eq.3`,
    { token: vic.token },
  )
).data;
ok(
  listed.length === 1 && listed[0].path === "parts/arm.stl",
  "a viewer sees the Version's files",
  JSON.stringify(listed),
);
ok(
  (
    await call("GET", `/rest/v1/team_version_files?select=path&project_id=eq.${project}`, {
      token: olly.token,
    })
  ).data.length === 0,
  "outsider sees no files",
);
const pinned = await rpc(amy, "comment_review", {
  p_review: review3,
  p_body: "Fillet here",
  p_anchor: { file: "parts/arm.stl", point: [1, 2, 3] },
});
ok(typeof pinned.data === "string", "a comment pins a spot on a model");
ok(
  refusal(
    await rpc(amy, "comment_review", {
      p_review: review3,
      p_body: "x",
      p_anchor: { point: [1] },
    }),
  ) === "not-allowed",
  "a pin names its file",
);
const firstComment = (
  await call("GET", `/rest/v1/team_review_comments?select=id&review_id=eq.${review}`, {
    token: amy.token,
  })
).data[0].id;
ok(
  refusal(
    await rpc(amy, "comment_review", {
      p_review: review3,
      p_body: "re",
      p_reply_to: firstComment,
    }),
  ) === "not-found",
  "a reply stays in its own review",
);
ok(
  typeof (
    await rpc(dana, "comment_review", {
      p_review: review3,
      p_body: "Done",
      p_reply_to: pinned.data,
    })
  ).data === "string",
  "a reply answers a comment",
);
ok(
  refusal(await rpc(vic, "resolve_comment", { p_comment: pinned.data, p_version: 3 })) ===
    "not-allowed",
  "a viewer cannot resolve",
);
ok(
  refusal(
    await rpc(dana, "resolve_comment", {
      p_comment: pinned.data,
      p_version: 3,
    }),
  ) === "not-allowed",
  "resolving needs a later Version",
);
ok(
  refusal(
    await rpc(dana, "resolve_comment", {
      p_comment: firstComment,
      p_version: 2,
    }),
  ) === "not-allowed",
  "resolving cannot point back in time",
);
ok(
  (
    await rpc(dana, "resolve_comment", {
      p_comment: firstComment,
      p_version: 3,
    })
  ).status < 300,
  "an admin resolves a comment by a later Version",
);
const back = (
  await call(
    "GET",
    `/rest/v1/team_review_comments?select=resolved_in,anchor,reply_to&review_id=eq.${review3}&order=at`,
    { token: vic.token },
  )
).data;
ok(
  back[0].anchor.file === "parts/arm.stl" && back[1].reply_to === pinned.data,
  "pins and replies read back",
  JSON.stringify(back),
);
const when = (
  await call(
    "GET",
    `/rest/v1/team_project_versions?select=released_at&project_id=eq.${project}&version=eq.3`,
    { token: vic.token },
  )
).data[0];
ok(when.released_at !== null, "a release records when");
await rpc(dana, "release_project", { p_project: project });

// Storage: a team's files count against its plan, which only billing (the service role) sets.
const mine = (await rpc(dana, "my_teams")).data.find((each) => each.id === team);
ok(
  mine.storageUsed > 0 && mine.storageLimit === 1073741824,
  "a team sees what its files take, against 1 GB",
  `${mine.storageUsed} of ${mine.storageLimit}`,
);
ok(
  (
    await rpc(dana, "set_team_plan", {
      p_team: team,
      p_seats: 99,
      p_storage_limit: 1e12,
    })
  ).status >= 400,
  "nobody signed in sets their own plan",
);
if (ADMIN_KEY) {
  const bucket = await admin("GET", "/storage/v1/bucket/projects");
  ok(
    bucket.data?.file_size_limit === 209715200,
    "one file is at most 200 MB",
    `${bucket.data?.file_size_limit}`,
  );
  const plan = await admin("POST", "/rest/v1/rpc/set_team_plan", {
    p_team: team,
    p_seats: 3,
    p_storage_limit: 10,
  });
  ok(plan.status < 300, "billing sets a team's seats and storage", `${plan.status}`);
  ok((await rpc(dana, "check_out", { p_project: project })).status < 300, "admin checks out again");
  const object4 = `${team}/${project}/4-${run}.bundle`;
  made.files.push(object4);
  await call("POST", `/storage/v1/object/projects/${object4}`, {
    token: dana.token,
    bytes: new TextEncoder().encode("bundle v4"),
  });
  const over = await rpc(dana, "check_in", {
    p_project: project,
    p_base: 3,
    p_head: "ddd",
    p_bundle: object4,
    p_note: "",
    p_keep: false,
  });
  ok(
    refusal(over) === "storage-full",
    "a check-in past the team's storage is refused",
    refusal(over),
  );
  await admin("POST", "/rest/v1/rpc/set_team_plan", {
    p_team: team,
    p_seats: 3,
    p_storage_limit: 1073741824,
  });
  await rpc(dana, "release_project", { p_project: project });
}

// Deleting: files first through Storage, then the project or team; then accounts.
const amyUp2 = `${team}/${project}/9-${run}.bundle`;
made.files.push(amyUp2);
await call("POST", `/storage/v1/object/projects/${amyUp2}`, {
  token: amy.token,
  bytes: new TextEncoder().encode("refused"),
});
ok(
  (await rpc(dana, "check_out", { p_project: project })).status < 300,
  "admin checks out for Version 4",
);
const object5 = `${team}/${project}/5-${run}.bundle`;
made.files.push(object5);
await call("POST", `/storage/v1/object/projects/${object5}`, {
  token: dana.token,
  bytes: new TextEncoder().encode("bundle v4"),
});
const v4 = await rpc(dana, "check_in", {
  p_project: project,
  p_base: 3,
  p_head: "eee",
  p_bundle: object5,
  p_note: "",
  p_keep: false,
});
ok(v4.data === 4, "Version 4 checks in", JSON.stringify(v4.data));
const exists = async (name) =>
  (
    await call("GET", `/storage/v1/object/authenticated/projects/${name}`, {
      token: dana.token,
    })
  ).status === 200;
await call("DELETE", `/storage/v1/object/projects`, {
  token: vic.token,
  json: { prefixes: [amyUp2] },
});
ok(await exists(amyUp2), "a viewer deletes no files");
await call("DELETE", `/storage/v1/object/projects`, {
  token: amy.token,
  json: { prefixes: [object5] },
});
ok(await exists(object5), "an editor cannot delete a teammate's latest bundle");
await call("DELETE", `/storage/v1/object/projects`, {
  token: vic.token,
  json: { prefixes: [object3] },
});
ok(await exists(object3), "a viewer cannot delete a superseded bundle");
await call("DELETE", `/storage/v1/object/projects`, {
  token: amy.token,
  json: { prefixes: [object3] },
});
ok(!(await exists(object3)), "an editor deletes a teammate's bundle that Version 4 replaced");
await call("DELETE", `/storage/v1/object/projects`, {
  token: amy.token,
  json: { prefixes: [amyUp2] },
});
ok(!(await exists(amyUp2)), "an editor deletes their own refused upload");
ok(
  refusal(await rpc(amy, "team_objects", { p_team: team, p_project: project })) === "not-allowed",
  "only an admin lists a project's files",
);
ok(
  refusal(await rpc(amy, "delete_project", { p_project: project })) === "not-allowed",
  "an editor cannot delete a project",
);
ok(
  refusal(await rpc(dana, "delete_project", { p_project: project })) === "files-left",
  "a project is not deleted while its files remain",
);
const names = (await rpc(dana, "team_objects", { p_team: team, p_project: project })).data;
ok(names.length >= 4, "the admin lists the project's files", `${names.length}`);
const cleared = await call("DELETE", `/storage/v1/object/projects`, {
  token: dana.token,
  json: { prefixes: names },
});
ok(
  cleared.status === 200 &&
    (await rpc(dana, "team_objects", { p_team: team, p_project: project })).data.length === 0,
  "the admin deletes them",
);
ok((await rpc(dana, "delete_project", { p_project: project })).status < 300, "then the project");
ok(
  (
    await call("GET", `/rest/v1/team_projects?select=id&id=eq.${project}`, {
      token: dana.token,
    })
  ).data.length === 0 &&
    (
      await call("GET", `/rest/v1/team_reviews?select=id&project_id=eq.${project}`, {
        token: dana.token,
      })
    ).data.length === 0,
  "and its Versions and reviews go with it",
);
ok(
  refusal(await rpc(dana, "delete_account")) === "last-admin",
  "the only admin of a team with people cannot delete their account",
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
const lastAdmin = await rpc(dana, "remove_member", {
  p_team: team,
  p_email: dana.email,
});
ok(refusal(lastAdmin) === "last-admin", "the last admin cannot leave", refusal(lastAdmin));
ok(
  (await rpc(vic, "remove_member", { p_team: team, p_email: vic.email })).status < 300,
  "a viewer leaves on their own",
);

// Teams a person makes: at most 3 of their own.
const extra = [];
for (const name of ["Second", "Third"]) {
  const made2 = (await rpc(dana, "create_team", { p_name: name })).data;
  made.teams.push(made2);
  extra.push(made2);
}
ok(
  extra.every((id) => typeof id === "string"),
  "a person makes up to 3 teams",
);
const fourth = await rpc(dana, "create_team", { p_name: "Fourth" });
ok(refusal(fourth) === "too-many-teams", "a fourth is refused", refusal(fourth));

ok(
  refusal(await rpc(amy, "delete_team", { p_team: extra[0] })) === "not-allowed",
  "an editor cannot delete a team",
);
ok((await rpc(dana, "delete_team", { p_team: extra[0] })).status < 300, "an admin deletes a team");
ok(!(await rpc(dana, "my_teams")).data.some((each) => each.id === extra[0]), "and it is gone");
await rpc(dana, "delete_team", { p_team: extra[1] });
ok((await rpc(vic, "delete_account")).status < 300, "a viewer deletes their account");
ok(
  (await rpc(dana, "remove_member", { p_team: team, p_email: who("gus") })).status < 300,
  "the admin withdraws the last invite",
);
const solo = await rpc(dana, "delete_account");
ok(refusal(solo) === "teams-left", "a team of one is deleted before its account", refusal(solo));
ok(
  (await rpc(dana, "delete_team", { p_team: team })).status < 300,
  "the admin deletes their last team",
);
ok((await rpc(dana, "delete_account")).status < 300, "then their account");
if (ADMIN_KEY) {
  for (const p of [vic, dana]) {
    const gone = await admin("GET", `/auth/v1/admin/users?per_page=1000`);
    ok(
      !gone.data?.users?.some((u) => u.email === p.email),
      `${p.email.split("+")[0]}'s account is gone`,
    );
  }
}

if (ADMIN_KEY) {
  await admin("DELETE", "/storage/v1/object/projects", {
    prefixes: made.files,
  });
  for (const id of made.teams) await admin("DELETE", `/rest/v1/teams?id=eq.${id}`);
  for (const id of made.users) await admin("DELETE", `/auth/v1/admin/users/${id}`);
  const left = await admin("GET", `/rest/v1/teams?select=id&id=in.(${made.teams.join(",")})`);
  console.log(
    `\ncleaned up: ${made.users.length} people, ${made.teams.length} team, ${made.files.length} file; teams left: ${left.data?.length}`,
  );
}
console.log(failures === 0 ? "\nall passed" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
