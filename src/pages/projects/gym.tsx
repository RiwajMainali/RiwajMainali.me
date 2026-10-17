import Head from 'next/head';
import Link from 'next/link';

const decisions = [
  {
    title: 'Drafts are not workouts.',
    body: 'Typing a set should not add it to your training history. Drafts sync to the server separately; only an explicit save creates a completed entry. Revision checks surface conflicting edits from another device instead of silently overwriting them.',
  },
  {
    title: 'Pair devices without a password.',
    body: 'An approved account can connect another device using a short-lived, single-use pairing code. HTTP-only cookies recognize each device, while the server stores token hashes. New accounts need owner approval.',
  },
  {
    title: 'Keep the infrastructure small.',
    body: 'The Next.js application runs on one EC2 host with SQLite in WAL mode and private media on disk. This keeps the deployment compact, but makes consistent database and upload backups essential. It is deliberately a single-host design.',
  },
  {
    title: 'Make progress estimates earn their place.',
    body: 'Charts compare the same exercise variant and exclude warmup sets. Estimated one-rep max uses low-rep working sets; projections are withheld when the history is too short or inconsistent. The app shows training context rather than pretending to predict physiology.',
  },
];

export default function GymCaseStudy() {
  return (
    <>
      <Head>
        <title>Building a private gym tracker · Riwaj Mainali</title>
        <meta
          name="description"
          content="A gym tracker built with Next.js, TypeScript and SQLite: device pairing, conflict-aware drafts, private media and exercise progress."
        />
      </Head>
      <main className="mx-auto min-h-screen max-w-5xl px-5 py-10 font-mono sm:px-10 sm:py-16">
        <nav
          aria-label="Breadcrumb"
          className="mb-16 flex flex-wrap gap-2 text-sm"
        >
          <Link
            href="/"
            className="underline underline-offset-4 hover:text-white"
          >
            ~/home
          </Link>
          <span aria-hidden="true" className="text-zinc-500">
            /
          </span>
          <Link
            href="/projects"
            className="underline underline-offset-4 hover:text-white"
          >
            projects
          </Link>
          <span className="text-zinc-400">/ gym</span>
        </nav>
        <article>
          <header className="mb-12">
            <p className="mb-4 text-xs uppercase tracking-widest text-zinc-400">
              Project 01 / Gym tracker
            </p>
            <h1 className="mb-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
              A training log that follows you.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-zinc-300">
              Log the work. Keep the context. Pick up on another device without
              turning unfinished sets into workout history.
            </p>
            <div className="mt-8 flex flex-wrap gap-5 text-sm">
              <Link
                href="/gym"
                prefetch={false}
                className="rounded border border-[#39ff14]/60 px-4 py-3 hover:bg-[#39ff14]/10"
              >
                Open the app ↗
              </Link>
              <Link
                href="/gym/source"
                prefetch={false}
                className="px-1 py-3 underline underline-offset-4 hover:text-white"
              >
                Source &amp; licenses →
              </Link>
            </div>
            <p className="mt-4 text-xs text-zinc-400">
              The app requires account approval. Source is available under
              AGPL-3.0-or-later.
            </p>
          </header>
          <section
            aria-labelledby="problem"
            className="mb-12 border-t border-zinc-800 pt-8"
          >
            <h2 id="problem" className="mb-4 text-2xl font-bold">
              The problem
            </h2>
            <p className="max-w-3xl leading-relaxed text-zinc-300">
              A useful training log needs more than weight and reps. It needs to
              distinguish warmups from working sets, preserve effort and notes,
              and keep different equipment variants separate. Switching between
              a phone and a desktop adds another challenge: keeping unfinished
              edits consistent.
            </p>
          </section>
          <section aria-labelledby="features" className="mb-12">
            <h2 id="features" className="mb-5 text-2xl font-bold">
              What I built
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {[
                [
                  'Detailed logging',
                  'Per-set weight, reps, RPE and warmup flags, with dated entries, bodyweight and notes.',
                ],
                [
                  'Exercise discovery',
                  'Search across 5,632 text exercises, filter by equipment, or create a private exercise.',
                ],
                [
                  'History with context',
                  'Per-exercise charts for load, reps, volume and estimated one-rep max.',
                ],
                [
                  'Private attachments',
                  'Attach photos, video or audio to your log, with access checked for each user.',
                ],
              ].map(([title, body]) => (
                <li
                  key={title}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-5"
                >
                  <h3 className="mb-3 font-bold">{title}</h3>
                  <p className="text-sm leading-relaxed text-zinc-300">
                    {body}
                  </p>
                </li>
              ))}
            </ul>
          </section>
          <section
            aria-labelledby="architecture"
            className="mb-12 rounded-xl border border-[#39ff14]/30 p-6 sm:p-8"
          >
            <h2 id="architecture" className="mb-6 text-2xl font-bold">
              How it fits together
            </h2>
            <ol className="grid gap-5 sm:grid-cols-3">
              <li>
                <p className="mb-2 text-xs text-zinc-400">01 / CLIENT</p>
                <h3 className="mb-2 font-bold">Next.js + React</h3>
                <p className="text-sm leading-relaxed text-zinc-300">
                  Responsive logging, draft status and history charts.
                </p>
              </li>
              <li>
                <p className="mb-2 text-xs text-zinc-400">02 / SERVER</p>
                <h3 className="mb-2 font-bold">Node.js API</h3>
                <p className="text-sm leading-relaxed text-zinc-300">
                  Device sessions, validation, revision checks and private media
                  access.
                </p>
              </li>
              <li>
                <p className="mb-2 text-xs text-zinc-400">03 / STORAGE</p>
                <h3 className="mb-2 font-bold">SQLite + disk</h3>
                <p className="text-sm leading-relaxed text-zinc-300">
                  Training records and uploads on a single EC2 host.
                </p>
              </li>
            </ol>
          </section>
          <section aria-labelledby="decisions" className="mb-12">
            <h2 id="decisions" className="mb-8 text-2xl font-bold">
              The engineering decisions
            </h2>
            <div className="space-y-8">
              {decisions.map(({ title, body }) => (
                <section key={title} className="max-w-3xl">
                  <h3 className="mb-3 text-lg font-bold">{title}</h3>
                  <p className="leading-relaxed text-zinc-300">{body}</p>
                </section>
              ))}
            </div>
          </section>
          <section
            aria-labelledby="limits"
            className="border-t border-zinc-800 pt-8"
          >
            <h2 id="limits" className="mb-4 text-2xl font-bold">
              Tradeoffs and next steps
            </h2>
            <p className="mb-4 max-w-3xl leading-relaxed text-zinc-300">
              Drafts live on the server. Edits made offline can sync while the
              tab remains open, but closing it can lose unsynced changes.
              Conflict resolution is explicit: reload the server draft or
              replace it with your edits.
            </p>
            <p className="max-w-3xl leading-relaxed text-zinc-300">
              Possible next steps include text-based workout entry with a
              reviewable preview and video analysis with manual calibration.
              These are future work; the current app supports video upload and
              playback.
            </p>
          </section>
        </article>
        <footer className="mt-16 border-t border-zinc-800 pt-6 text-sm">
          <Link
            href="/projects"
            className="underline underline-offset-4 hover:text-white"
          >
            ← All projects
          </Link>
        </footer>
      </main>
    </>
  );
}
