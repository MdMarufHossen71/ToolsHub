/** Benchmark builder: timed runs of small workloads, ops/sec table. */
import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/AppSettingsContext";

type BenchResult = { name: string; ops: number; ms: number };

const WORKLOADS: Array<{ id: string; run: (n: number) => number }> = [
  {
    id: "json",
    run: (n) => {
      let total = 0;
      for (let i = 0; i < n; i += 1) total += JSON.stringify({ a: i, b: "x".repeat(20) }).length;
      return total;
    },
  },
  {
    id: "regex",
    run: (n) => {
      const re = /[a-z]+@[a-z]+\.[a-z]+/g;
      let total = 0;
      for (let i = 0; i < n; i += 1) total += "mail user@example.com ok".match(re)?.length ?? 0;
      return total;
    },
  },
  {
    id: "crypto",
    run: (n) => {
      const bytes = new Uint8Array(64);
      let total = 0;
      for (let i = 0; i < n; i += 1) {
        crypto.getRandomValues(bytes);
        total += bytes[0] ?? 0;
      }
      return total;
    },
  },
  {
    id: "sort",
    run: (n) => {
      let total = 0;
      for (let i = 0; i < n; i += 1) {
        const list = Array.from({ length: 200 }, (_, k) => 200 - k);
        list.sort((a, b) => a - b);
        total += list[0] ?? 0;
      }
      return total;
    },
  },
];

export function BenchmarkBuilder() {
  const { t } = useTranslation();
  const [results, setResults] = useState<BenchResult[]>([]);
  const [running, setRunning] = useState(false);
  const cancelled = useRef(false);

  const run = async () => {
    if (running) return;
    setRunning(true);
    cancelled.current = false;
    const out: BenchResult[] = [];
    for (const workload of WORKLOADS) {
      if (cancelled.current) break;
      // Warm up, then time a fixed batch and scale.
      workload.run(3);
      const batch = 10;
      const started = performance.now();
      workload.run(batch);
      const ms = Math.max(0.5, performance.now() - started);
      out.push({ name: workload.id, ops: Math.round((batch / ms) * 1000), ms: Math.round(ms) });
      setResults([...out]);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    setRunning(false);
  };

  return (
    <div className="live-stage">
      <div className="bench-actions bench-actions-center">
        {running ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              cancelled.current = true;
            }}
          >
            {t("tool.live.stop")}
          </Button>
        ) : (
          <Button size="sm" onClick={() => void run()}>
            <Play className="mr-2 size-3.5" aria-hidden="true" />
            {t("tool.run")}
          </Button>
        )}
      </div>
      {results.length > 0 ? (
        <div className="tool-table-wrap">
          <table className="tool-table">
            <caption className="sr-only">{t("tool.live.workload")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("tool.live.workload")}</th>
                <th scope="col">{t("tool.live.opsSec")}</th>
                <th scope="col">{t("tool.live.batchMs")}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.ops.toLocaleString()}</td>
                  <td>{row.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !running && <p className="form-hint">{t("tool.result.needsInput")}</p>
      )}
    </div>
  );
}
