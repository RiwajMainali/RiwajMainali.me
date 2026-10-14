# Gym traffic and host protection

All controls run on the existing EC2 instance; no AWS resources or paid services
are added. The API stays on loopback behind Caddy. Caddy overwrites `X-Gym-Peer`
with the actual connecting peer. Forwarded client IP headers are not trusted:
Vercel requests may share an egress IP, so these limits are deliberately generous.

- Admission before authentication/database work: 60 requests/second globally
  (burst 120), 30/second per connecting peer (burst 90), 48 active requests
  globally, 12 per peer. At most 4 uploads globally and 2 per peer/user.
- Access-request, approval, and pairing-redemption routes share a per-peer
  12/minute sustained allowance with burst 10. Approved accounts have 300 API
  requests/minute and 30 volume/export requests/minute. Upload starts have a
  per-account allowance of 20/hour.
- Admission rejections get 429 or 503 and `Retry-After: 5`. These limits are overload
  controls, not guarantees of available capacity during an attack. Peer buckets
  are bounded to 4,096 and inactive buckets expire after five minutes.
- Caddy caps JSON bodies at 512 KiB, uploads at 50 MiB, headers at 16 KB;
  header reads at 5 seconds, stalled body reads/writes at 30 seconds, complete
  request bodies and writes at five minutes. Uploads must maintain at least
  1 KiB/s on average after the initial allowance. Node also enforces body/header,
  socket and concurrent-request limits before entering the handler.
- Upload reservations leave at least 1 GiB of free disk, accounting conservatively
  for pending uploads, as well as the existing user/site storage quotas.
- Backend: 320 MB memory, 75% of one CPU, 64 tasks, 1,024 file descriptors.
  Gateway: 128 MB memory, 50% of one CPU, 64 tasks, 2,048 file descriptors.
  These limits help preserve capacity for the instance's other services.

`riwaj-gym-watch.timer` checks every five minutes for unhealthy services, an
unresponsive local API, stale traffic metrics, fewer than 64 MiB of available
RAM, fewer than 1 GiB of free disk, or 100 rejected requests in the prior five
minutes. It emails the configured owner using existing runtime SMTP settings,
with a six-hour cooldown after a successful alert. No credentials, cookies,
approval URLs, or request bodies are written to the traffic metrics or logs.
It cannot email while the whole instance or network is unreachable.

Inspect with `systemctl status riwaj-gym riwaj-gym-proxy riwaj-gym-watch.timer`,
`journalctl -u riwaj-gym -u riwaj-gym-watch`, and
`python3 /opt/riwaj-gym/scripts/gym-watch.py --dry-run` on EC2.

The origin hostname/IP remains publicly reachable. Direct requests receive these
same host controls, but can bypass Vercel's edge protection. Fully restricting
the origin requires an authenticated proxy path configured at Vercel and EC2,
or upstream network filtering. Host limits cannot absorb a large volumetric
flood. AWS Shield Standard is automatic AWS network/transport protection; no
Shield Advanced subscription is enabled by this change.

Reference: [Caddy server options](https://caddyserver.com/docs/caddyfile/options),
[AWS Shield overview](https://docs.aws.amazon.com/waf/latest/developerguide/ddos-overview.html).
