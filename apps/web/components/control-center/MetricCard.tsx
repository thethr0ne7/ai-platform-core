export default function MetricCard({title,value}:{title:string,value:string|number}) {
  return <div className="rounded-xl border p-4"><div>{title}</div><strong>{value}</strong></div>;
}
