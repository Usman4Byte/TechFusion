import Link from "next/link";
import { runSelfTest } from "@/lib/selftest/run";

export const dynamic = "force-dynamic";
export const metadata = { title: "LabLens · Self-test" };

export default function TestsPage() {
  const { passed, total, cases } = runSelfTest();
  const groups = [...new Set(cases.map((c) => c.group))];
  const all = passed === total;
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-brand hover:underline">← Back to LabLens</Link>
          <h1 className="mt-1 text-2xl font-bold">Live self-test</h1>
          <p className="text-muted">Every tricky case runs against the real rule engine each time this page loads.</p>
        </div>
        <div className={`rounded-2xl px-5 py-3 text-center ${all ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
          <div className="text-3xl font-bold">{passed} / {total}</div>
          <div className="text-xs font-semibold uppercase">passing</div>
        </div>
      </div>
      {groups.map((g) => (
        <section key={g} className="overflow-hidden rounded-2xl border border-line bg-panel">
          <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold tracking-wide text-muted uppercase">{g}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Case</th>
                  <th className="px-4 py-2">Expected</th>
                  <th className="px-4 py-2">Actual</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {cases.filter((c) => c.group === g).map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-4 py-2 font-mono text-xs text-muted">{c.id}</td>
                    <td className="px-4 py-2">{c.title}</td>
                    <td className="px-4 py-2 font-mono text-xs">{c.expected}</td>
                    <td className="px-4 py-2 font-mono text-xs">{c.actual}</td>
                    <td className={`px-4 py-2 font-bold ${c.passed ? "text-ok" : "text-bad"}`}>{c.passed ? "✓" : "✕"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
