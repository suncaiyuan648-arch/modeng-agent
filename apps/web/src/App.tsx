import { useBootstrapStore } from './bootstrap-store.js';

export function App() {
  const status = useBootstrapStore((state) => state.status);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <section className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <p className="text-sm font-semibold tracking-[0.2em] text-cyan-400">PHASE 0</p>
        <h1 className="mt-3 text-4xl font-semibold">Modern Agent Platform</h1>
        <p className="mt-4 text-slate-300">
          Repository bootstrap is {status}. No Agent capability has been implemented yet.
        </p>
      </section>
    </main>
  );
}
