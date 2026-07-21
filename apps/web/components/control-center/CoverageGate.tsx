export default function CoverageGate({coverage}:{coverage:any}) {
  return <section><h2>Data Coverage Gate</h2><pre>{JSON.stringify(coverage,null,2)}</pre></section>;
}
