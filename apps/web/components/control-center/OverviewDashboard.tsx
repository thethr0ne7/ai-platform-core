import { usePlatformStats } from '@/hooks/usePlatformStats';
import { useCoverage } from '@/hooks/useCoverage';

export function OverviewDashboard() {
  const stats = usePlatformStats();
  const coverage = useCoverage();

  return (
    <main className="p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-bold">Control Center v0.51</h1>
        <p>AI Platform Core operational dashboard</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric title="Institutions" value={stats.data?.institutions_total} />
        <Metric title="Programs" value={stats.data?.programs_total} />
        <Metric title="Sources" value={stats.data?.sources_total} />
        <Metric title="Runs" value={stats.data?.factory_runs_total} />
      </section>

      <section>
        <h2 className="text-xl font-semibold">Coverage Gate</h2>
        <pre>{JSON.stringify(coverage.data, null, 2)}</pre>
      </section>
    </main>
  );
}

function Metric({title, value}: {title:string; value?:number}) {
  return <div className="rounded-xl border p-4"><div>{title}</div><strong>{value ?? '—'}</strong></div>;
}
