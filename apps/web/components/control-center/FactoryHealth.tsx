import { useFactoryHealth } from '@/hooks/useFactoryHealth';

export function FactoryHealth() {
  const { data } = useFactoryHealth();

  return (
    <section className="p-8">
      <h1 className="text-2xl font-bold">Factory Health</h1>
      <div>{JSON.stringify(data ?? [], null, 2)}</div>
    </section>
  );
}
