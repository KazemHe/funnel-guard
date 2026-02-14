import { FunnelStage } from "./Event";
import { ChangeCategory } from "./Change";

export interface Break {
  id?: string;
  funnelId: string;
  fromStage: FunnelStage;
  toStage: FunnelStage;
  detectedDate: string;
  baselineRate: number;
  currentRate: number;
  absoluteDrop: number;
  relativeDrop: number;
  zScore: number;
  severity: BreakSeverity;
}

export enum BreakSeverity {
  WARNING = "warning",
  SIGNIFICANT = "significant",
  CRITICAL = "critical",
}

export interface CauseCandidate {
  changeId: string;
  changeDescription: string;
  changeCategory: ChangeCategory;
  changeDate: string;
  changeSeverity: number;
  confidence: number;
  scoreBreakdown: {
    temporalScore: number;
    categoryRelevanceScore: number;
    severityScore: number;
    stageMatchBonus: number;
  };
}

export interface Diagnosis {
  id?: string;
  generatedAt: string;
  break: Break;
  causes: CauseCandidate[];
  diagnosisStatus: DiagnosisStatus;
  summary: string;
}

export enum DiagnosisStatus {
  IDENTIFIED = "identified",
  UNCERTAIN = "uncertain",
  UNKNOWN = "unknown",
}
