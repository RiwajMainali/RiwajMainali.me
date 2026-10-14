import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { api } from '../../lib/gym/client';
export default function Approve() {
  const { query, isReady } = useRouter();
  const [person, setPerson] = useState<{ name: string; email: string } | null>(
      null
    ),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isReady) return;
    void api<{ name: string; email: string }>(
      'approve?token=' + encodeURIComponent(String(query.token ?? ''))
    )
      .then(setPerson)
      .catch((e) => setMessage((e as Error).message));
  }, [isReady, query.token]);
  async function decide(decision: string) {
    setBusy(true);
    try {
      const r = await api<{ message: string }>('approve', 'POST', {
        token: query.token,
        decision,
      });
      setMessage(r.message);
      setPerson(null);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="gym">
      <Head>
        <title>Review access · riwaj.me/gym</title>
        <meta name="referrer" content="no-referrer" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <header className="gym-header">
        <Link href="/gym">riwaj.me/gym</Link>
      </header>
      <section className="gym-access gym-card">
        <h1>Review gym access</h1>
        <p>
          This single-use link was sent to Riwaj’s email. Opening it does not
          approve anyone.
        </p>
        {person && (
          <>
            <h2>{person.name}</h2>
            <p>{person.email}</p>
            <div className="gym-row">
              <button disabled={busy} onClick={() => void decide('approved')}>
                Approve access
              </button>
              <button disabled={busy} onClick={() => void decide('rejected')}>
                Reject request
              </button>
            </div>
          </>
        )}
        {message && <p role="status">{message}</p>}
      </section>
    </main>
  );
}
