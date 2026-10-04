import Head from 'next/head';
import NeonName from '~/components/NeonName';
import Terminal from '~/components/Terminal';
import Waterfall from '~/components/Waterfall';

export default function Home() {
  return (
    <>
      <Head>
        <title>Riwaj Mainali</title>
        <meta name="description" content="Riwaj Mainali's personal site. It's a shell; type help." />
      </Head>
      <Waterfall />
      <main className="relative z-10 flex min-h-screen flex-col gap-10 px-4 py-16 sm:px-10 sm:py-24">
        <NeonName text="Riwaj Mainali" />
        <Terminal />
      </main>
    </>
  );
}
