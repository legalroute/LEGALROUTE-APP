import { useEffect, useState } from 'react';

type Health = { status: string; database: string };
const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export default function App() {
  const [status, setStatus] = useState('Checking connection…');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/health`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Service unavailable');
        return response.json() as Promise<Health>;
      })
      .then((health) => setStatus(health.status === 'ok' && health.database === 'connected'
        ? 'API and database connected' : 'Services unavailable'))
      .catch(() => { if (!controller.signal.aborted) setStatus('API or database unavailable'); });
    return () => controller.abort();
  }, []);

  return (
    <main>
      <header><a className="brand" href="/">LegalRoute<span> / </span></a><span className="badge">Development workspace</span></header>
      <section className="intro">
        <p className="eyebrow">A clear path forward</p>
        <h1>Your next chapter<br />starts here.</h1>
        <p className="description">The foundation for LegalRoute: a connected workspace for building better legal journeys.</p>
        <p className="status" role="status">{status}</p>
      </section>
      <section className="grid" aria-label="Project foundation">
        <article><span>01 / INTERFACE</span><h2>Frontend</h2><p>React and TypeScript, ready for your first workflow.</p></article>
        <article><span>02 / SERVICES</span><h2>Backend</h2><p>Express connected to a local PostgreSQL database.</p></article>
        <article><span>03 / AUTOMATION</span><h2>Agents</h2><p>A dedicated home for future tools and automations.</p></article>
      </section>
      <footer>LegalRoute · Built with a clear direction.</footer>
    </main>
  );
}
