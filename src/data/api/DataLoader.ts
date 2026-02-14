import { Event } from "../../core/entities/Event";
import { Change } from "../../core/entities/Change";

export interface EventLoader {
  load(config: Record<string, unknown>): Promise<Event[]>;
}

export interface ChangeLoader {
  load(config: Record<string, unknown>): Promise<Change[]>;
}
