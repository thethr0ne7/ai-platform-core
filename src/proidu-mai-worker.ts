import { pathToFileURL } from "node:url";
import { createIngestionJob, type IngestionJob } from "./autonomous-data.js";
import {
  PROIDU_MAI_SOURCE,
  fetchOfficialHtml
} from "./proidu-mai.js";
import {
  SupabaseIngestionLedger,
  SupabasePostgrestClient,
  SupabaseSourceCheckpointStore,
  SupabaseVersionStore,
  runPersistentMaiVerticalSlice,
  type PersistentMaiSliceResult
} from "./supabase-persistence.js";

export interface ProiduMaiWorkerEnvironment {
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly PROIDU_MAI_QUERY?: string;
}

export interface ProiduMaiWorkerConfig {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
  readonly query: string;
}

export interface ProiduMaiWorkerSummary {
  readonly status: "succeeded" | "duplicate";
  readonly sourceId: string;
  readonly scheduledFor: string;
  readonly jobId: string;
  readonly parsedCount: number;
  readonly quarantinedCount: number;
  readonly persistedCount: number;
  readonly searchResultCount: number;
  readonly completedAt: string;
}

interface WorkerExecutionInput {
  readonly config: ProiduMaiWorkerConfig;
  readonly job: IngestionJob;
  readonly html: string;
  readonly query: string;
  readonly now: Date;
}

export interface ProiduMaiWorkerDependencies {
  readonly now?: () => Date;
  readonly fetchHtml?: (url: string) => Promise<string>;
  readonly execute?: (input: WorkerExecutionInput) => Promise<PersistentMaiSliceResult>;
  readonly persistenceFetch?: typeof fetch;
  readonly sourceFetch?: typeof fetch;
}

function requiredEnvironmentValue(
  environment: ProiduMaiWorkerEnvironment,
  key: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY"
): string {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

export function loadProiduMaiWorkerConfig(
  environment: ProiduMaiWorkerEnvironment
): ProiduMaiWorkerConfig {
  const supabaseUrl = requiredEnvironmentValue(environment, "SUPABASE_URL").replace(/\/$/, "");
  if (!/^https:\/\//.test(supabaseUrl)) throw new Error("SUPABASE_URL must use HTTPS");

  const serviceRoleKey = requiredEnvironmentValue(environment, "SUPABASE_SERVICE_ROLE_KEY");
  const query = environment.PROIDU_MAI_QUERY?.trim() || "программная инженерия";

  return { supabaseUrl, serviceRoleKey, query };
}

async function executeWithSupabase(
  input: WorkerExecutionInput,
  persistenceFetch: typeof fetch
): Promise<PersistentMaiSliceResult> {
  const client = new SupabasePostgrestClient(
    {
      url: input.config.supabaseUrl,
      serviceRoleKey: input.config.serviceRoleKey
    },
    persistenceFetch
  );

  return runPersistentMaiVerticalSlice({
    job: input.job,
    html: input.html,
    query: input.query,
    now: input.now,
    ledger: new SupabaseIngestionLedger(client),
    versions: new SupabaseVersionStore(client),
    checkpoints: new SupabaseSourceCheckpointStore(client)
  });
}

export async function runProiduMaiWorker(
  environment: ProiduMaiWorkerEnvironment,
  dependencies: ProiduMaiWorkerDependencies = {}
): Promise<ProiduMaiWorkerSummary> {
  const config = loadProiduMaiWorkerConfig(environment);
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Worker clock returned an invalid date");

  const job = createIngestionJob(PROIDU_MAI_SOURCE, now);
  const html = await (
    dependencies.fetchHtml ??
    ((url: string) =>
      fetchOfficialHtml(
        url,
        {
          timeoutMs: 15_000,
          maxResponseBytes: 3_000_000,
          maxAttempts: 3,
          baseDelayMs: 500,
          userAgent: "PROIDU-Scheduled-Worker/0.13 (+https://github.com/thethr0ne7/ai-platform-core)"
        },
        dependencies.sourceFetch ?? fetch
      ))
  )(PROIDU_MAI_SOURCE.url);

  const result = await (
    dependencies.execute ??
    ((input: WorkerExecutionInput) => executeWithSupabase(input, dependencies.persistenceFetch ?? fetch))
  )({ config, job, html, query: config.query, now });

  return {
    status: result.persistentDuplicate ? "duplicate" : "succeeded",
    sourceId: job.sourceId,
    scheduledFor: job.scheduledFor,
    jobId: job.id,
    parsedCount: result.parsedCount,
    quarantinedCount: result.quarantinedCount,
    persistedCount: result.persistedCount,
    searchResultCount: result.searchResults.length,
    completedAt: now.toISOString()
  };
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Worker failed";
  return message.slice(0, 500);
}

export async function main(
  environment: ProiduMaiWorkerEnvironment = process.env
): Promise<number> {
  try {
    const summary = await runProiduMaiWorker(environment);
    console.log(JSON.stringify({ event: "proidu.mai.worker.completed", ...summary }));
    return 0;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "proidu.mai.worker.failed",
        error: safeErrorMessage(error),
        completedAt: new Date().toISOString()
      })
    );
    return 1;
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  process.exitCode = await main();
}
