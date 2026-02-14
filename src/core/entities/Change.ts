export enum ChangeCategory {
  AD = "ad",
  SITE = "site",
  EXTERNAL = "external",
  TRACKING = "tracking",
  PRICING = "pricing",
  AUDIENCE = "audience",
}

export interface Change {
  id?: string;
  date: string;
  funnelId: string;
  category: ChangeCategory;
  description: string;
  severity: number;
  affectedStages?: string[];
}
