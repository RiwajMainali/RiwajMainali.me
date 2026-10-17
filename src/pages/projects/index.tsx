import Head from 'next/head';
import Link from 'next/link';

export default function Projects() {
  return (
    <>
      <Head>
        <title>Projects · Riwaj Mainali</title>
        <meta
          name="description"
          content="Things I've built: a private gym tracker, its architecture, and the decisions behind it."
        />
      </Head>
      <main className="mx-auto min-h-screen max-w-5xl px-5 py-10 font-mono sm:px-10 sm:py-16">
        <nav aria-label="Breadcrumb" className="mb-16 text-sm">
          <Link
            href="/"
            className="underline underline-offset-4 hover:text-white"
          >
            ~/home
          </Link>
          <span className="text-zinc-400"> / projects</span>
        </nav>
        <header className="mb-12 max-w-2xl">
          <p className="mb-4 text-sm text-zinc-400">
            guest@riwaj.me:~$ ls projects
          </p>
          <h1 className="mb-5 text-4xl font-bold tracking-tight sm:text-6xl">
            Things I&apos;ve built.
          </h1>
          <p className="text-lg leading-relaxed text-zinc-300">
            Useful tools, how they work, and the decisions behind them.
          </p>
        </header>
        <article className="rounded-xl border border-[#39ff14]/30 bg-zinc-950 p-6 sm:p-10">
          <p className="mb-5 text-xs uppercase tracking-widest text-zinc-400">
            01 / Web application
          </p>
          <h2 className="mb-4 text-3xl font-bold">Gym tracker</h2>
          <p className="mb-6 max-w-2xl leading-relaxed text-zinc-300">
            A private training log that follows you between devices. Record
            working sets, keep drafts separate from completed workouts, and
            explore your progress without losing the details.
          </p>
          <ul
            aria-label="Technologies"
            className="mb-8 flex flex-wrap gap-2 text-xs text-zinc-300"
          >
            {['Next.js', 'TypeScript', 'SQLite', 'EC2'].map((technology) => (
              <li
                key={technology}
                className="rounded border border-zinc-700 px-3 py-1"
              >
                {technology}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-6 gap-y-4 text-sm">
            <Link
              href="/projects/gym"
              className="font-bold underline underline-offset-4 hover:text-white"
            >
              Read the case study →
            </Link>
            <Link
              href="/gym"
              prefetch={false}
              className="underline underline-offset-4 hover:text-white"
            >
              Open the app ↗
            </Link>
          </div>
          <p className="mt-4 text-xs text-zinc-400">
            App access requires approval. The case study is public.
          </p>
        </article>
        <footer className="mt-16 border-t border-zinc-800 pt-6 text-sm text-zinc-400">
          More projects will appear here as they&apos;re ready to share.
        </footer>
      </main>
    </>
  );
}
