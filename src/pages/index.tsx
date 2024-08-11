import Head from 'next/head';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Landing from './landing';
export default function Home() {
  return (
    <>
      <Head>
        <title>Riwaj Mainali</title>
        <meta name="description" content="Landing Page" />
      </Head>
      <main className="flex min-h-screen flex-col justify-center">
        <Landing />
      </main>
    </>
  );
}
