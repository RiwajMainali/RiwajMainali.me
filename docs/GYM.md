# riwaj.me/gym

## Deployed architecture

The existing Vercel website serves static gym pages. `next.config.mjs` rewrites
`/api/gym/*` to `https://32-192-89-83.sslip.io/api/gym/*`, an HTTPS gateway on the
existing EC2 `i-09e30f26749092f15` in `us-east-1`. All API logic, user sessions,
SQLite records, drafts and uploads run there. No Vercel function owns gym state.
No new EC2, managed database, object storage or hosted backend is provisioned.
The existing Discord bot remains independent and running.

- Node 22: `/opt/riwaj-node22`, backend checkout `/opt/riwaj-gym`.
- API service: `riwaj-gym.service`, unprivileged account `riwaj-gym`, loopback 3100.
- HTTPS gateway: `riwaj-gym-proxy.service`, separate unprivileged account, Caddy
  with automatic certificate renewal. Public TCP 80/443 only; 3100 is loopback.
- Persistent data: `/var/lib/riwaj-gym/gym.sqlite`, WAL and `uploads/`, mode 700.
- Runtime settings: `/etc/riwaj-gym.env`, mode 600, outside source control.
- Website origins: `https://riwaj.me` and `https://www.riwaj.me` are accepted.
- `sslip.io` resolves the existing public IP without needing another DNS record.
  If EC2's public IP changes, update the gateway name and frontend rewrite together.

## Included

Mobile logging with one row per set, weight, reps, half-step RPE, warmups, date,
bodyweight, notes, personal exercises and private photo/video/audio attachments.
The text catalogue contains all 5,632 openGym entries, pinned to commit
`e348fc17c42c7e9a211c5972e573ad3698190ee2`; equipment variants retain separate IDs
and histories. Search supports 206 shorthand spellings and two result tiers with personal-history ranking; see GYM-SEARCH.md. The browser fetches 50 matching exercises per page. No
exercise images or animation library is shipped.

Drafts are persisted on EC2 after 650 ms and refreshed every 5 seconds on other
devices. Completed history is separate. Concurrent modifications produce a
conflict with explicit reload/replace choices. Offline edits remain in the open
tab and sync on reconnection; closing an offline tab can lose unsynced edits and
triggers a browser warning. Gym input does not use localStorage.

Device recognition uses HTTP-only, Secure, SameSite=Strict cookies lasting 180
days after initial approval or pairing. No hardware fingerprinting. Another
device pairs using a 256-bit single-use 10-minute code; only hashes are stored.

A hard transaction-enforced cap reserves 100 approved + pending places, including
the owner. Every new member requires owner approval. The owner is initialized
from EC2, not through a public email claim. Approval links expire in 48 hours;
GET never grants access and explicit POST consumes them. SMTP failure rolls back
a new request and displays an error instead of claiming an email was sent.

Uploads are private, streamed to disk, checked for supported magic bytes and
support HTTP byte ranges for playback. Limits: 50 MB/file, 500 MB/user, 500
files/user, 10 GB total. Original metadata remains. Notes can reuse uploaded files;
files referenced by a draft or saved entry cannot be deleted accidentally.

Charts load the selected exercise's complete paginated history. The recent feed
shows the latest 200 entries. Metrics: heaviest external load, working reps,
volume (external load × reps), and estimated 1RM. Units are converted consistently.

## Progress suggestions

Warmups are excluded. Epley e1RM uses working sets of 1–12 reps; a single uses
actual load. High-rep and zero-load bodyweight sets remain in history but do not
produce unsupported e1RM trends. Assisted movements do not generate forecasts.

Three comparable training days spanning at least 14 days are required. A median
pairwise (Theil–Sen) slope over the latest 12 days of records models the person's
observed rate. Median residual scatter above 12% of latest e1RM suppresses the
projection. Dashed +7/+14-day projections are estimates, not promises or validated
physiological predictions. Changes in technique or ROM aren't inferred.

A rising rate with known last-set RPE <=8 can suggest one extra rep at the same
load, up to 12 reps. Missing effort, fatigue or declining progress retains the
last target. Novice/intermediate/advanced/elite labels are user selectable;
rough non-sex-specific bodyweight reference bands exist for a few exact barbell
lifts only. No standards are invented for arbitrary DB/cable/machine variants.
Historical rate and effort determine recommendations, not the experience label.

## Owner access and email setup

Initial owner is `riwaj227@gmail.com`. As the service account on EC2, initialize
once after the backend has started:

```sh
sudo -u riwaj-gym env GYM_DATA_DIR=/var/lib/riwaj-gym /opt/riwaj-node22/bin/node /opt/riwaj-gym/scripts/gym-admin.cjs bootstrap riwaj227@gmail.com
```

Paste the resulting one-time code into the pairing form at `/gym`. Treat it as a
password. `recover EMAIL` generates a replacement code only for an approved
account after the owner verifies identity. `reject EMAIL` rejects access and
revokes sessions. The owner can also manage members through the Members tab.

Approval mail uses an existing authenticated SMTP mailbox; nothing is provisioned
in AWS for email. Add the following to `/etc/riwaj-gym.env` **on EC2**, not in Git
or chat, then `sudo systemctl restart riwaj-gym`:

```text
GYM_SMTP_HOST=smtp.gmail.com
GYM_SMTP_PORT=465
GYM_SMTP_USER=riwaj227@gmail.com
GYM_SMTP_PASSWORD=<app password configured privately on server>
```

For Gmail, the local helper `python3 scripts/configure-gym-mail.py` prompts for
an app password with hidden input, writes it to EC2 over SSH stdin, and restarts
only the gym API. It does not print the password or put it in command arguments.

Runtime credentials are not included in this repo. Without working SMTP,
registration deliberately returns an explicit error; owner access and workouts
remain available. Test real delivery to the owner's mailbox before inviting users.

## Build, checks and deployment

Use Node 22. The native SQLite binary must match the platform and Node ABI.

```sh
npm ci
npm run gym:test
npx tsc --noEmit
npm run build
```

`prebuild` generates a corresponding source archive under `public/`. The gym pages
link to it at `/gym-source.tar.gz`. It includes the AGPL gym module, tests and a
minimal runnable Next host, never the unrelated private website, credentials,
uploads or user records. Next 15.5.27 and a patched PostCSS override are used.
The existing lint setup is separate; TypeScript remains checked during builds.

The GitHub production branch (`master`) triggers Vercel's existing frontend
pipeline. For backend changes, package the code separately and update the same EC2:

```sh
COPYFILE_DISABLE=1 tar -czf /tmp/riwaj-gym-backend.tar.gz src/lib/gym src/server src/data scripts tests licenses deploy
scp -i ~/Downloads/utility_low_risk.pem /tmp/riwaj-gym-backend.tar.gz ec2-user@32.192.89.83:/tmp/
```

Extract into a reviewed release under `/opt/riwaj-gym`, use
`deploy/gym-backend-package.json` as its runtime `package.json`, install with Node
22, retain `/etc/riwaj-gym.env` and `/var/lib/riwaj-gym`, then restart only
`riwaj-gym`. Native Linux dependencies are installed on EC2; do not copy macOS
`node_modules`. Deploy files contain the actual systemd and Caddy configuration.
The legacy local Prisma `/workout` work is separate and has not been deployed or
migrated into gym. No existing `dev.db` is overwritten.

Back up SQLite using its online backup API and copy uploads consistently. Do not
copy only an active WAL database file. Use the existing host/backup arrangements;
this change does not create cloud backup storage. Monitor disk headroom.

## Future work

- Optional exercise selection images with a storage/bandwidth budget.
- Text parsing (`btn ohp 135 3x12`) with editable, ambiguity-aware preview,
  explicit units and raw text kept in the server draft before committing.
- Video rep counting on this EC2, estimated exercise start/end, depth calibration
  and a small timeline editor with manual corrections. Existing uploads/playback
  are ready; automated motion analysis is not presented as complete.

### Cardio and personal exports
Cardio catalogue selections automatically use duration (minutes), optional distance (mi/km), and optional effort (1–10). Average pace is derived from time/distance; notes and private media work as for strength entries. Tracking type can be overridden, including for custom exercises. Saved cardio has `mode: cardio`, a `cardio` object, and empty `sets`; legacy strength records keep their original representation. Cardio charts aggregate daily duration or normalized distance. They do not use lifting tiers, estimated 1RM or rep recommendations. New cardio drafts reset time/distance/effort after save.

The Data tab downloads all owned records as JSON (profile, full history, synced draft, exercise definitions and media metadata) or CSV (one row per strength set or cardio session). Attachment files download individually from authenticated, owner-scoped URLs. JSON/CSV contain no device tokens or other accounts' data; CSV neutralizes spreadsheet formulas in text fields. Exports have no history pagination limit and use a consistent database read transaction.

### Volume views
History → History view → Volume provides per-exercise daily totals, whole-day totals across all exercises, or daily totals for a chosen primary muscle group. The authenticated `/api/gym/volume` endpoint aggregates the user's full history into date/exercise rows, in kg·reps internally, without the 200-entry display limit. Views convert units consistently. Cardio is excluded; strength sets count toward volume only at RPE 7 or higher. Compound movements count once toward the catalogue's primary muscle; secondary muscle work is not estimated. Actual bodyweight is not added to logged external load. Hard-set and rep counts accompany load-volume totals.

### Hard-set volume and opening view
The gym opens in History → Volume → Per day (all exercises). Training volume defaults to hard-set counts: strength sets with RPE >=7, including sets tagged as warmups. New sets and next-session sets default to RPE 6. Existing recorded RPE is preserved; null effort counts as non-hard. The optional load-volume metric also sums only hard-set weight × reps. Exercise and primary-muscle daily filters share these rules, and hard bodyweight sets count even at zero external load.
