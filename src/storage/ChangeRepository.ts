import Database from "better-sqlite3";
import { Change, ChangeCategory } from "../core/entities";

export function createChangeRepository(db: Database.Database) {
  const insertStmt = db.prepare(`
    INSERT INTO changes (date, funnel_id, category, description, severity, affected_stages)
    VALUES (@date, @funnelId, @category, @description, @severity, @affectedStages)
  `);
  const selectByFunnelStmt = db.prepare(`
    SELECT * FROM changes WHERE funnel_id = ? OR funnel_id = '*' ORDER BY date
  `);
  const selectByDateRangeStmt = db.prepare(`
    SELECT * FROM changes
    WHERE (funnel_id = ? OR funnel_id = '*') AND date BETWEEN ? AND ?
    ORDER BY date
  `);

  const insertMany = db.transaction((changes: Change[]) => {
    for (const chg of changes) {
      insertStmt.run({
        date: chg.date,
        funnelId: chg.funnelId,
        category: chg.category,
        description: chg.description,
        severity: chg.severity,
        affectedStages: chg.affectedStages ? chg.affectedStages.join(";") : null,
      });
    }
  });

  function findByFunnel(funnelId: string): Change[] {
    return mapRows(selectByFunnelStmt.all(funnelId) as any[]);
  }

  function findByDateRange(funnelId: string, startDate: string, endDate: string): Change[] {
    return mapRows(selectByDateRangeStmt.all(funnelId, startDate, endDate) as any[]);
  }

  return { insertMany, findByFunnel, findByDateRange };
}

function mapRows(rows: any[]): Change[] {
  return rows.map((r) => ({
    id: String(r.id),
    date: r.date,
    funnelId: r.funnel_id,
    category: r.category as ChangeCategory,
    description: r.description,
    severity: r.severity,
    affectedStages: r.affected_stages
      ? r.affected_stages.split(";").filter(Boolean)
      : undefined,
  }));
}
