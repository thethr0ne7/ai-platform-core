export default function Sidebar() {
  return (
    <aside className="w-64 min-h-screen border-r p-6">
      <h1 className="font-bold text-xl">AI Platform Core</h1>
      <nav className="mt-8 space-y-3">
        <a href="/control-center">Overview</a>
        <a href="/control-center/government">Government Intelligence</a>
        <a href="/control-center/health">Factory Health</a>
      </nav>
    </aside>
  );
}
