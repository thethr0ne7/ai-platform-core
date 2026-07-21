import { useSignals } from '@/hooks/useSignals';

export function GovernmentIntelligence() {
  const { data } = useSignals();

  return (
    <section className="p-8">
      <h1 className="text-2xl font-bold">Government Intelligence</h1>
      <div>{JSON.stringify(data ?? [], null, 2)}</div>
    </section>
  );
}
