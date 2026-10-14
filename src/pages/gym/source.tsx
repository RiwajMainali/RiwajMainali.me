import Head from 'next/head';
import Link from 'next/link';
export default function Source() {
  return (
    <main className="gym">
      <Head>
        <title>Source & licenses · riwaj.me/gym</title>
      </Head>
      <header className="gym-header">
        <Link href="/gym">riwaj.me/gym</Link>
      </header>
      <section className="gym-access gym-card">
        <h1>Source & licenses</h1>
        <p>
          The gym module is open source under AGPL-3.0-or-later. Its text
          exercise catalogue is adapted from openGym, commit
          e348fc17c42c7e9a211c5972e573ad3698190ee2. All 5,632 entries are
          retained with stable IDs; no exercise media is included.
        </p>
        <p>
          <a href="/gym-source.tar.gz" download>
            Download this version’s gym source, tests and build instructions
          </a>
        </p>
        <p>
          <a href="https://github.com/DuarteSantos8/openGym">
            Upstream openGym source and licenses
          </a>
        </p>
        <p>
          Your uploaded media and training records are private and are never
          included in the source download.
        </p>
      </section>
    </main>
  );
}
