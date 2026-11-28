/**
 * The two pages a person sees in the browser: the one Checkout returns to after paying (with the
 * key for another computer), and the one for a cancelled checkout or any other plain message.
 */
const escape = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const PLAN_NAMES = { starter: "Studio Pro, Starter", pro: "Studio Pro, Pro" };

const shell = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Studio</title>
<style>
  :root { --bg: #f7f7f5; --card: #ffffff; --text: #1c1c1a; --muted: #6b6b66; --line: #e3e3de; --accent: #2f5bd3; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #161615; --card: #1f1f1d; --text: #ededea; --muted: #a3a39d; --line: #33332f; --accent: #8aa8ff; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
    background: var(--bg); color: var(--text); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  main { width: 100%; max-width: 440px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  p { margin: 0 0 14px; color: var(--muted); }
  .key { display: flex; gap: 8px; margin-top: 6px; }
  code { flex: 1; min-width: 0; overflow-wrap: anywhere; font: 12px/1.4 ui-monospace, Menlo, monospace;
    background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; color: var(--text); }
  button { border: 1px solid var(--line); background: var(--card); color: var(--text); border-radius: 8px; padding: 0 12px; font: inherit; cursor: pointer; }
  small { display: block; color: var(--muted); margin-top: 18px; font-size: 12px; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;

export function welcomePage({ email, plan, key }) {
  return shell(
    "You're on Studio Pro",
    `<h1>You're on Studio Pro</h1>
<p>Go back to Studio: it signs in by itself in a few seconds. Its AI now runs on Studio Pro, with no Claude subscription needed.</p>
<p>${escape(PLAN_NAMES[plan] ?? "Studio Pro")}${email ? ` · ${escape(email)}` : ""}</p>
<p style="margin-bottom:0">On another computer, paste this license key in Studio's Settings, under Studio Pro:</p>
<div class="key"><code id="key">${escape(key)}</code><button type="button" onclick="navigator.clipboard.writeText(document.getElementById('key').textContent).then(()=>{this.textContent='Copied'})">Copy</button></div>
<small>Keep the key to yourself: anyone with it uses your week's AI.</small>`,
  );
}

export function cancelledPage({ title, line }) {
  return shell(title, `<h1>${escape(title)}</h1><p>${escape(line)}</p>`);
}
