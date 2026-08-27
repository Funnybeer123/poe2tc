import type { Clock } from "../clock.js";
import { SystemClock } from "../clock.js";
import type { QaArmingState, RuntimeCapabilities } from "../capabilities/createCapabilities.js";
import { EmergencyStop } from "../input/emergencyStop.js";
import { createLiveInputSink, type NativeInputSinkFactory } from "../input/createLiveInputSink.js";
import {
  createGameInputController,
  createSystemSleeper,
  DefaultGameInputController,
} from "../input/gameInputController.js";
import type { InputSink } from "../input/types.js";
import type { DesirabilityPort } from "../items/desirabilityPort.js";
import type { PerceptionAdapter, FrameSource } from "../perception/types.js";
import { createScenarioScheduler } from "../scheduler/scenarioScheduler.js";
import type { AutomationScenario } from "../scheduler/types.js";
import { InMemoryTraceSink } from "../trace/inMemoryTraceSink.js";
import { QaTraceWriter } from "../trace/qaTraceWriter.js";
import type { TraceSink } from "../trace/types.js";
import { createAutomationLoop, type AutomationLoop } from "./automationLoop.js";
import type { AutomationTickResult } from "./types.js";

export const LIVE_STASH_SCENARIO_ID = "stash-sort-live";
export const LIVE_TICK_INTERVAL_MS = 250;

export interface LiveLoopScheduler {
  start(tick: () => void, intervalMs: number): unknown;
  stop(handle: unknown): void;
}

export function createDefaultLiveLoopScheduler(): LiveLoopScheduler {
  return {
    start(tick, intervalMs) {
      return setInterval(tick, intervalMs);
    },
    stop(handle) {
      clearInterval(handle as ReturnType<typeof setInterval>);
    },
  };
}

export function selectLiveScenario(
  scenarios: readonly AutomationScenario[],
): AutomationScenario | undefined {
  return (
    scenarios.find((scenario) => scenario.id === LIVE_STASH_SCENARIO_ID && scenario.enabled) ??
    scenarios.find((scenario) => scenario.executionMode === "live" && scenario.enabled) ??
    scenarios.find((scenario) => scenario.enabled)
  );
}

export interface LiveAutomationLoopOptions {
  frameSource: FrameSource;
  capabilities: RuntimeCapabilities;
  arming: QaArmingState;
  scenario: AutomationScenario;
  clock?: Clock;
  emergencyStop?: EmergencyStop;
  perception?: PerceptionAdapter;
  createNativeSink?: NativeInputSinkFactory;
  traceSink?: TraceSink;
  desirability?: DesirabilityPort;
}

class MultiplexTraceSink implements TraceSink {
  readonly memory = new InMemoryTraceSink();
  readonly #extra?: TraceSink;

  constructor(extra?: TraceSink) {
    this.#extra = extra;
  }

  append(trace: Parameters<TraceSink["append"]>[0]): void {
    this.memory.append(trace);
    this.#extra?.append(trace);
  }
}

export class LiveAutomationLoop {
  readonly loop: AutomationLoop;
  readonly sink: InputSink;
  readonly input: DefaultGameInputController;
  readonly traces: InMemoryTraceSink;
  readonly scenario: AutomationScenario;

  constructor(options: LiveAutomationLoopOptions) {
    const clock = options.clock ?? new SystemClock();
    const emergencyStop = options.emergencyStop ?? new EmergencyStop();
    this.scenario = options.scenario;
    this.sink = createLiveInputSink({
      capabilities: options.capabilities,
      arming: options.arming,
      createNativeSink: options.createNativeSink,
    });
    this.input = createGameInputController({
      capabilities: options.capabilities,
      clock,
      sink: this.sink,
      emergencyStop,
      sleeper: createSystemSleeper(),
    });
    const multiplex = new MultiplexTraceSink(options.traceSink);
    this.traces = multiplex.memory;
    this.loop = createAutomationLoop({
      frameSource: options.frameSource,
      scheduler: createScenarioScheduler(),
      input: this.input,
      clock,
      capabilities: options.capabilities,
      arming: options.arming,
      scenario: options.scenario,
      perception: options.perception,
      desirability: options.desirability,
      traceWriter: new QaTraceWriter(multiplex, { redactIdentifiers: true }),
    });
  }

  get world() {
    return this.loop.world;
  }

  get sinkKind(): InputSink["kind"] {
    return this.sink.kind;
  }

  async tick(): Promise<AutomationTickResult> {
    return this.loop.tick();
  }

  emergencyStop(): void {
    this.input.emergencyStop();
  }
}

export function createLiveAutomationLoop(options: LiveAutomationLoopOptions): LiveAutomationLoop {
  return new LiveAutomationLoop(options);
}
