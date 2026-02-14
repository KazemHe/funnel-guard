import { initializeDatabase } from "../Database";
import { createEventRepository } from "../EventRepository";
import { createChangeRepository } from "../ChangeRepository";
import { Event, FunnelStage, ChangeCategory } from "../../core/entities";
import type Database from "better-sqlite3";

describe("Storage Layer", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = initializeDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("initializeDatabase", () => {
    it("should create all required tables", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("events");
      expect(tableNames).toContain("changes");
      expect(tableNames).toContain("breaks");
      expect(tableNames).toContain("diagnoses");
      expect(tableNames).toContain("cause_candidates");
    });
  });

  describe("EventRepository", () => {
    let repo: ReturnType<typeof createEventRepository>;

    beforeEach(() => {
      repo = createEventRepository(db);
    });

    it("should insert and retrieve events", () => {
      repo.insertMany([
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 1000 },
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.CLICK, count: 200 },
      ]);

      const events = repo.findByFunnel("camp-a");
      expect(events).toHaveLength(2);

      const impression = events.find((e: Event) => e.stage === FunnelStage.IMPRESSION)!;
      const click = events.find((e: Event) => e.stage === FunnelStage.CLICK)!;
      expect(impression).toBeDefined();
      expect(impression.funnelId).toBe("camp-a");
      expect(impression.count).toBe(1000);
      expect(click.count).toBe(200);
    });

    it("should handle INSERT OR REPLACE for duplicates", () => {
      repo.insertMany([
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 1000 },
      ]);
      repo.insertMany([
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 1500 },
      ]);

      const events = repo.findByFunnel("camp-a");
      expect(events).toHaveLength(1);
      expect(events[0].count).toBe(1500);
    });

    it("should query by date range", () => {
      repo.insertMany([
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 1000 },
        { date: "2025-01-05", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 1100 },
        { date: "2025-01-10", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 1200 },
      ]);

      const events = repo.findByDateRange("camp-a", "2025-01-03", "2025-01-08");
      expect(events).toHaveLength(1);
      expect(events[0].date).toBe("2025-01-05");
    });

    it("should use transactions for batch inserts", () => {
      const events = Array.from({ length: 100 }, (_, i) => ({
        date: `2025-01-${String(i % 28 + 1).padStart(2, "0")}`,
        funnelId: "camp-a",
        stage: FunnelStage.IMPRESSION,
        count: 1000 + i,
        source: `source-${i}`,
      }));

      repo.insertMany(events);

      const count = db.prepare("SELECT COUNT(*) as cnt FROM events").get() as { cnt: number };
      expect(count.cnt).toBe(100);
    });
  });

  describe("ChangeRepository", () => {
    let repo: ReturnType<typeof createChangeRepository>;

    beforeEach(() => {
      repo = createChangeRepository(db);
    });

    it("should insert and retrieve changes", () => {
      repo.insertMany([
        {
          date: "2025-01-10",
          funnelId: "camp-a",
          category: ChangeCategory.SITE,
          description: "New landing page",
          severity: 4,
          affectedStages: ["landing", "lead"],
        },
      ]);

      const changes = repo.findByFunnel("camp-a");
      expect(changes).toHaveLength(1);
      expect(changes[0].description).toBe("New landing page");
      expect(changes[0].affectedStages).toEqual(["landing", "lead"]);
    });

    it("should include wildcard funnel changes when querying by funnel", () => {
      repo.insertMany([
        {
          date: "2025-01-10",
          funnelId: "*",
          category: ChangeCategory.EXTERNAL,
          description: "Global change",
          severity: 2,
        },
        {
          date: "2025-01-11",
          funnelId: "camp-a",
          category: ChangeCategory.SITE,
          description: "Funnel-specific change",
          severity: 3,
        },
      ]);

      const changes = repo.findByFunnel("camp-a");
      expect(changes).toHaveLength(2);
    });

    it("should query by date range", () => {
      repo.insertMany([
        { date: "2025-01-05", funnelId: "camp-a", category: ChangeCategory.AD, description: "Early change", severity: 2 },
        { date: "2025-01-10", funnelId: "camp-a", category: ChangeCategory.SITE, description: "Mid change", severity: 3 },
        { date: "2025-01-20", funnelId: "camp-a", category: ChangeCategory.PRICING, description: "Late change", severity: 4 },
      ]);

      const changes = repo.findByDateRange("camp-a", "2025-01-08", "2025-01-15");
      expect(changes).toHaveLength(1);
      expect(changes[0].description).toBe("Mid change");
    });

    it("should handle null affected_stages", () => {
      repo.insertMany([
        {
          date: "2025-01-10",
          funnelId: "camp-a",
          category: ChangeCategory.EXTERNAL,
          description: "No stages",
          severity: 2,
        },
      ]);

      const changes = repo.findByFunnel("camp-a");
      expect(changes[0].affectedStages).toBeUndefined();
    });
  });
});
