import { createDefaultSourceRunner } from "./source-runner.js";
import { SupabaseSourcePersistence } from "./supabase-source-persistence.js";

interface CliOptions {
  from?: string;
  to?: string;
  query?: string;
  pageSize?: number;
  maxPages?: number;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--")) continue;
    if (!value || value.startsWith("--")) throw new Error(`Для ${key} не указано значение`);
    if (key === "--from") options.from = value;
    else if (key === "--to") options.to = value;
    else if (key === "--query") options.query = value;
    else if (key === "--page-size") options.pageSize = parsePositiveInteger(key, value);
    else if (key === "--max-pages") options.maxPages = parsePositiveInteger(key, value);
    else throw new Error(`Неизвестный аргумент ${key}`);
    index += 1;
  }
  return options;
}

function parsePositiveInteger(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} должен быть положительным целым числом`);
  return parsed;
}

async function main(): Promise<void> {
  const window = parseArgs(process.argv.slice(2));
  const persistence = SupabaseSourcePersistence.fromEnv();
  const runner = createDefaultSourceRunner(persistence);
  const results = await runner.run(window);

  const totals = results.reduce(
    (acc, item) => ({
      discovered: acc.discovered + item.discovered,
      persisted: acc.persisted + item.persisted,
      skipped: acc.skipped + item.skipped,
      failed: acc.failed + item.failed,
    }),
    { discovered: 0, persisted: 0, skipped: 0, failed: 0 },
  );

  console.log(JSON.stringify({ results, totals }, null, 2));
  if (totals.failed > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
