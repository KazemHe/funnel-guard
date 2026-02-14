import { Event } from "../../core/entities/Event";
import { EventLoader } from "./DataLoader";

export class MetaAdsLoader implements EventLoader {
  async load(_config: Record<string, unknown>): Promise<Event[]> {
    throw new Error("MetaAdsLoader is not yet implemented. This is a stub for future integration.");
  }
}
