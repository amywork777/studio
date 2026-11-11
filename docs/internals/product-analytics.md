# Product analytics

Studio sends usage counts the way text-to-cad does: to a receiver of its own
([`infra/usage`](../../infra/usage/README.md)), which checks every batch and keeps it in
Studio's own Postgres table, as Backplane keeps its own. No build carries a key to it, so the
receiver can refuse an event, or the store change, without a release. Nothing below runs unless the build names the receiver (`T3CODE_USAGE_URL`).

The server owns delivery, opt-out, and identity for every connected client. The identity
is the install's random id ([`getInstallId`](../../apps/server/src/telemetry/Identify.ts)),
never one derived from a provider account, because an opt-out deletes by it. It can span
several clients; it does not identify a browser session. Counts are on by default, as
text-to-cad's are, from the moment the first-launch notice has told the person (`usageDataAnswered`, set
as it shows); nothing counted before that is sent, a no given under the old Share or Don't share notice
stays a no, and turning sharing off owes
the receiver a deletion of everything sent under the id, kept across restarts until taken;
no batch goes out while one is owed. Clients send nothing themselves. Client-use events require an authenticated connection, so
visiting the hosted app without connecting does not count as product use.

## Attribution boundaries

Client dimensions belong to the event's WebSocket connection. A server-global
"current client" would misattribute simultaneous web, desktop, and mobile use.
Provider execution has its own events because a turn can outlive the requesting
connection.

Keep client and server dimensions separate. A desktop host can serve a phone or a
remote browser, and a direct connection can cross a network. Older clients omit
metadata. Missing client values must stay unknown rather than being backfilled
from server properties. The batch's `mode` describes how the server runs; use
`surface` for the connected client.

## Interpreting events

Use `client.turn.requested` for active-use reports. `client.connected` counts
reconnects, so network behavior can inflate it. One identity can appear in several
client groups during a period; adding those groups double-counts users.

Provider send and completion counts need not match. Providers can emit synthetic
turns without a send request. Collection is best effort, with no scan or backfill
of provider history.

Token totals cover the main agent. Child agents and model rerouting prevent a turn
from representing one provider/model combination's full cost. For provider
comparisons, require complete usage, no observed subagents, and no mixed models;
compare matching model, effort, interaction mode, and terminal status. Aggregate
output/input ratios should divide the summed totals. Averaging per-turn ratios
lets small-input turns dominate.

Unknown counts stay absent. Partial usage contains valid observed counts but
cannot establish a whole-turn total. Keep these distinctions when changing token
normalization or building reports.

## Delivery

A send can fail after the receiver has kept the batch, so every retry is a copy.
[Delivery](../../apps/server/src/telemetry/AnalyticsService.ts) gives each event a
uuid when it is recorded, backs off after a failed send, and drops a batch after a
few tries. Without these limits, one stuck batch was sent every second for days.

## Collection boundary

Keep analytics payloads to product metadata and normalized measurements. Do not
send prompts, authentication material, raw provider payloads, user-assigned device
names, or conversation identifiers. Client metadata is best effort; invalid values
must not reject a connection. The receiver refuses any event, or any property that event does not
carry, because a short word alone can be a file's name. A new event or property needs the receiver's
list changed and deployed first (the receiver refuses the whole batch otherwise, and after a few
tries it is dropped), then the README's and the server's.
