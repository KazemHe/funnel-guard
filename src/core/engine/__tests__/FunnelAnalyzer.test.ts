import { buildSnapshots, calculateConversionRates } from "../FunnelAnalyzer";
import { Event, FunnelStage, FunnelSnapshot, STAGE_ORDER } from "../../entities";

describe("FunnelAnalyzer", () => {
  describe("buildSnapshots", () => {
    it("should group events by funnelId and date", () => {
      const events: Event[] = [
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 1000 },
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.CLICK, count: 200 },
        { date: "2025-01-02", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 1100 },
        { date: "2025-01-02", funnelId: "camp-a", stage: FunnelStage.CLICK, count: 220 },
      ];

      const snapshots = buildSnapshots(events);
      expect(snapshots).toHaveLength(2);
      expect(snapshots[0].date).toBe("2025-01-01");
      expect(snapshots[1].date).toBe("2025-01-02");
    });

    it("should fill missing stages with 0", () => {
      const events: Event[] = [
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 1000 },
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.PURCHASE, count: 10 },
      ];

      const snapshots = buildSnapshots(events);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].stageCounts[FunnelStage.IMPRESSION]).toBe(1000);
      expect(snapshots[0].stageCounts[FunnelStage.CLICK]).toBe(0);
      expect(snapshots[0].stageCounts[FunnelStage.LANDING]).toBe(0);
      expect(snapshots[0].stageCounts[FunnelStage.LEAD]).toBe(0);
      expect(snapshots[0].stageCounts[FunnelStage.PURCHASE]).toBe(10);
    });

    it("should aggregate duplicate stage entries for the same date and funnel", () => {
      const events: Event[] = [
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 500, source: "meta" },
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 300, source: "google" },
      ];

      const snapshots = buildSnapshots(events);
      expect(snapshots[0].stageCounts[FunnelStage.IMPRESSION]).toBe(800);
    });

    it("should separate different funnels", () => {
      const events: Event[] = [
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 1000 },
        { date: "2025-01-01", funnelId: "camp-b", stage: FunnelStage.IMPRESSION, count: 2000 },
      ];

      const snapshots = buildSnapshots(events);
      expect(snapshots).toHaveLength(2);
      expect(snapshots.find((s: FunnelSnapshot) => s.funnelId === "camp-a")!.stageCounts[FunnelStage.IMPRESSION]).toBe(1000);
      expect(snapshots.find((s: FunnelSnapshot) => s.funnelId === "camp-b")!.stageCounts[FunnelStage.IMPRESSION]).toBe(2000);
    });

    it("should sort snapshots by funnelId then date", () => {
      const events: Event[] = [
        { date: "2025-01-02", funnelId: "camp-b", stage: FunnelStage.IMPRESSION, count: 100 },
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 100 },
        { date: "2025-01-01", funnelId: "camp-b", stage: FunnelStage.IMPRESSION, count: 100 },
        { date: "2025-01-02", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 100 },
      ];

      const snapshots = buildSnapshots(events);
      expect(snapshots[0].funnelId).toBe("camp-a");
      expect(snapshots[0].date).toBe("2025-01-01");
      expect(snapshots[1].funnelId).toBe("camp-a");
      expect(snapshots[1].date).toBe("2025-01-02");
      expect(snapshots[2].funnelId).toBe("camp-b");
    });

    it("should return empty array for empty input", () => {
      expect(buildSnapshots([])).toEqual([]);
    });
  });

  describe("calculateConversionRates", () => {
    it("should calculate pairwise conversion rates between adjacent stages", () => {
      const events: Event[] = [
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.IMPRESSION, count: 1000 },
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.CLICK, count: 200 },
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.LANDING, count: 150 },
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.LEAD, count: 30 },
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.PURCHASE, count: 10 },
      ];

      const snapshots = buildSnapshots(events);
      const rates = calculateConversionRates(snapshots);

      expect(rates).toHaveLength(1);
      expect(rates[0].rates).toHaveLength(4);

      // impression -> click: 200/1000 = 0.2
      expect(rates[0].rates[0].fromStage).toBe(FunnelStage.IMPRESSION);
      expect(rates[0].rates[0].toStage).toBe(FunnelStage.CLICK);
      expect(rates[0].rates[0].rate).toBeCloseTo(0.2);

      // click -> landing: 150/200 = 0.75
      expect(rates[0].rates[1].rate).toBeCloseTo(0.75);

      // landing -> lead: 30/150 = 0.2
      expect(rates[0].rates[2].rate).toBeCloseTo(0.2);

      // lead -> purchase: 10/30 = 0.333
      expect(rates[0].rates[3].rate).toBeCloseTo(0.333, 2);
    });

    it("should return rate 0 when fromCount is 0 (division by zero guard)", () => {
      const events: Event[] = [
        { date: "2025-01-01", funnelId: "camp-a", stage: FunnelStage.CLICK, count: 100 },
        // IMPRESSION is missing → filled with 0
      ];

      const snapshots = buildSnapshots(events);
      const rates = calculateConversionRates(snapshots);

      // impression -> click: 100/0 = 0 (guarded)
      expect(rates[0].rates[0].rate).toBe(0);
      // click -> landing: 0/100 = 0
      expect(rates[0].rates[1].rate).toBe(0);
    });

    it("should return empty array for empty input", () => {
      expect(calculateConversionRates([])).toEqual([]);
    });
  });
});
