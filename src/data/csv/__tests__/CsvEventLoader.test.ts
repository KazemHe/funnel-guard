import fs from "fs";
import path from "path";
import os from "os";
import { loadEventsFromCsv } from "../CsvEventLoader";
import { FunnelStage } from "../../../core/entities";

describe("CsvEventLoader", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fg-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeCsv(filename: string, content: string): string {
    const filePath = path.join(tmpDir, filename);
    fs.writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  it("should parse a valid CSV file into Event[]", () => {
    const filePath = writeCsv(
      "events.csv",
      `date,funnel_id,stage,count,source
2025-01-01,camp-a,impression,10000,meta-ads
2025-01-01,camp-a,click,1200,meta-ads
2025-01-01,camp-a,landing,900,meta-ads`
    );

    const result = loadEventsFromCsv(filePath);

    expect(result.errors).toHaveLength(0);
    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toEqual({
      date: "2025-01-01",
      funnelId: "camp-a",
      stage: FunnelStage.IMPRESSION,
      count: 10000,
      source: "meta-ads",
    });
  });

  it("should handle optional source column", () => {
    const filePath = writeCsv(
      "events.csv",
      `date,funnel_id,stage,count,source
2025-01-01,camp-a,impression,10000,`
    );

    const result = loadEventsFromCsv(filePath);
    expect(result.events[0].source).toBeUndefined();
  });

  it("should report error for invalid date format", () => {
    const filePath = writeCsv(
      "events.csv",
      `date,funnel_id,stage,count,source
01-01-2025,camp-a,impression,10000,meta`
    );

    const result = loadEventsFromCsv(filePath);
    expect(result.events).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid date");
  });

  it("should report error for invalid stage", () => {
    const filePath = writeCsv(
      "events.csv",
      `date,funnel_id,stage,count,source
2025-01-01,camp-a,invalid_stage,10000,meta`
    );

    const result = loadEventsFromCsv(filePath);
    expect(result.events).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid stage");
  });

  it("should report error for negative count", () => {
    const filePath = writeCsv(
      "events.csv",
      `date,funnel_id,stage,count,source
2025-01-01,camp-a,impression,-5,meta`
    );

    const result = loadEventsFromCsv(filePath);
    expect(result.events).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid count");
  });

  it("should report error for non-numeric count", () => {
    const filePath = writeCsv(
      "events.csv",
      `date,funnel_id,stage,count,source
2025-01-01,camp-a,impression,abc,meta`
    );

    const result = loadEventsFromCsv(filePath);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid count");
  });

  it("should skip empty lines", () => {
    const filePath = writeCsv(
      "events.csv",
      `date,funnel_id,stage,count,source
2025-01-01,camp-a,impression,10000,meta

2025-01-01,camp-a,click,1200,meta`
    );

    const result = loadEventsFromCsv(filePath);
    expect(result.events).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("should do partial load — valid rows succeed even if some fail", () => {
    const filePath = writeCsv(
      "events.csv",
      `date,funnel_id,stage,count,source
2025-01-01,camp-a,impression,10000,meta
bad-date,camp-a,click,1200,meta
2025-01-01,camp-a,landing,900,meta`
    );

    const result = loadEventsFromCsv(filePath);
    expect(result.events).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
  });

  it("should throw on file not found", () => {
    expect(() => loadEventsFromCsv("/nonexistent/path.csv")).toThrow();
  });
});
