import path from "path";
import { runDiagnosis, DiagnosisResult } from "../../services/DiagnosisService";
import { Diagnosis, CauseCandidate, BreakSeverity } from "../../core/entities";

interface CliArgs {
  events: string;
  changes: string;
  format: "table" | "json";
  baselineDays?: number;
  currentDays?: number;
  minDrop?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    events: "",
    changes: "",
    format: "table",
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--events":
        args.events = argv[++i];
        break;
      case "--changes":
        args.changes = argv[++i];
        break;
      case "--format":
        args.format = argv[++i] as "table" | "json";
        break;
      case "--baseline-days":
        args.baselineDays = parseInt(argv[++i], 10);
        break;
      case "--current-days":
        args.currentDays = parseInt(argv[++i], 10);
        break;
      case "--min-drop":
        args.minDrop = parseFloat(argv[++i]);
        break;
      case "--help":
        printUsage();
        process.exit(0);
      default:
        console.error(`Unknown argument: ${argv[i]}`);
        printUsage();
        process.exit(2);
    }
  }

  if (!args.events || !args.changes) {
    console.error("Error: --events and --changes are required.");
    printUsage();
    process.exit(2);
  }

  return args;
}

function printUsage(): void {
  console.log(`
Usage: npx ts-node src/interfaces/cli/runDiagnosis.ts [options]

Required:
  --events <path>        Path to events CSV file
  --changes <path>       Path to changes CSV file

Optional:
  --format <table|json>  Output format (default: table)
  --baseline-days <n>    Baseline window in days (default: 14)
  --current-days <n>     Current window in days (default: 3)
  --min-drop <n>         Minimum relative drop threshold (default: 0.15)
  --help                 Show this help message
`);
}

function formatTableOutput(result: DiagnosisResult): void {
  const line = "=".repeat(56);
  const divider = "-".repeat(56);

  console.log(`\n${line}`);
  console.log(" FUNNEL GUARD - Diagnosis Report");
  console.log(` Generated: ${new Date().toISOString()}`);
  console.log(line);

  console.log(`\nDATA SUMMARY`);
  console.log(`  Events loaded:  ${result.metadata.eventsLoaded}`);
  console.log(`  Changes loaded: ${result.metadata.changesLoaded}`);
  console.log(`  Load errors:    ${result.metadata.loadErrors.length}`);
  console.log(`  Breaks found:   ${result.metadata.breaksDetected}`);
  console.log(`  Execution time: ${result.metadata.executionTimeMs}ms`);

  if (result.metadata.loadErrors.length > 0) {
    console.log(`\n  LOAD ERRORS:`);
    for (const err of result.metadata.loadErrors.slice(0, 10)) {
      console.log(`    Line ${err.line}: ${err.message}`);
    }
    if (result.metadata.loadErrors.length > 10) {
      console.log(`    ... and ${result.metadata.loadErrors.length - 10} more`);
    }
  }

  if (result.diagnoses.length === 0) {
    console.log(`\n${divider}`);
    console.log("  No breaks detected. Funnel performance is stable.");
    console.log(`${line}\n`);
    return;
  }

  for (let i = 0; i < result.diagnoses.length; i++) {
    const diag = result.diagnoses[i];
    const brk = diag.break;

    console.log(`\n${divider}`);
    console.log(`BREAK #${i + 1} [${brk.severity.toUpperCase()}]`);
    console.log(`  Funnel:     ${brk.funnelId}`);
    console.log(`  Transition: ${brk.fromStage} -> ${brk.toStage}`);
    console.log(`  Date:       ${brk.detectedDate}`);
    console.log(`  Baseline:   ${(brk.baselineRate * 100).toFixed(1)}%`);
    console.log(`  Current:    ${(brk.currentRate * 100).toFixed(1)}%`);
    console.log(`  Drop:       -${(brk.absoluteDrop * 100).toFixed(1)}% absolute / -${(brk.relativeDrop * 100).toFixed(1)}% relative`);
    console.log(`  Z-Score:    ${brk.zScore.toFixed(2)}`);

    if (diag.causes.length > 0) {
      console.log(`\n  LIKELY CAUSES:`);
      for (let j = 0; j < Math.min(diag.causes.length, 5); j++) {
        const cause = diag.causes[j];
        const confPct = (cause.confidence * 100).toFixed(0);
        console.log(`  #${j + 1} [${confPct}% confidence] "${cause.changeDescription}"`);
        console.log(`     Category: ${cause.changeCategory} | Date: ${cause.changeDate} | Severity: ${cause.changeSeverity}/5`);
        const bd = cause.scoreBreakdown;
        console.log(`     Scores: temporal=${bd.temporalScore.toFixed(3)} category=${bd.categoryRelevanceScore.toFixed(2)} severity=${bd.severityScore.toFixed(2)} stage_match=${bd.stageMatchBonus > 0 ? "+" : ""}${bd.stageMatchBonus.toFixed(1)}`);
      }
    }

    console.log(`\n  STATUS: ${diag.diagnosisStatus.toUpperCase()}`);
    console.log(`  SUMMARY: ${diag.summary}`);
  }

  console.log(`\n${line}`);
  console.log("END OF REPORT");
  console.log(`${line}\n`);
}

function main(): void {
  try {
    const args = parseArgs(process.argv);

    const eventsPath = path.resolve(args.events);
    const changesPath = path.resolve(args.changes);

    const result = runDiagnosis({
      eventsPath,
      changesPath,
      breakDetectorConfig: {
        ...(args.baselineDays !== undefined && { baselineWindowDays: args.baselineDays }),
        ...(args.currentDays !== undefined && { currentWindowDays: args.currentDays }),
        ...(args.minDrop !== undefined && { minRelativeDrop: args.minDrop }),
      },
    });

    if (args.format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      formatTableOutput(result);
    }

    // Exit code: 1 if critical breaks found
    const hasCritical = result.diagnoses.some(
      (d: Diagnosis) => d.break.severity === BreakSeverity.CRITICAL
    );
    process.exit(hasCritical ? 1 : 0);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
}

main();
