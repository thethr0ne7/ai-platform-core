import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Status = "PASS" | "PARTIAL" | "FAIL" | "SKIP";

type ProbeResult = {
  id: string;
  status: Status;
  summary: string;
  metrics?: Record<string, number | string | boolean | null>;
};

const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const productionOrigin = process.env.PRODUCTION_ORIGIN ?? "https://ai-platform-core.vercel.app";
const repositoryRoot = resolve(process.cwd());

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function countRows(table: string, filters: string[] = []): Promise<number> {
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("limit", "1");
  for (const filter of filters) {
    const [key, ...rest] = filter.split("=");
    if (!key || rest.length === 0) throw new Error(`Invalid filter: ${filter}`);
    params.append(key, rest.join("="));
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params.toString()}`, {
    method: "GET",
    headers: authHeaders({ Prefer: "count=exact", Range: "0-0" }),
  });
  if (!response.ok) {
    throw new Error(`${table} count failed: ${response.status} ${await response.text()}`);
  }
  const contentRange = response.headers.get("content-range");
  if (!contentRange) throw new Error(`${table} count missing content-range`);
  const total = Number(contentRange.split("/").at(-1));
  if (!Number.isFinite(total)) throw new Error(`${table} invalid content-range: ${contentRange}`);
  return total;
}

async function latestTimestamp(table: string, column: string): Promise<string | null> {
  const params = new URLSearchParams({ select: column, order: `${column}.desc`, limit: "1" });
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(`${table} latest timestamp failed: ${response.status} ${await response.text()}`);
  }
  const rows = await response.json() as Array<Record<string, unknown>>;
  const value = rows[0]?.[column];
  return typeof value === "string" ? value : null;
}

async function preflight(functionName: string): Promise<number> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "OPTIONS",
    headers: authHeaders({
      Origin: productionOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,apikey,content-type,x-client-info",
    }),
  });
  return response.status;
}

async function headStatus(url: string): Promise<number> {
  const response = await fetch(url, { method: "HEAD", redirect: "follow" });
  return response.status;
}

async function sourceContains(path: string, needles: string[]): Promise<boolean> {
  const content = await readFile(resolve(repositoryRoot, path), "utf8");
  return needles.every((needle) => content.includes(needle));
}

function result(id: string, status: Status, summary: string, metrics?: ProbeResult["metrics"]): ProbeResult {
  return metrics ? { id, status, summary, metrics } : { id, status, summary };
}

async function runProbe(id: string): Promise<ProbeResult> {
  switch (id) {
    case "P01": {
      const [web, cors, profiles] = await Promise.all([
        headStatus(productionOrigin),
        preflight("telegram-project-api"),
        countRows("gi_telegram_profiles"),
      ]);
      const status: Status = web < 400 && cors === 200 && profiles > 0 ? "PARTIAL" : "FAIL";
      return result(id, status, "Transport, CORS and persisted profiles are observable; valid HMAC is not replayed by a read-only probe.", { web, cors, profiles });
    }
    case "P02": {
      const [profiles, projects] = await Promise.all([countRows("gi_telegram_profiles"), countRows("gi_projects")]);
      return result(id, profiles > 0 && projects > 0 ? "PASS" : "FAIL", "Existing authenticated profiles have persisted projects.", { profiles, projects });
    }
    case "P03": {
      const contract = await sourceContains("apps/web/components/telegram-project-workspace.tsx", ["create_upload_url", "uploadToSignedUrl"]);
      return result(id, contract ? "PARTIAL" : "FAIL", "Signed-upload contract exists; token creation is not executed because it is a write-enabling transition.", { contract });
    }
    case "P04": {
      const [documents, missingPath] = await Promise.all([countRows("gi_project_documents"), countRows("gi_project_documents", ["storage_path=is.null"])]);
      return result(id, documents > 0 && missingPath === 0 ? "PASS" : "FAIL", "Registered documents retain storage paths.", { documents, missingPath });
    }
    case "P05": {
      const [documents, parsed] = await Promise.all([countRows("gi_project_documents"), countRows("gi_project_documents", ["analysis_status=eq.parsed"])]);
      return result(id, documents > 0 && parsed > 0 ? "PASS" : "FAIL", "Registered documents have reached the processor and parsed state.", { documents, parsed });
    }
    case "P06": {
      const [parsed, chunks] = await Promise.all([countRows("gi_project_documents", ["analysis_status=eq.parsed"]), countRows("gi_project_document_chunks")]);
      return result(id, parsed > 0 && chunks > 0 ? "PASS" : "FAIL", "Parsed documents produced chunks.", { parsed, chunks });
    }
    case "P07": {
      const [chunks, candidates] = await Promise.all([countRows("gi_project_document_chunks"), countRows("gi_project_fact_candidates")]);
      return result(id, chunks > 0 && candidates > 0 ? "PASS" : "FAIL", "Document chunks produced fact candidates.", { chunks, candidates });
    }
    case "P08": {
      const [candidates, confirmed, verifiedFacts] = await Promise.all([
        countRows("gi_project_fact_candidates"),
        countRows("gi_project_fact_candidates", ["status=eq.confirmed"]),
        countRows("gi_project_facts", ["verification_status=eq.verified"]),
      ]);
      return result(id, confirmed > 0 && verifiedFacts > 0 ? "PASS" : "FAIL", "Confirmed candidates produced verified project facts.", { candidates, confirmed, verifiedFacts });
    }
    case "P09": {
      const [facts, checks] = await Promise.all([countRows("gi_project_facts"), countRows("gi_project_checks")]);
      return result(id, facts > 0 && checks > 0 ? "PASS" : "FAIL", "Project facts are followed by persisted project checks.", { facts, checks });
    }
    case "P10": {
      const [matches, missingCheck, missingMeasure] = await Promise.all([
        countRows("gi_project_measure_matches"),
        countRows("gi_project_measure_matches", ["check_id=is.null"]),
        countRows("gi_project_measure_matches", ["measure_id=is.null"]),
      ]);
      return result(id, matches > 0 && missingCheck === 0 && missingMeasure === 0 ? "PASS" : "FAIL", "Measure matches must be bound to both a check and a measure.", { matches, missingCheck, missingMeasure });
    }
    case "P11": {
      const [checks, reports, completed, missingCheck] = await Promise.all([
        countRows("gi_project_checks"),
        countRows("gi_project_reports"),
        countRows("gi_project_reports", ["status=eq.completed"]),
        countRows("gi_project_reports", ["check_id=is.null"]),
      ]);
      return result(id, checks > 0 && completed > 0 && missingCheck === 0 ? "PASS" : "FAIL", "Checks produce completed reports with check references.", { checks, reports, completed, missingCheck });
    }
    case "P12": {
      const [reports, tasks, missingReport] = await Promise.all([
        countRows("gi_project_reports"),
        countRows("gi_project_tasks"),
        countRows("gi_project_tasks", ["report_id=is.null"]),
      ]);
      const status: Status = reports > 0 && tasks > 0 ? (missingReport === 0 ? "PASS" : "PARTIAL") : "FAIL";
      return result(id, status, "Reports produce actionable tasks; null report references are surfaced.", { reports, tasks, missingReport });
    }
    case "P13": {
      const [documents, versions] = await Promise.all([countRows("gi_source_documents"), countRows("gi_source_versions")]);
      return result(id, documents > 0 && versions > 0 ? "PASS" : "FAIL", "Official-source documents have version snapshots.", { documents, versions });
    }
    case "P14": {
      const [versions, evidence, missingLocator, missingQuote] = await Promise.all([
        countRows("gi_source_versions"),
        countRows("gi_evidence_records"),
        countRows("gi_evidence_records", ["locator=is.null", "source_locator=is.null"]),
        countRows("gi_evidence_records", ["quote=is.null"]),
      ]);
      return result(id, versions > 0 && evidence > 0 && missingLocator === 0 && missingQuote === 0 ? "PASS" : "FAIL", "Evidence records retain quote and locator fields.", { versions, evidence, missingLocator, missingQuote });
    }
    case "P15": {
      const verified = await countRows("gi_evidence_records", ["or=(status.eq.verified,verification_status.eq.verified)"]);
      return result(id, verified > 0 ? "PASS" : "FAIL", "Evidence review must produce verified evidence.", { verified });
    }
    case "P16": {
      const [verifiedRequirements, measuresWithoutSource] = await Promise.all([
        countRows("gi_measure_requirements", ["evidence_status=eq.verified"]),
        countRows("gi_support_measures", ["source_document_id=is.null"]),
      ]);
      return result(id, verifiedRequirements > 0 && measuresWithoutSource === 0 ? "PASS" : "FAIL", "Verified evidence must close requirements and every measure must trace to a source document.", { verifiedRequirements, measuresWithoutSource });
    }
    case "P17": {
      const links = await countRows("gi_signal_evidence");
      return result(id, links > 0 ? "PASS" : "FAIL", "Analytic signals require explicit evidence links.", { links });
    }
    case "P18": {
      const [cards, withoutEvidence] = await Promise.all([countRows("gi_decision_cards"), countRows("gi_decision_cards", ["evidence_id=is.null"])]);
      return result(id, cards > 0 && withoutEvidence === 0 ? "PASS" : "FAIL", "Decision Cards must carry an evidence reference.", { cards, withoutEvidence });
    }
    case "P19": {
      const [cards, passed, nullGate] = await Promise.all([
        countRows("gi_decision_cards"),
        countRows("gi_decision_cards", ["truth_gate_passed=eq.true"]),
        countRows("gi_decision_cards", ["truth_gate_passed=is.null"]),
      ]);
      return result(id, cards > 0 && nullGate === 0 ? "PASS" : "FAIL", "Truth Gate executes deterministically even when it fails closed.", { cards, passed, nullGate });
    }
    case "P20": {
      const passed = await countRows("gi_decision_cards", ["truth_gate_passed=eq.true"]);
      return result(id, passed > 0 ? "PASS" : "FAIL", "At least one controlled traceable result must pass Truth Gate.", { passed });
    }
    case "P21": {
      const [forecasts, links] = await Promise.all([countRows("gi_forecasts"), countRows("gi_signal_evidence")]);
      return result(id, forecasts > 0 && links > 0 ? "PASS" : "SKIP", "Forecasting remains disabled until evidence-backed signals exist.", { forecasts, links });
    }
    case "P22": {
      const [deadLetters, latestRun] = await Promise.all([countRows("gi_crawl_jobs", ["status=eq.dead_letter"]), latestTimestamp("gi_ingestion_runs", "created_at")]);
      return result(id, deadLetters === 0 ? "PASS" : "FAIL", "Dead-letter jobs require retry or explicit manual resolution.", { deadLetters, latestRun });
    }
    case "P23": {
      const [pending, queued, latestQueue] = await Promise.all([
        countRows("ingestion_queue", ["status=eq.pending"]),
        countRows("ingestion_jobs", ["status=eq.queued"]),
        latestTimestamp("ingestion_queue", "updated_at"),
      ]);
      return result(id, pending === 0 && queued === 0 ? "PASS" : "FAIL", "Legacy admissions remains active in the shared production data plane and is not isolated.", { pending, queued, latestQueue });
    }
    case "P24": {
      const navigationOnly = await sourceContains("apps/web/components/infinite-zoom-controller.tsx", ["element.hidden", "window.history.replaceState"]);
      const backendAware = await sourceContains("apps/web/components/infinite-zoom-controller.tsx", ["callTelegramApi", "callGovernmentOpportunityApi"]).catch(() => false);
      return result(id, navigationOnly && !backendAware ? "FAIL" : backendAware ? "PASS" : "PARTIAL", "Meniscus must derive availability from backend readiness, not only DOM ranges and URL hash.", { navigationOnly, backendAware });
    }
    default:
      return result(id, "SKIP", "Probe is not implemented.");
  }
}

function calculateGate(name: string, ids: string[], results: ProbeResult[]): { name: string; status: "PASS" | "FAIL" | "BLOCKED" } {
  const selected = results.filter((item) => ids.includes(item.id));
  if (selected.some((item) => item.status === "FAIL")) return { name, status: "FAIL" };
  if (selected.some((item) => item.status === "SKIP")) return { name, status: "BLOCKED" };
  return { name, status: "PASS" };
}

async function main(): Promise<void> {
  const matrixPath = resolve(repositoryRoot, "ops/e2e/system-interaction-matrix.v1.json");
  const matrix = JSON.parse(await readFile(matrixPath, "utf8")) as {
    probes: Array<{ id: string }>;
    release_gates: Record<string, { name: string; required_probes: string[] }>;
  };

  const results: ProbeResult[] = [];
  for (const probe of matrix.probes) {
    try {
      results.push(await runProbe(probe.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push(result(probe.id, "FAIL", message));
    }
  }

  const gates = Object.entries(matrix.release_gates).map(([id, gate]) => ({ id, ...calculateGate(gate.name, gate.required_probes, results) }));
  const output = {
    audit_id: "system-interaction-audit-v1",
    generated_at: new Date().toISOString(),
    read_only_contract: { allowed_http_methods: ["GET", "HEAD", "OPTIONS"], writes_performed: false },
    summary: {
      PASS: results.filter((item) => item.status === "PASS").length,
      PARTIAL: results.filter((item) => item.status === "PARTIAL").length,
      FAIL: results.filter((item) => item.status === "FAIL").length,
      SKIP: results.filter((item) => item.status === "SKIP").length,
    },
    gates,
    results,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (results.some((item) => item.status === "FAIL")) process.exitCode = 1;
}

void main();
