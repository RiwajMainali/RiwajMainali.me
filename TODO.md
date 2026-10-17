# TODO

Philosophy: blazingly fast for everyone on the basics. Content is in the first
HTML paint; animation layers in after and should feel like part of the bit.

## Site
- [x] Projects section (`projects`, `/projects`) with a gym tracker case study
- [x] About page and LinkedIn contact with terminal commands
- [ ] Blog: real posts under `cd blog`, statically generated from markdown
- [ ] Real `/blog` route behind the terminal command for crawlers and no-JS visitors (`/projects` is implemented)
- [ ] More easter eggs in the shell

## CTF (phase 2)
- [ ] Decide scope, prize, and AWS isolation (separate account, ephemeral or auto-reset box)
- [ ] Hints planted in the terminal lead to the box
- [ ] Server-side flag submission (hashed flag in env, rate limited) and hall of fame

## Workout tracker
- [ ] Move to its own repo, app + DB on EC2
- [ ] Remove the uncommitted workout WIP (login, api/, prisma/, lib/) from this repo once moved
