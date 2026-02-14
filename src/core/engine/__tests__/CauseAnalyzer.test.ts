import { analyzeCauses } from "../CauseAnalyzer";
import { Change, ChangeCategory } from "../../entities/Change";
import { FunnelStage } from "../../entities/Event";
import { Break, BreakSeverity, CauseCandidate, DiagnosisStatus } from "../../entities/Diagnosis";

function makeBreak(overrides: Partial<Break> = {}): Break {
  return {
    funnelId: "test-funnel",
    fromStage: FunnelStage.CLICK,
    toStage: FunnelStage.LANDING,
    detectedDate: "2025-01-15",
    baselineRate: 0.75,
    currentRate: 0.45,
    absoluteDrop: 0.30,
    relativeDrop: 0.40,
    zScore: 3.5,
    severity: BreakSeverity.CRITICAL,
    ...overrides,
  };
}

function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    date: "2025-01-14",
    funnelId: "test-funnel",
    category: ChangeCategory.SITE,
    description: "Deployed new landing page",
    severity: 4,
    ...overrides,
  };
}

describe("CauseAnalyzer", () => {
  describe("analyzeCauses", () => {
    it("should rank a same-day site change highest for a click->landing break", () => {
      const brk = makeBreak();
      const changes: Change[] = [
        makeChange({ date: "2025-01-15", category: ChangeCategory.SITE, description: "Same-day site change" }),
        makeChange({ date: "2025-01-13", category: ChangeCategory.AD, description: "Ad change 2 days ago" }),
      ];

      const diagnoses = analyzeCauses([brk], changes);

      expect(diagnoses).toHaveLength(1);
      expect(diagnoses[0].causes.length).toBeGreaterThanOrEqual(2);
      expect(diagnoses[0].causes[0].changeDescription).toBe("Same-day site change");
    });

    it("should score an ad change higher than pricing for impression->click break", () => {
      const brk = makeBreak({
        fromStage: FunnelStage.IMPRESSION,
        toStage: FunnelStage.CLICK,
      });

      const changes: Change[] = [
        makeChange({ date: "2025-01-14", category: ChangeCategory.AD, description: "Ad creative change", severity: 3 }),
        makeChange({ date: "2025-01-14", category: ChangeCategory.PRICING, description: "Price increase", severity: 3 }),
      ];

      const diagnoses = analyzeCauses([brk], changes);
      const causes = diagnoses[0].causes;

      const adCause = causes.find((c: CauseCandidate) => c.changeCategory === ChangeCategory.AD)!;
      const pricingCause = causes.find((c: CauseCandidate) => c.changeCategory === ChangeCategory.PRICING)!;

      expect(adCause.confidence).toBeGreaterThan(pricingCause.confidence);
    });

    it("should apply stage match bonus when affectedStages overlap", () => {
      const brk = makeBreak();
      const changes: Change[] = [
        makeChange({
          date: "2025-01-14",
          description: "With stage match",
          affectedStages: ["landing", "lead"],
        }),
        makeChange({
          date: "2025-01-14",
          description: "Without stage match",
          affectedStages: ["impression"],
        }),
      ];

      const diagnoses = analyzeCauses([brk], changes);
      const withMatch = diagnoses[0].causes.find((c: CauseCandidate) => c.changeDescription === "With stage match")!;
      const withoutMatch = diagnoses[0].causes.find((c: CauseCandidate) => c.changeDescription === "Without stage match")!;

      expect(withMatch.scoreBreakdown.stageMatchBonus).toBe(0.2);
      expect(withoutMatch.scoreBreakdown.stageMatchBonus).toBe(0);
      expect(withMatch.confidence).toBeGreaterThan(withoutMatch.confidence);
    });

    it("should filter out changes that happened after the break date", () => {
      const brk = makeBreak({ detectedDate: "2025-01-15" });
      const changes: Change[] = [
        makeChange({ date: "2025-01-16", description: "Future change" }),
        makeChange({ date: "2025-01-14", description: "Past change" }),
      ];

      const diagnoses = analyzeCauses([brk], changes);
      const descriptions = diagnoses[0].causes.map((c: CauseCandidate) => c.changeDescription);

      expect(descriptions).not.toContain("Future change");
      expect(descriptions).toContain("Past change");
    });

    it("should filter out changes beyond maxTemporalDistanceDays", () => {
      const brk = makeBreak({ detectedDate: "2025-01-20" });
      const changes: Change[] = [
        makeChange({ date: "2025-01-01", description: "Too old" }), // 19 days ago
        makeChange({ date: "2025-01-18", description: "Recent" }),   // 2 days ago
      ];

      const diagnoses = analyzeCauses([brk], changes);
      const descriptions = diagnoses[0].causes.map((c: CauseCandidate) => c.changeDescription);

      expect(descriptions).not.toContain("Too old");
      expect(descriptions).toContain("Recent");
    });

    it("should include wildcard funnel changes as candidates", () => {
      const brk = makeBreak({ funnelId: "specific-funnel" });
      const changes: Change[] = [
        makeChange({ funnelId: "*", date: "2025-01-14", description: "Global change" }),
        makeChange({ funnelId: "other-funnel", date: "2025-01-14", description: "Other funnel change" }),
      ];

      const diagnoses = analyzeCauses([brk], changes);
      const descriptions = diagnoses[0].causes.map((c: CauseCandidate) => c.changeDescription);

      expect(descriptions).toContain("Global change");
      expect(descriptions).not.toContain("Other funnel change");
    });

    it("should return UNKNOWN status when no candidate changes exist", () => {
      const brk = makeBreak();
      const diagnoses = analyzeCauses([brk], []);

      expect(diagnoses[0].diagnosisStatus).toBe(DiagnosisStatus.UNKNOWN);
      expect(diagnoses[0].causes).toHaveLength(0);
      expect(diagnoses[0].summary).toContain("No candidate causes found");
    });

    it("should return IDENTIFIED status when top cause confidence >= 0.6", () => {
      const brk = makeBreak();
      const changes: Change[] = [
        makeChange({
          date: "2025-01-15", // same day
          category: ChangeCategory.SITE,
          severity: 5,
          affectedStages: ["click", "landing"],
        }),
      ];

      const diagnoses = analyzeCauses([brk], changes);
      expect(diagnoses[0].diagnosisStatus).toBe(DiagnosisStatus.IDENTIFIED);
      expect(diagnoses[0].causes[0].confidence).toBeGreaterThanOrEqual(0.6);
      expect(diagnoses[0].summary).toContain("Most likely cause");
    });

    it("should return UNCERTAIN status when top cause confidence < 0.6", () => {
      const brk = makeBreak();
      const changes: Change[] = [
        makeChange({
          date: "2025-01-10", // 5 days before — low temporal score
          category: ChangeCategory.EXTERNAL,
          severity: 1,
        }),
      ];

      const diagnoses = analyzeCauses([brk], changes);
      expect(diagnoses[0].diagnosisStatus).toBe(DiagnosisStatus.UNCERTAIN);
      expect(diagnoses[0].summary).toContain("manual investigation recommended");
    });

    it("should handle multiple simultaneous changes by ranking on composite score", () => {
      const brk = makeBreak();
      const changes: Change[] = [
        makeChange({ date: "2025-01-15", category: ChangeCategory.SITE, severity: 5, description: "Major site overhaul" }),
        makeChange({ date: "2025-01-15", category: ChangeCategory.AD, severity: 2, description: "Minor ad tweak" }),
        makeChange({ date: "2025-01-15", category: ChangeCategory.TRACKING, severity: 3, description: "Pixel update" }),
      ];

      const diagnoses = analyzeCauses([brk], changes);
      const causes = diagnoses[0].causes;

      // All same temporal score — differentiated by category + severity
      expect(causes[0].changeDescription).toBe("Major site overhaul");

      // Verify all are included
      expect(causes).toHaveLength(3);

      // Verify sorted by confidence descending
      for (let i = 1; i < causes.length; i++) {
        expect(causes[i - 1].confidence).toBeGreaterThanOrEqual(causes[i].confidence);
      }
    });

    it("should produce diagnoses for multiple breaks", () => {
      const breaks: Break[] = [
        makeBreak({ fromStage: FunnelStage.CLICK, toStage: FunnelStage.LANDING }),
        makeBreak({ fromStage: FunnelStage.LEAD, toStage: FunnelStage.PURCHASE }),
      ];

      const changes: Change[] = [makeChange()];

      const diagnoses = analyzeCauses(breaks, changes);
      expect(diagnoses).toHaveLength(2);
    });
  });

  describe("temporal scoring", () => {
    it("should give highest temporal score to same-day changes", () => {
      const brk = makeBreak({ detectedDate: "2025-01-15" });
      const changes: Change[] = [
        makeChange({ date: "2025-01-15", description: "Same day" }),
        makeChange({ date: "2025-01-14", description: "One day before" }),
        makeChange({ date: "2025-01-12", description: "Three days before" }),
      ];

      const diagnoses = analyzeCauses([brk], changes);
      const causes = diagnoses[0].causes;

      const sameDay = causes.find((c: CauseCandidate) => c.changeDescription === "Same day")!;
      const oneDay = causes.find((c: CauseCandidate) => c.changeDescription === "One day before")!;
      const threeDay = causes.find((c: CauseCandidate) => c.changeDescription === "Three days before")!;

      expect(sameDay.scoreBreakdown.temporalScore).toBeCloseTo(1.0, 1);
      expect(oneDay.scoreBreakdown.temporalScore).toBeCloseTo(0.607, 2);
      expect(threeDay.scoreBreakdown.temporalScore).toBeCloseTo(0.223, 2);
    });
  });

  describe("severity scoring", () => {
    it("should normalize severity from 1-5 to 0-1 scale", () => {
      const brk = makeBreak();
      const changes: Change[] = [
        makeChange({ severity: 1, date: "2025-01-15", description: "Sev 1" }),
        makeChange({ severity: 3, date: "2025-01-15", description: "Sev 3" }),
        makeChange({ severity: 5, date: "2025-01-15", description: "Sev 5" }),
      ];

      const diagnoses = analyzeCauses([brk], changes);
      const causes = diagnoses[0].causes;

      const sev1 = causes.find((c: CauseCandidate) => c.changeDescription === "Sev 1")!;
      const sev3 = causes.find((c: CauseCandidate) => c.changeDescription === "Sev 3")!;
      const sev5 = causes.find((c: CauseCandidate) => c.changeDescription === "Sev 5")!;

      expect(sev1.scoreBreakdown.severityScore).toBeCloseTo(0.0);
      expect(sev3.scoreBreakdown.severityScore).toBeCloseTo(0.5);
      expect(sev5.scoreBreakdown.severityScore).toBeCloseTo(1.0);
    });
  });
});
