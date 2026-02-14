import { Event } from "../../core/entities/Event";
import { EventLoader } from "./DataLoader";

export class GA4Loader implements EventLoader {
  async load(_config: Record<string, unknown>): Promise<Event[]> {
    throw new Error("GA4Loader is not yet implemented. This is a stub for future integration.");
  }
}
