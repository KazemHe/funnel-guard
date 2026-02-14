import fs from "fs";
import { parse } from "csv-parse/sync";
import { Change, ChangeCategory } from "../../core/entities";

export interface LoaderError {
  line: number;
  message: string;
}

export interface ChangeLoaderResult {
  changes: Change[];
  errors: LoaderError[];
}

const VALID_CATEGORIES = new Set(Object.values(ChangeCategory));

export function loadChangesFromCsv(filePath: string): ChangeLoaderResult {
  const content = fs.readFileSync(filePath, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const changes: Change[] = [];
  const errors: LoaderError[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const lineNum = i + 2;

    if (!row.date || !row.funnel_id || !row.category || !row.description || row.severity === undefined) {
      errors.push({ line: lineNum, message: "Missing required field(s)" });
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      errors.push({ line: lineNum, message: `Invalid date format: ${row.date}` });
      continue;
    }

    const category = row.category.toLowerCase() as ChangeCategory;
    if (!VALID_CATEGORIES.has(category)) {
      errors.push({ line: lineNum, message: `Invalid category: ${row.category}` });
      continue;
    }

    const severity = parseInt(row.severity, 10);
    if (isNaN(severity) || severity < 1 || severity > 5) {
      errors.push({ line: lineNum, message: `Invalid severity (must be 1-5): ${row.severity}` });
      continue;
    }

    const affectedStages = row.affected_stages
      ? row.affected_stages.split(";").map((s) => s.trim()).filter(Boolean)
      : undefined;

    changes.push({
      date: row.date,
      funnelId: row.funnel_id,
      category,
      description: row.description,
      severity,
      affectedStages,
    });
  }

  return { changes, errors };
}
