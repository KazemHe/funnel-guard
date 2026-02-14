import { Event, Change, Diagnosis } from "../core/entities";
import { buildSnapshots, calculateConversionRates } from "../core/engine/FunnelAnalyzer";
import { detectBreaks, BreakDetectorConfig } from "../core/engine/BreakDetector";
import { analyzeCauses, CauseAnalyzerConfig } from "../core/engine/CauseAnalyzer";
import { loadEventsFromCsv } from "../data/csv/CsvEventLoader";
import { loadChangesFromCsv } from "../data/csv/CsvChangeLoader";

export interface DiagnosisServiceConfig {
  eventsPath: string;
  changesPath: string;
  breakDetectorConfig?: Partial<BreakDetectorConfig>;
  causeAnalyzerConfig?: Partial<CauseAnalyzerConfig>;
}

export interface DiagnosisResult {
  diagnoses: Diagnosis[];
  metadata: {
    eventsLoaded: number;
    changesLoaded: number;
    breaksDetected: number;
    loadErrors: { line: number; message: string }[];
    executionTimeMs: number;
  };
}

export function runDiagnosis(config: DiagnosisServiceConfig): DiagnosisResult {
  const startTime = Date.now();
  const loadErrors: { line: number; message: string }[] = [];

  const eventResult = loadEventsFromCsv(config.eventsPath);
  const events = eventResult.events;
  loadErrors.push(...eventResult.errors);

  const changeResult = loadChangesFromCsv(config.changesPath);
  const changes = changeResult.changes;
  loadErrors.push(...changeResult.errors);

  const snapshots = buildSnapshots(events);
  const conversionRates = calculateConversionRates(snapshots);
  const breaks = detectBreaks(conversionRates, config.breakDetectorConfig);
  const diagnoses = analyzeCauses(breaks, changes, config.causeAnalyzerConfig);

  return {
    diagnoses,
    metadata: {
      eventsLoaded: events.length,
      changesLoaded: changes.length,
      breaksDetected: breaks.length,
      loadErrors,
      executionTimeMs: Date.now() - startTime,
    },
  };
}

export function runDiagnosisFromData(
  events: Event[],
  changes: Change[],
  config?: {
    breakDetectorConfig?: Partial<BreakDetectorConfig>;
    causeAnalyzerConfig?: Partial<CauseAnalyzerConfig>;
  }
): DiagnosisResult {
  const startTime = Date.now();

  const snapshots = buildSnapshots(events);
  const conversionRates = calculateConversionRates(snapshots);
  const breaks = detectBreaks(conversionRates, config?.breakDetectorConfig);
  const diagnoses = analyzeCauses(breaks, changes, config?.causeAnalyzerConfig);

  return {
    diagnoses,
    metadata: {
      eventsLoaded: events.length,
      changesLoaded: changes.length,
      breaksDetected: breaks.length,
      loadErrors: [],
      executionTimeMs: Date.now() - startTime,
    },
  };
}
