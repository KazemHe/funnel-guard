import fs from "fs";
import path from "path";
import os from "os";
import { loadChangesFromCsv } from "../CsvChangeLoader";
import { ChangeCategory } from "../../../core/entities";

describe("CsvChangeLoader", () => {
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

  it("should parse a valid CSV file into Change[]", () => {
    const filePath = writeCsv(
      "changes.csv",
      `date,funnel_id,category,description,severity,affected_stages
2025-01-10,camp-a,site,Deployed new landing page,4,landing;lead`
    );

    const result = loadChangesFromCsv(filePath);
    expect(result.errors).toHaveLength(0);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toEqual({
      date: "2025-01-10",
      funnelId: "camp-a",
      category: ChangeCategory.SITE,
      description: "Deployed new landing page",
      severity: 4,
      affectedStages: ["landing", "lead"],
    });
  });

  it("should handle empty affected_stages", () => {
    const filePath = writeCsv(
      "changes.csv",
      `date,funnel_id,category,description,severity,affected_stages
2025-01-10,*,external,Competitor sale,2,`
    );

    const result = loadChangesFromCsv(filePath);
    expect(result.changes[0].affectedStages).toBeUndefined();
  });

  it("should handle wildcard funnel_id", () => {
    const filePath = writeCsv(
      "changes.csv",
      `date,funnel_id,category,description,severity,affected_stages
2025-01-10,*,external,Global change,2,`
    );

    const result = loadChangesFromCsv(filePath);
    expect(result.changes[0].funnelId).toBe("*");
  });

  it("should report error for invalid category", () => {
    const filePath = writeCsv(
      "changes.csv",
      `date,funnel_id,category,description,severity,affected_stages
2025-01-10,camp-a,invalid_cat,Some change,3,`
    );

    const result = loadChangesFromCsv(filePath);
    expect(result.changes).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid category");
  });

  it("should report error for severity out of range", () => {
    const filePath = writeCsv(
      "changes.csv",
      `date,funnel_id,category,description,severity,affected_stages
2025-01-10,camp-a,site,Change,0,
2025-01-11,camp-a,site,Change,6,`
    );

    const result = loadChangesFromCsv(filePath);
    expect(result.changes).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
  });

  it("should report error for invalid date format", () => {
    const filePath = writeCsv(
      "changes.csv",
      `date,funnel_id,category,description,severity,affected_stages
Jan 10 2025,camp-a,site,Change,3,`
    );

    const result = loadChangesFromCsv(filePath);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("Invalid date");
  });
});
