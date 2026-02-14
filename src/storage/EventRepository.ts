import Database from "better-sqlite3";
import { Event, FunnelStage } from "../core/entities";

export function createEventRepository(db: Database.Database) {
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO events (date, funnel_id, stage, count, source)
    VALUES (@date, @funnelId, @stage, @count, @source)
  `);
  const selectByFunnelStmt = db.prepare(`
    SELECT * FROM events WHERE funnel_id = ? ORDER BY date, stage
  `);
  const selectByDateRangeStmt = db.prepare(`
    SELECT * FROM events
    WHERE funnel_id = ? AND date BETWEEN ? AND ?
    ORDER BY date, stage
  `);

  const insertMany = db.transaction((events: Event[]) => {
    for (const evt of events) {
      insertStmt.run({
        date: evt.date,
        funnelId: evt.funnelId,
        stage: evt.stage,
        count: evt.count,
        source: evt.source ?? "",
      });
    }
  });

  function findByFunnel(funnelId: string): Event[] {
    return mapRows(selectByFunnelStmt.all(funnelId) as any[]);
  }

  function findByDateRange(funnelId: string, startDate: string, endDate: string): Event[] {
    return mapRows(selectByDateRangeStmt.all(funnelId, startDate, endDate) as any[]);
  }

  return { insertMany, findByFunnel, findByDateRange };
}

function mapRows(rows: any[]): Event[] {
  return rows.map((r) => ({
    id: String(r.id),
    date: r.date,
    funnelId: r.funnel_id,
    stage: r.stage as FunnelStage,
    count: r.count,
    source: r.source || undefined,
  }));
}
