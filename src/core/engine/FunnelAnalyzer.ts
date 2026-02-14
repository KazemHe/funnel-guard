import {
  Event,
  FunnelStage,
  FunnelSnapshot,
  ConversionRates,
  STAGE_ORDER,
} from "../entities";

export function buildSnapshots(events: Event[]): FunnelSnapshot[] {
  const grouped = new Map<string, Map<FunnelStage, number>>();

  for (const event of events) {
    const key = `${event.funnelId}|${event.date}`;
    if (!grouped.has(key)) {
      grouped.set(key, new Map<FunnelStage, number>());
    }
    const stageCounts = grouped.get(key)!;
    const existing = stageCounts.get(event.stage) ?? 0;
    stageCounts.set(event.stage, existing + event.count);
  }

  const snapshots: FunnelSnapshot[] = [];

  for (const [key, stageCounts] of grouped) {
    const [funnelId, date] = key.split("|");
    const counts = {} as Record<FunnelStage, number>;
    for (const stage of STAGE_ORDER) {
      counts[stage] = stageCounts.get(stage) ?? 0;
    }
    snapshots.push({ date, funnelId, stageCounts: counts });
  }

  snapshots.sort((a, b) => {
    if (a.funnelId !== b.funnelId) return a.funnelId.localeCompare(b.funnelId);
    return a.date.localeCompare(b.date);
  });

  return snapshots;
}

export function calculateConversionRates(snapshots: FunnelSnapshot[]): ConversionRates[] {
  return snapshots.map((snapshot) => {
    const rates: ConversionRates["rates"] = [];

    for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
      const fromStage = STAGE_ORDER[i];
      const toStage = STAGE_ORDER[i + 1];
      const fromCount = snapshot.stageCounts[fromStage];
      const toCount = snapshot.stageCounts[toStage];
      const rate = fromCount > 0 ? toCount / fromCount : 0;

      rates.push({ fromStage, toStage, rate, fromCount, toCount });
    }

    return {
      date: snapshot.date,
      funnelId: snapshot.funnelId,
      rates,
    };
  });
}
