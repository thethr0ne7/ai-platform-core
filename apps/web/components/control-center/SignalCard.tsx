export default function SignalCard({signal}:{signal:any}) {
  return <div className="rounded-xl border p-4"><pre>{JSON.stringify(signal,null,2)}</pre></div>;
}
