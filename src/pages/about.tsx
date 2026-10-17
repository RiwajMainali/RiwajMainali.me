import Head from 'next/head';
import Link from 'next/link';
import { profile } from '~/data/profile';

export default function About() {
  return (
    <>
      <Head>
        <title>About · {profile.name}</title>
        <meta name="description" content={profile.bio} />
      </Head>
      <main className="mx-auto min-h-screen max-w-5xl px-5 py-10 font-mono sm:px-10 sm:py-16">
        <nav
          aria-label="Main navigation"
          className="mb-16 flex flex-wrap gap-x-6 gap-y-3 text-sm"
        >
          <Link
            href="/"
            className="underline underline-offset-4 hover:text-white"
          >
            ~/home
          </Link>
          <Link
            href="/projects"
            className="underline underline-offset-4 hover:text-white"
          >
            projects
          </Link>
          <a
            href="#contact"
            className="underline underline-offset-4 hover:text-white"
          >
            contact
          </a>
        </nav>
        <header className="mb-12 max-w-3xl">
          <p className="mb-4 text-sm text-zinc-400">
            guest@riwaj.me:~$ cat about.txt
          </p>
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl">
            Hi, I&apos;m Riwaj.
          </h1>
          {profile.role ? (
            <p className="mb-4 text-lg text-[#39ff14]">{profile.role}</p>
          ) : null}
          <p className="text-lg leading-relaxed text-zinc-300">{profile.bio}</p>
        </header>
        <section
          aria-labelledby="work"
          className="mb-12 border-t border-zinc-800 pt-8"
        >
          <h2 id="work" className="mb-5 text-2xl font-bold">
            What I&apos;m building
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <article className="rounded-xl border border-[#39ff14]/30 bg-zinc-950 p-6">
              <h3 className="mb-4 text-xl font-bold">A private gym tracker</h3>
              <p className="mb-6 leading-relaxed text-zinc-300">
                Detailed training logs, drafts that sync across devices, and
                exercise history with context. Built with Next.js, TypeScript
                and SQLite.
              </p>
              <Link
                href="/projects/gym"
                className="text-sm underline underline-offset-4 hover:text-white"
              >
                Read the case study →
              </Link>
            </article>
            <article className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
              <h3 className="mb-4 text-xl font-bold">This little shell</h3>
              <p className="mb-6 leading-relaxed text-zinc-300">
                A simulated filesystem, hidden commands, a neon sign and an SDR
                waterfall. A personal site with a few things to discover.
              </p>
              <Link
                href="/"
                className="text-sm underline underline-offset-4 hover:text-white"
              >
                Explore the terminal →
              </Link>
            </article>
          </div>
        </section>
        <section
          id="contact"
          aria-labelledby="contact-heading"
          className="scroll-mt-8 border-t border-zinc-800 pt-8"
        >
          <h2 id="contact-heading" className="mb-4 text-2xl font-bold">
            Find me
          </h2>
          <p className="mb-6 max-w-2xl leading-relaxed text-zinc-300">
            For questions, opportunities, or a conversation about my work,
            contact me on LinkedIn. You can also find my code on GitHub.
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-4 text-sm">
            <a
              href={profile.linkedin}
              className="underline underline-offset-4 hover:text-white"
            >
              Contact me on LinkedIn ↗
            </a>
            <a
              href={profile.github}
              className="underline underline-offset-4 hover:text-white"
            >
              GitHub ↗
            </a>
            {profile.resume ? (
              <a
                href={profile.resume}
                className="underline underline-offset-4 hover:text-white"
              >
                View résumé ↗
              </a>
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}
