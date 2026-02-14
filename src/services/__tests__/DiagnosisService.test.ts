import fs from "fs";
import path from "path";
import os from "os";
import { runDiagnosis, runDiagnosisFromData } from "../DiagnosisService";
import { Diagnosis } from "../../core/entities/Diagnosis";
import { FunnelStage, ChangeCategory } from "../../core/entities";

describe("DiagnosisService", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fg-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(name: string, content: string): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  function generateEventsCsv(
    baselineDays: number,
    dropDays: number,
    normalLanding: number,
    droppedLanding: number
  ): string {
    const rows = ["date,funnel_id,stage,count,source"];
    const base = new Date("2025-01-01");

    for (let d = 0; d < baselineDays + dropDays; d++) {
      const date = new Date(base);
      date.setDate(base.getDate() + d);
      const dateStr = date.toISOString().split("T")[0];
      const landing = d < baselineDays ? normalLanding : droppedLanding;

      rows.push(`${dateStr},test-funnel,impression,10000,meta`);
      rows.push(`${dateStr},test-funnel,click,1200,meta`);
      rows.push(`${dateStr},test-funnel,landing,${landing},meta`);
      rows.push(`${dateStr},test-funnel,lead,${Math.round(landing * 0.17)},meta`);
      rows.push(`${dateStr},test-funnel,purchase,${Math.round(landing * 0.05)},meta`);
    }

    return rows.join("\n");
  }

  it("should run the full pipeline from CSV to Diagnosis[]", () => {
    const eventsPath = writeFile("events.csv", generateEventsCsv(18, 5, 900, 400));
    const changesPath = writeFile(
      "changes.csv",
      `date,funnel_id,category,description,severity,affected_stages
2025-01-17,test-funnel,site,Redesigned landing page,4,landing;lead`
    );

    const result = runDiagnosis({ eventsPath, changesPath });

    expect(result.metadata.eventsLoaded).toBe((18 + 5) * 5);
    expect(result.metadata.changesLoaded).toBe(1);
    expect(result.metadata.loadErrors).toHaveLength(0);
    expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.breaksDetected).toBeGreaterThan(0);
    expect(result.diagnoses.length).toBeGreaterThan(0);

    const clickToLanding = result.diagnoses.find(
      (d: Diagnosis) => d.break.fromStage === FunnelStage.CLICK && d.break.toStage === FunnelStage.LANDING
    );
    expect(clickToLanding).toBeDefined();
    expect(clickToLanding!.break.relativeDrop).toBeGreaterThan(0.15);
  });

  it("should populate metadata correctly", () => {
    const eventsPath = writeFile("events.csv", generateEventsCsv(18, 5, 900, 400));
    const changesPath = writeFile(
      "changes.csv",
      `date,funnel_id,category,description,severity,affected_stages
2025-01-17,test-funnel,site,Change,3,`
    );

    const result = runDiagnosis({ eventsPath, changesPath });

    expect(result.metadata.eventsLoaded).toBe(115);
    expect(result.metadata.changesLoaded).toBe(1);
    expect(typeof result.metadata.executionTimeMs).toBe("number");
  });

  it("should propagate load errors in metadata", () => {
    const eventsPath = writeFile(
      "events.csv",
      `date,funnel_id,stage,count,source
bad-date,test-funnel,impression,1000,meta
2025-01-01,test-funnel,click,200,meta`
    );
    const changesPath = writeFile(
      "changes.csv",
      `date,funnel_id,category,description,severity,affected_stages
2025-01-01,test-funnel,site,Change,3,`
    );

    const result = runDiagnosis({ eventsPath, changesPath });

    expect(result.metadata.loadErrors.length).toBeGreaterThan(0);
    expect(result.metadata.eventsLoaded).toBe(1); // only the valid row
  });

  it("should handle empty event files gracefully", () => {
    const eventsPath = writeFile("events.csv", "date,funnel_id,stage,count,source\n");
    const changesPath = writeFile(
      "changes.csv",
      `date,funnel_id,category,description,severity,affected_stages
2025-01-01,test-funnel,site,Change,3,`
    );

    const result = runDiagnosis({ eventsPath, changesPath });

    expect(result.metadata.eventsLoaded).toBe(0);
    expect(result.diagnoses).toHaveLength(0);
  });

  it("should accept custom breakDetector and causeAnalyzer configs", () => {
    const eventsPath = writeFile("events.csv", generateEventsCsv(18, 5, 900, 800));
    const changesPath = writeFile(
      "changes.csv",
      `date,funnel_id,category,description,severity,affected_stages
2025-01-17,test-funnel,site,Minor change,2,`
    );

    // Very sensitive detector — should find breaks even for small drops
    const sensitiveResult = runDiagnosis({
      eventsPath,
      changesPath,
      breakDetectorConfig: { minRelativeDrop: 0.05, minZScore: 0.5 },
    });

    // Very strict detector — should find fewer breaks
    const strictResult = runDiagnosis({
      eventsPath,
      changesPath,
      breakDetectorConfig: { minRelativeDrop: 0.50, minZScore: 5.0 },
    });

    expect(sensitiveResult.metadata.breaksDetected).toBeGreaterThanOrEqual(
      strictResult.metadata.breaksDetected
    );
  });

  describe("runFromData", () => {
    it("should run the pipeline from in-memory data", () => {
      const events = [];
      const base = new Date("2025-01-01");

      for (let d = 0; d < 20; d++) {
        const date = new Date(base);
        date.setDate(base.getDate() + d);
        const dateStr = date.toISOString().split("T")[0];
        const landing = d < 15 ? 900 : 400;

        events.push({ date: dateStr, funnelId: "f1", stage: FunnelStage.IMPRESSION, count: 10000 });
        events.push({ date: dateStr, funnelId: "f1", stage: FunnelStage.CLICK, count: 1200 });
        events.push({ date: dateStr, funnelId: "f1", stage: FunnelStage.LANDING, count: landing });
        events.push({ date: dateStr, funnelId: "f1", stage: FunnelStage.LEAD, count: Math.round(landing * 0.17) });
        events.push({ date: dateStr, funnelId: "f1", stage: FunnelStage.PURCHASE, count: Math.round(landing * 0.05) });
      }

      const changes = [
        {
          date: "2025-01-14",
          funnelId: "f1",
          category: ChangeCategory.SITE,
          description: "Landing page redesign",
          severity: 4,
          affectedStages: ["landing", "lead"],
        },
      ];

      const result = runDiagnosisFromData(events, changes);

      expect(result.metadata.eventsLoaded).toBe(100);
      expect(result.metadata.changesLoaded).toBe(1);
      expect(result.diagnoses.length).toBeGreaterThan(0);
    });
  });
});
