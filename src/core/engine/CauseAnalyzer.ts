import { Change, ChangeCategory } from "../entities/Change";
import { FunnelStage } from "../entities/Event";
import {
  Break,
  CauseCandidate,
  Diagnosis,
  DiagnosisStatus,
} from "../entities/Diagnosis";
import { daysDiff, now } from "../../utils/time";

export interface CauseAnalyzerConfig {
  maxTemporalDistanceDays: number;
  temporalWeight: number;
  categoryWeight: number;
  severityWeight: number;
  stageMatchWeight: number;
  minConfidenceThreshold: number;
}

export const DEFAULT_CAUSE_ANALYZER_CONFIG: CauseAnalyzerConfig = {
  maxTemporalDistanceDays: 7,
  temporalWeight: 0.40,
  categoryWeight: 0.30,
  severityWeight: 0.20,
  stageMatchWeight: 0.10,
  minConfidenceThreshold: 0.1,
};

const CATEGORY_STAGE_RELEVANCE: Record<ChangeCategory, Record<string, number>> = {
  [ChangeCategory.AD]: {
    "impression->click": 0.95,
    "click->landing": 0.60,
    "landing->lead": 0.20,
    "lead->purchase": 0.10,
  },
  [ChangeCategory.SITE]: {
    "impression->click": 0.05,
    "click->landing": 0.90,
    "landing->lead": 0.85,
    "lead->purchase": 0.70,
  },
  [ChangeCategory.EXTERNAL]: {
    "impression->click": 0.50,
    "click->landing": 0.30,
    "landing->lead": 0.40,
    "lead->purchase": 0.60,
  },
  [ChangeCategory.TRACKING]: {
    "impression->click": 0.80,
    "click->landing": 0.80,
    "landing->lead": 0.60,
    "lead->purchase": 0.40,
  },
  [ChangeCategory.PRICING]: {
    "impression->click": 0.05,
    "click->landing": 0.10,
    "landing->lead": 0.50,
    "lead->purchase": 0.95,
  },
  [ChangeCategory.AUDIENCE]: {
    "impression->click": 0.85,
    "click->landing": 0.70,
    "landing->lead": 0.50,
    "lead->purchase": 0.30,
  },
};

export function analyzeCauses(
  breaks: Break[],
  changes: Change[],
  config?: Partial<CauseAnalyzerConfig>
): Diagnosis[] {
  const cfg = { ...DEFAULT_CAUSE_ANALYZER_CONFIG, ...config };
  return breaks.map((brk) => diagnoseBreak(brk, changes, cfg));
}

function diagnoseBreak(brk: Break, allChanges: Change[], config: CauseAnalyzerConfig): Diagnosis {
  const candidateChanges = allChanges.filter((change) => {
    const funnelMatch = change.funnelId === brk.funnelId || change.funnelId === "*";
    if (!funnelMatch) return false;
    const gap = daysDiff(change.date, brk.detectedDate);
    return gap >= 0 && gap <= config.maxTemporalDistanceDays;
  });

  const causes: CauseCandidate[] = candidateChanges
    .map((change) => scoreCandidate(change, brk, config))
    .filter((c) => c.confidence >= config.minConfidenceThreshold)
    .sort((a, b) => b.confidence - a.confidence);

  const diagnosisStatus = determineStatus(causes);
  const summary = generateSummary(brk, causes, diagnosisStatus);

  return { generatedAt: now(), break: brk, causes, diagnosisStatus, summary };
}

function scoreCandidate(change: Change, brk: Break, config: CauseAnalyzerConfig): CauseCandidate {
  const temporalScore = calcTemporalScore(change.date, brk.detectedDate, config.maxTemporalDistanceDays);
  const categoryRelevanceScore = calcCategoryRelevance(change.category, brk.fromStage, brk.toStage);
  const severityScore = calcSeverityScore(change.severity);
  const stageMatchBonus = calcStageMatchBonus(change, brk);

  const confidence = Math.min(1.0, Math.max(0.0,
    temporalScore * config.temporalWeight +
    categoryRelevanceScore * config.categoryWeight +
    severityScore * config.severityWeight +
    stageMatchBonus * config.stageMatchWeight
  ));

  return {
    changeId: change.id ?? "",
    changeDescription: change.description,
    changeCategory: change.category,
    changeDate: change.date,
    changeSeverity: change.severity,
    confidence,
    scoreBreakdown: { temporalScore, categoryRelevanceScore, severityScore, stageMatchBonus },
  };
}

function calcTemporalScore(changeDate: string, breakDate: string, maxDays: number): number {
  const gap = daysDiff(changeDate, breakDate);
  if (gap < 0 || gap > maxDays) return 0;
  return Math.exp(-0.5 * gap);
}

function calcCategoryRelevance(category: ChangeCategory, fromStage: FunnelStage, toStage: FunnelStage): number {
  const key = `${fromStage}->${toStage}`;
  return CATEGORY_STAGE_RELEVANCE[category]?.[key] ?? 0.3;
}

function calcSeverityScore(severity: number): number {
  return (Math.min(5, Math.max(1, severity)) - 1) / 4;
}

function calcStageMatchBonus(change: Change, brk: Break): number {
  if (!change.affectedStages || change.affectedStages.length === 0) return 0;
  return change.affectedStages.some((s) => s === brk.fromStage || s === brk.toStage) ? 0.2 : 0;
}

function determineStatus(causes: CauseCandidate[]): DiagnosisStatus {
  if (causes.length === 0) return DiagnosisStatus.UNKNOWN;
  if (causes[0].confidence >= 0.6) return DiagnosisStatus.IDENTIFIED;
  return DiagnosisStatus.UNCERTAIN;
}

function generateSummary(brk: Break, causes: CauseCandidate[], status: DiagnosisStatus): string {
  const dropPct = (brk.relativeDrop * 100).toFixed(1);
  const transition = `${brk.fromStage} -> ${brk.toStage}`;
  const header = `[${brk.severity.toUpperCase()}] ${dropPct}% conversion drop detected in "${brk.funnelId}" at ${transition} on ${brk.detectedDate}.`;

  if (status === DiagnosisStatus.UNKNOWN) {
    return `${header} No candidate causes found within the analysis window.`;
  }

  const topCause = causes[0];
  const confPct = (topCause.confidence * 100).toFixed(0);

  if (status === DiagnosisStatus.IDENTIFIED) {
    return `${header} Most likely cause (${confPct}% confidence): "${topCause.changeDescription}" (${topCause.changeCategory}, ${topCause.changeDate}).`;
  }

  return `${header} Possible cause (${confPct}% confidence): "${topCause.changeDescription}" (${topCause.changeCategory}, ${topCause.changeDate}). Low confidence -- manual investigation recommended.`;
}
