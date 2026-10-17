import Head from 'next/head';
import Link from 'next/link';
import resume from '~/data/resume.json';

export default function Resume() {
  return (
    <>
      <Head>
        <title>Résumé · {resume.name}</title>
        <meta name="description" content={resume.summary} />
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
            href="/about"
            className="underline underline-offset-4 hover:text-white"
          >
            about
          </Link>
          <Link
            href="/projects"
            className="underline underline-offset-4 hover:text-white"
          >
            projects
          </Link>
        </nav>
        <header className="mb-12">
          <p className="mb-4 text-sm text-zinc-400">
            guest@riwaj.me:~$ cat resume
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-6xl">
            {resume.name}
          </h1>
          <p className="mb-5 text-lg">{resume.headline}</p>
          <p className="max-w-3xl leading-relaxed text-zinc-300">
            {resume.summary}
          </p>
          <div className="mt-8 flex flex-wrap gap-5 text-sm">
            <a
              href="/Riwaj-Mainali-Resume.pdf"
              download
              className="rounded border border-[#39ff14]/60 px-4 py-3 hover:bg-[#39ff14]/10"
            >
              Download résumé (PDF) ↓
            </a>
            <a
              href={resume.linkedin}
              className="px-1 py-3 underline underline-offset-4 hover:text-white"
            >
              Contact me on LinkedIn ↗
            </a>
          </div>
        </header>
        <section
          aria-labelledby="experience"
          className="mb-12 border-t border-zinc-800 pt-8"
        >
          <h2 id="experience" className="mb-8 text-2xl font-bold">
            Experience
          </h2>
          <div className="space-y-10">
            {resume.experience.map((job) => (
              <article key={job.organization}>
                <h3 className="mb-2 text-xl font-bold">{job.title}</h3>
                <p className="mb-2 text-zinc-300">{job.organization}</p>
                <p className="mb-5 text-sm text-zinc-400">{job.dates}</p>
                <ul className="max-w-3xl list-disc space-y-3 pl-5 leading-relaxed text-zinc-300">
                  {job.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
        <section
          aria-labelledby="education"
          className="mb-12 border-t border-zinc-800 pt-8"
        >
          <h2 id="education" className="mb-8 text-2xl font-bold">
            Education
          </h2>
          <div className="space-y-8">
            {resume.education.map((education) => (
              <article key={education.institution}>
                <h3 className="mb-2 text-xl font-bold">
                  {education.institution}
                </h3>
                <p className="mb-2 text-zinc-300">{education.degree}</p>
                <p className="text-sm text-zinc-400">{education.dates}</p>
                {education.detail ? (
                  <p className="mt-2 text-sm text-zinc-300">
                    {education.detail}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
        <section
          aria-labelledby="skills"
          className="mb-12 border-t border-zinc-800 pt-8"
        >
          <h2 id="skills" className="mb-5 text-2xl font-bold">
            Skills
          </h2>
          <ul className="flex flex-wrap gap-2 text-sm text-zinc-300">
            {resume.skills.map((skill) => (
              <li
                key={skill}
                className="rounded border border-zinc-700 px-3 py-2"
              >
                {skill}
              </li>
            ))}
          </ul>
        </section>
        <section
          aria-labelledby="projects"
          className="border-t border-zinc-800 pt-8"
        >
          <h2 id="projects" className="mb-6 text-2xl font-bold">
            Selected projects
          </h2>
          <div className="space-y-6">
            {resume.projects.map((project) => (
              <article key={project.name}>
                <h3 className="mb-3 text-lg font-bold">
                  <Link
                    href={
                      project.name === 'Private gym tracker'
                        ? '/projects/gym'
                        : '/'
                    }
                    className="underline underline-offset-4 hover:text-white"
                  >
                    {project.name} →
                  </Link>
                </h3>
                <p className="max-w-3xl leading-relaxed text-zinc-300">
                  {project.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
