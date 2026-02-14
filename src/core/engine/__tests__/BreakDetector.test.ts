import { detectBreaks } from "../BreakDetector";
import { buildSnapshots, calculateConversionRates } from "../FunnelAnalyzer";
import { Event, FunnelStage, ConversionRates } from "../../entities";
import { Break, BreakSeverity } from "../../entities/Diagnosis";

function generateStableEvents(
  funnelId: string,
  days: number,
  startDate: string,
  counts: Record<FunnelStage, number>
): Event[] {
  const events: Event[] = [];
  const base = new Date(startDate);

  for (let d = 0; d < days; d++) {
    const date = new Date(base);
    date.setDate(base.getDate() + d);
    const dateStr = date.toISOString().split("T")[0];

    for (const stage of Object.values(FunnelStage)) {
      // Add small random-ish variation (deterministic based on day)
      const variation = 1 + (((d * 7 + stage.length) % 10) - 5) / 100;
      events.push({
        date: dateStr,
        funnelId,
        stage,
        count: Math.round(counts[stage] * variation),
      });
    }
  }

  return events;
}

function generateEventsWithDrop(
  funnelId: string,
  baselineDays: number,
  dropDays: number,
  startDate: string,
  normalCounts: Record<FunnelStage, number>,
  droppedCounts: Record<FunnelStage, number>
): Event[] {
  const normal = generateStableEvents(funnelId, baselineDays, startDate, normalCounts);
  const base = new Date(startDate);
  base.setDate(base.getDate() + baselineDays);
  const dropStart = base.toISOString().split("T")[0];
  const dropped = generateStableEvents(funnelId, dropDays, dropStart, droppedCounts);
  return [...normal, ...dropped];
}

describe("BreakDetector", () => {
  describe("detectBreaks", () => {
    it("should detect a significant conversion drop", () => {
      const events = generateEventsWithDrop(
        "test-funnel",
        18,
        5,
        "2025-01-01",
        {
          [FunnelStage.IMPRESSION]: 10000,
          [FunnelStage.CLICK]: 1200,
          [FunnelStage.LANDING]: 900,
          [FunnelStage.LEAD]: 150,
          [FunnelStage.PURCHASE]: 45,
        },
        {
          [FunnelStage.IMPRESSION]: 10000,
          [FunnelStage.CLICK]: 1200,
          [FunnelStage.LANDING]: 450, // 50% drop in landing
          [FunnelStage.LEAD]: 70,
          [FunnelStage.PURCHASE]: 20,
        }
      );

      const snapshots = buildSnapshots(events);
      const rates = calculateConversionRates(snapshots);

      const breaks = detectBreaks(rates, {
        baselineWindowDays: 14,
        currentWindowDays: 3,
        minRelativeDrop: 0.15,
        minZScore: 1.5,
        minBaselineDataPoints: 7,
      });

      expect(breaks.length).toBeGreaterThan(0);

      const clickToLandingBreak = breaks.find(
        (b: Break) => b.fromStage === FunnelStage.CLICK && b.toStage === FunnelStage.LANDING
      );
      expect(clickToLandingBreak).toBeDefined();
      expect(clickToLandingBreak!.relativeDrop).toBeGreaterThan(0.15);
      expect(clickToLandingBreak!.severity).toBe(BreakSeverity.CRITICAL);
    });

    it("should NOT flag a small drop below threshold", () => {
      const events = generateEventsWithDrop(
        "test-funnel",
        18,
        5,
        "2025-01-01",
        {
          [FunnelStage.IMPRESSION]: 10000,
          [FunnelStage.CLICK]: 1200,
          [FunnelStage.LANDING]: 900,
          [FunnelStage.LEAD]: 150,
          [FunnelStage.PURCHASE]: 45,
        },
        {
          [FunnelStage.IMPRESSION]: 10000,
          [FunnelStage.CLICK]: 1200,
          [FunnelStage.LANDING]: 870, // ~3% drop — below threshold
          [FunnelStage.LEAD]: 145,
          [FunnelStage.PURCHASE]: 43,
        }
      );

      const snapshots = buildSnapshots(events);
      const rates = calculateConversionRates(snapshots);

      const breaks = detectBreaks(rates, {
        baselineWindowDays: 14,
        currentWindowDays: 3,
        minRelativeDrop: 0.15,
        minZScore: 1.5,
        minBaselineDataPoints: 7,
      });

      const clickToLandingBreak = breaks.find(
        (b: Break) => b.fromStage === FunnelStage.CLICK && b.toStage === FunnelStage.LANDING
      );
      expect(clickToLandingBreak).toBeUndefined();
    });

    it("should return empty array when no breaks detected", () => {
      const events = generateStableEvents("test-funnel", 20, "2025-01-01", {
        [FunnelStage.IMPRESSION]: 10000,
        [FunnelStage.CLICK]: 1200,
        [FunnelStage.LANDING]: 900,
        [FunnelStage.LEAD]: 150,
        [FunnelStage.PURCHASE]: 45,
      });

      const snapshots = buildSnapshots(events);
      const rates = calculateConversionRates(snapshots);

      const breaks = detectBreaks(rates);

      // Stable data should produce no breaks (or very few from noise)
      const significantBreaks = breaks.filter(
        (b: Break) => b.severity === BreakSeverity.CRITICAL || b.severity === BreakSeverity.SIGNIFICANT
      );
      expect(significantBreaks).toHaveLength(0);
    });

    it("should handle empty conversion rates", () => {
      const breaks = detectBreaks([]);
      expect(breaks).toEqual([]);
    });

    it("should deduplicate consecutive-day breaks into a single break", () => {
      const events = generateEventsWithDrop(
        "test-funnel",
        18,
        6,
        "2025-01-01",
        {
          [FunnelStage.IMPRESSION]: 10000,
          [FunnelStage.CLICK]: 1200,
          [FunnelStage.LANDING]: 900,
          [FunnelStage.LEAD]: 150,
          [FunnelStage.PURCHASE]: 45,
        },
        {
          [FunnelStage.IMPRESSION]: 10000,
          [FunnelStage.CLICK]: 1200,
          [FunnelStage.LANDING]: 400,
          [FunnelStage.LEAD]: 60,
          [FunnelStage.PURCHASE]: 15,
        }
      );

      const snapshots = buildSnapshots(events);
      const rates = calculateConversionRates(snapshots);

      const breaks = detectBreaks(rates, {
        baselineWindowDays: 14,
        currentWindowDays: 3,
        minRelativeDrop: 0.15,
        minZScore: 1.5,
        minBaselineDataPoints: 7,
      });

      // Should have at most 1 break per transition (deduplicated)
      const clickToLandingBreaks = breaks.filter(
        (b: Break) => b.fromStage === FunnelStage.CLICK && b.toStage === FunnelStage.LANDING
      );
      expect(clickToLandingBreaks.length).toBeLessThanOrEqual(1);
    });

    it("should work with multiple funnels independently", () => {
      const funnelA = generateEventsWithDrop(
        "funnel-a",
        18,
        5,
        "2025-01-01",
        {
          [FunnelStage.IMPRESSION]: 10000,
          [FunnelStage.CLICK]: 1200,
          [FunnelStage.LANDING]: 900,
          [FunnelStage.LEAD]: 150,
          [FunnelStage.PURCHASE]: 45,
        },
        {
          [FunnelStage.IMPRESSION]: 10000,
          [FunnelStage.CLICK]: 1200,
          [FunnelStage.LANDING]: 400,
          [FunnelStage.LEAD]: 60,
          [FunnelStage.PURCHASE]: 15,
        }
      );

      // funnel-b is stable — no drop
      const funnelB = generateStableEvents("funnel-b", 23, "2025-01-01", {
        [FunnelStage.IMPRESSION]: 5000,
        [FunnelStage.CLICK]: 800,
        [FunnelStage.LANDING]: 600,
        [FunnelStage.LEAD]: 100,
        [FunnelStage.PURCHASE]: 30,
      });

      const allEvents = [...funnelA, ...funnelB];
      const snapshots = buildSnapshots(allEvents);
      const rates = calculateConversionRates(snapshots);

      const breaks = detectBreaks(rates, {
        baselineWindowDays: 14,
        currentWindowDays: 3,
        minRelativeDrop: 0.15,
        minZScore: 1.5,
        minBaselineDataPoints: 7,
      });

      const funnelABreaks = breaks.filter((b: Break) => b.funnelId === "funnel-a");
      const funnelBBreaks = breaks.filter(
        (b: Break) =>
          b.funnelId === "funnel-b" &&
          (b.severity === BreakSeverity.CRITICAL || b.severity === BreakSeverity.SIGNIFICANT)
      );

      expect(funnelABreaks.length).toBeGreaterThan(0);
      expect(funnelBBreaks).toHaveLength(0);
    });
  });
});
