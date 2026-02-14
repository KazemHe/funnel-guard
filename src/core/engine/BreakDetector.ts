import { ConversionRates, FunnelStage, STAGE_ORDER } from "../entities";
import { Break, BreakSeverity } from "../entities/Diagnosis";
import { daysDiff } from "../../utils/time";

export interface BreakDetectorConfig {
  baselineWindowDays: number;
  currentWindowDays: number;
  minRelativeDrop: number;
  minZScore: number;
  minBaselineDataPoints: number;
}

export const DEFAULT_BREAK_DETECTOR_CONFIG: BreakDetectorConfig = {
  baselineWindowDays: 14,
  currentWindowDays: 3,
  minRelativeDrop: 0.15,
  minZScore: 1.5,
  minBaselineDataPoints: 7,
};

interface RateDataPoint {
  date: string;
  rate: number;
}

/** Find conversion drops across all funnels and stage pairs. */
export function detectBreaks(
  conversionRates: ConversionRates[],
  config?: Partial<BreakDetectorConfig>
): Break[] {
  const cfg = { ...DEFAULT_BREAK_DETECTOR_CONFIG, ...config };
  const funnelIds = [...new Set(conversionRates.map((cr) => cr.funnelId))];
  const allBreaks: Break[] = [];

  for (const funnelId of funnelIds) {
    const funnelRates = conversionRates
      .filter((cr) => cr.funnelId === funnelId)
      .sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
      const fromStage = STAGE_ORDER[i];
      const toStage = STAGE_ORDER[i + 1];

      const timeSeries = extractTimeSeries(funnelRates, fromStage, toStage);
      const breaks = detectBreaksInSeries(timeSeries, funnelId, fromStage, toStage, cfg);
      allBreaks.push(...breaks);
    }
  }

  return deduplicateConsecutiveBreaks(allBreaks);
}

/** Build date/rate time series for one stage-to-stage transition. */
function extractTimeSeries(
  conversionRates: ConversionRates[],
  fromStage: FunnelStage,
  toStage: FunnelStage
): RateDataPoint[] {
  return conversionRates
    .map((cr) => {
      const rateEntry = cr.rates.find(
        (r) => r.fromStage === fromStage && r.toStage === toStage
      );
      return {
        date: cr.date,
        rate: rateEntry?.rate ?? 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Find breaks in one series using baseline vs current window and z-score. */
function detectBreaksInSeries(
  timeSeries: RateDataPoint[],
  funnelId: string,
  fromStage: FunnelStage,
  toStage: FunnelStage,
  config: BreakDetectorConfig
): Break[] {
  const breaks: Break[] = [];
  const { baselineWindowDays, currentWindowDays, minRelativeDrop, minZScore, minBaselineDataPoints } = config;

  for (let i = 0; i < timeSeries.length; i++) {
    const detectionDate = timeSeries[i].date;

    const currentPoints = timeSeries.filter((dp) => {
      const diff = daysDiff(dp.date, detectionDate);
      return diff >= 0 && diff < currentWindowDays;
    });

    const baselinePoints = timeSeries.filter((dp) => {
      const diff = daysDiff(dp.date, detectionDate);
      return diff >= currentWindowDays && diff < baselineWindowDays + currentWindowDays;
    });

    if (baselinePoints.length < minBaselineDataPoints) continue;
    if (currentPoints.length === 0) continue;

    const baselineRates = baselinePoints.map((dp) => dp.rate);
    const currentRates = currentPoints.map((dp) => dp.rate);

    const baselineMean = mean(baselineRates);
    const baselineStdDev = stddev(baselineRates);
    const currentMean = mean(currentRates);

    if (baselineMean === 0) continue;

    const effectiveStdDev = Math.max(baselineStdDev, 0.01);
    const absoluteDrop = baselineMean - currentMean;
    const relativeDrop = absoluteDrop / baselineMean;
    const zScore = absoluteDrop / effectiveStdDev;

    if (relativeDrop >= minRelativeDrop && Math.abs(zScore) >= minZScore) {
      breaks.push({
        funnelId,
        fromStage,
        toStage,
        detectedDate: detectionDate,
        baselineRate: baselineMean,
        currentRate: currentMean,
        absoluteDrop,
        relativeDrop,
        zScore,
        severity: classifySeverity(relativeDrop, zScore),
      });
    }
  }

  return breaks;
}

/** Merge nearby breaks per funnel/stage; keep one peak break per cluster. */
function deduplicateConsecutiveBreaks(breaks: Break[]): Break[] {
  if (breaks.length === 0) return [];

  const groups = new Map<string, Break[]>();
  for (const brk of breaks) {
    const key = `${brk.funnelId}|${brk.fromStage}|${brk.toStage}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(brk);
  }

  const deduplicated: Break[] = [];

  for (const [, groupBreaks] of groups) {
    groupBreaks.sort((a, b) => a.detectedDate.localeCompare(b.detectedDate));

    let cluster: Break[] = [groupBreaks[0]];

    for (let i = 1; i < groupBreaks.length; i++) {
      const prev = groupBreaks[i - 1];
      const curr = groupBreaks[i];
      const gap = daysDiff(prev.detectedDate, curr.detectedDate);

      if (gap <= 1) {
        cluster.push(curr);
      } else {
        deduplicated.push(pickPeakBreak(cluster));
        cluster = [curr];
      }
    }

    deduplicated.push(pickPeakBreak(cluster));
  }

  return deduplicated.sort((a, b) => a.detectedDate.localeCompare(b.detectedDate));
}

/** Map relative drop and z-score to CRITICAL / SIGNIFICANT / WARNING. */
function classifySeverity(relativeDrop: number, zScore: number): BreakSeverity {
  if (relativeDrop > 0.40 || Math.abs(zScore) > 3.0) {
    return BreakSeverity.CRITICAL;
  }
  if (relativeDrop > 0.20 || Math.abs(zScore) > 2.0) {
    return BreakSeverity.SIGNIFICANT;
  }
  return BreakSeverity.WARNING;
}

/** Break in cluster with largest |zScore|. */
function pickPeakBreak(cluster: Break[]): Break {
  return cluster.reduce((best, curr) =>
    Math.abs(curr.zScore) > Math.abs(best.zScore) ? curr : best
  );
}

/** Arithmetic mean. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sample standard deviation (n - 1). */
function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}
