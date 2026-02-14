import fs from "fs";
import { parse } from "csv-parse/sync";
import { Event, FunnelStage } from "../../core/entities";

export interface LoaderError {
  line: number;
  message: string;
}

export interface EventLoaderResult {
  events: Event[];
  errors: LoaderError[];
}

const VALID_STAGES = new Set(Object.values(FunnelStage));

export function loadEventsFromCsv(filePath: string): EventLoaderResult {
  const content = fs.readFileSync(filePath, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const events: Event[] = [];
  const errors: LoaderError[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const lineNum = i + 2;

    if (!row.date || !row.funnel_id || !row.stage || row.count === undefined) {
      errors.push({ line: lineNum, message: "Missing required field(s)" });
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      errors.push({ line: lineNum, message: `Invalid date format: ${row.date}` });
      continue;
    }

    const stage = row.stage.toLowerCase() as FunnelStage;
    if (!VALID_STAGES.has(stage)) {
      errors.push({ line: lineNum, message: `Invalid stage: ${row.stage}` });
      continue;
    }

    const count = parseInt(row.count, 10);
    if (isNaN(count) || count < 0) {
      errors.push({ line: lineNum, message: `Invalid count: ${row.count}` });
      continue;
    }

    events.push({
      date: row.date,
      funnelId: row.funnel_id,
      stage,
      count,
      source: row.source || undefined,
    });
  }

  return { events, errors };
}
