export enum FunnelStage {
  IMPRESSION = "impression",
  CLICK = "click",
  LANDING = "landing",
  LEAD = "lead",
  PURCHASE = "purchase",
}

export const STAGE_ORDER: readonly FunnelStage[] = [
  FunnelStage.IMPRESSION,
  FunnelStage.CLICK,
  FunnelStage.LANDING,
  FunnelStage.LEAD,
  FunnelStage.PURCHASE,
] as const;

export interface Event {
  id?: string;
  date: string;
  funnelId: string;
  stage: FunnelStage;
  count: number;
  source?: string;
}

export interface FunnelSnapshot {
  date: string;
  funnelId: string;
  stageCounts: Record<FunnelStage, number>;
}

export interface ConversionRates {
  date: string;
  funnelId: string;
  rates: {
    fromStage: FunnelStage;
    toStage: FunnelStage;
    rate: number;
    fromCount: number;
    toCount: number;
  }[];
}
