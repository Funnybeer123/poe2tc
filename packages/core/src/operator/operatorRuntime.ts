import { FrozenClock, SystemClock, type Clock } from "../clock.js";
import { armQa, evaluateQaArming } from "../capabilities/armQa.js";
import { isQaBuildEnabled } from "../capabilities/buildMode.js";
import { createCapabilities, type QaArmingState, type RuntimeCapabilities } from "../capabilities/createCapabilities.js";
import { evaluateFirstRun, type FirstRunSubmission } from "./firstRun.js";
import {
  DEFAULT_ALLOWLISTED_PROCESS_NAMES,
  DEFAULT_ALLOWLISTED_WINDOW_TITLE_INCLUDES,
} from "../perception/allowlist.js";
import { EmergencyStop } from "../input/emergencyStop.js";
import type { MarketProvider, NormalizedItem, QuoteContext } from "../items/types.js";
import { parseItem } from "../items/parseItem.js";
import { failedValuation, LOCKED_OUTLIER_METHOD } from "../market/valuation.js";
import { recommendListingPrice } from "../listing/pricePolicy.js";
import { createEmptyWorldState } from "../world-state/createEmptyWorldState.js";
import type { AutomationScenario } from "../scheduler/types.js";
import type { QaActionTrace, TraceSink } from "../trace/types.js";
import type { RuntimeMode, WorldState } from "../world-state/types.js";
import {
  DEFAULT_FILTER_PROFILE,
  defaultFilterFileName,
  generateLootFilter,
  type FilterProfile,
} from "../filter/lootFilter.js";
import { formatPriceEstimate } from "./priceFormat.js";
import {
  armingDto,
  capabilitiesDto,
  cloneDto,
  tracesDto,
  worldStateDto,
} from "./dto.js";
import type { DesirabilityPort } from "../items/desirabilityPort.js";
import type { FrameSource, PerceptionAdapter } from "../perception/types.js";
import type { LiveNativeSinkFactory } from "../input/createLiveInputSink.js";
import {
  LIVE_TICK_INTERVAL_MS,
  createDefaultLiveLoopScheduler,
  createLiveAutomationLoop,
  selectLiveScenario,
  type LiveAutomationLoop,
  type LiveLoopScheduler,
} from "../loop/liveAutomationLoop.js";
import type { AutomationTickResult } from "../loop/types.js";
import type {
  ArmResultDto,
  BuildFlagsDto,
  CatalogItemDto,
  ExportFilterResultDto,
  FirstRunResultDto,
  LiveLoopStatusDto,
  ParseClipboardResultDto,
  ReplayRunDto,
  StopResultDto,
} from "./ipcTypes.js";
import type { ReplayCatalog } from "./replayCatalog.js";
import {
  defaultOperatorSettings,
  OPERATOR_SETTINGS_KEY,
  parseOperatorSettings,
  type OperatorSettings,
  type SettingsPort,
} from "./settings.js";

export interface ClipboardReader {
  readText(): string;
}

export interface OperatorRuntimeOptions {
  mode: RuntimeMode;
  compileTimeMode?: RuntimeMode;
  clock?: Clock;
  emergencyStop?: EmergencyStop;
  settingsStore: SettingsPort;
  replayCatalog?: ReplayCatalog;
  market?: MarketProvider;
  clipboard?: ClipboardReader;
  hotkeyRegistered?: boolean;
  initialArming?: Partial<QaArmingState>;
  traceSink?: TraceSink;
  liveScheduler?: LiveLoopScheduler;
}

export interface LiveSessionBindings {
  frameSource: FrameSource;
  perception?: PerceptionAdapter;
  createNativeSink?: LiveNativeSinkFactory;
  desirability?: DesirabilityPort;
}

const DEFAULT_QUOTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CATALOG_SETTINGS_KEY = "catalog";
const SCENARIOS_SETTINGS_KEY = "scenarios";
const FILTER_SETTINGS_KEY = "filterProfile";

function defaultArming(overrides: Partial<QaArmingState> = {}): QaArmingState {
  return {
    acknowledged: false,
    armed: false,
    emergencyStopLatched: false,
    dryRunDefault: true,
    allowlistedProcessNames: [...DEFAULT_ALLOWLISTED_PROCESS_NAMES],
    allowlistedWindowTitleIncludes: [...DEFAULT_ALLOWLISTED_WINDOW_TITLE_INCLUDES],
    ...overrides,
  };
}

export class OperatorRuntime {
  readonly capabilities: RuntimeCapabilities;
  readonly emergencyStop: EmergencyStop;
  readonly settingsStore: SettingsPort;
  readonly compileTimeMode: RuntimeMode;
  readonly #clock: Clock;
  readonly #clipboard?: ClipboardReader;
  readonly #market?: MarketProvider;
  readonly #replayCatalog?: ReplayCatalog;
  readonly #traceSink?: TraceSink;
  #hotkeyRegistered: boolean;
  #arming: QaArmingState;
  #world: WorldState;
  #traces: QaActionTrace[] = [];
  #settings: OperatorSettings;
  #catalog: CatalogItemDto[] = [];
  #scenarios: AutomationScenario[] = [];
  #filterProfile: FilterProfile = cloneDto(DEFAULT_FILTER_PROFILE);
  #liveBindings?: LiveSessionBindings;
  #live?: LiveAutomationLoop;
  #liveScheduler: LiveLoopScheduler;
  #liveTimer?: unknown;
  #lastLiveTick?: AutomationTickResult;
  #liveReasons: string[] = ["not-started"];

  constructor(options: OperatorRuntimeOptions) {
    this.compileTimeMode = options.compileTimeMode ?? options.mode;
    const mode =
      options.mode === "authorized-qa" && !isQaBuildEnabled(this.compileTimeMode)
        ? "public-companion"
        : options.mode;
    this.capabilities = createCapabilities(mode);
    this.emergencyStop = options.emergencyStop ?? new EmergencyStop();
    this.settingsStore = options.settingsStore;
    this.#clock = options.clock ?? new SystemClock();
    this.#clipboard = options.clipboard;
    this.#market = options.market;
    this.#replayCatalog = options.replayCatalog;
    this.#traceSink = options.traceSink;
    this.#liveScheduler = options.liveScheduler ?? createDefaultLiveLoopScheduler();
    this.#hotkeyRegistered = options.hotkeyRegistered ?? false;
    this.#settings = this.#loadSettings();
    this.#catalog = this.#loadJson(CATALOG_SETTINGS_KEY, []);
    this.#scenarios = this.#loadJson(SCENARIOS_SETTINGS_KEY, []);
    this.#filterProfile = this.#loadJson(FILTER_SETTINGS_KEY, cloneDto(DEFAULT_FILTER_PROFILE));
    this.#arming = defaultArming({
      acknowledged: this.#settings.qaAcknowledged,
      emergencyStopLatched: this.emergencyStop.isLatched(),
      ...options.initialArming,
    });
    if (this.capabilities.mode !== "authorized-qa") {
      this.#patchArming({ armed: false, dryRunDefault: true });
    }
    this.#world = createEmptyWorldState({
      clock: this.#clock instanceof FrozenClock ? this.#clock : undefined,
      runtimeMode: this.capabilities.mode,
    });
    this.#syncLatch();
  }

  setHotkeyRegistered(registered: boolean): void {
    this.#hotkeyRegistered = registered;
  }

  getCapabilities() {
    return capabilitiesDto(this.capabilities);
  }

  getBuildFlags(): BuildFlagsDto {
    return {
      compileTimeMode: this.compileTimeMode,
      qaBuildEnabled: isQaBuildEnabled(this.compileTimeMode),
    };
  }

  completeFirstRun(submission: FirstRunSubmission): FirstRunResultDto {
    const evaluation = evaluateFirstRun(submission, this.compileTimeMode, this.#settings);
    if (evaluation.ok) {
      this.saveSettings(evaluation.settings);
    }
    return {
      ok: evaluation.ok,
      reasons: evaluation.reasons,
      settings: cloneDto(this.#settings),
    };
  }

  getWorldState() {
    return worldStateDto(this.#world);
  }

  getTraces() {
    return tracesDto(this.#traces);
  }

  getSettings(): OperatorSettings {
    return cloneDto(this.#settings);
  }

  getCatalog(): CatalogItemDto[] {
    return cloneDto(this.#catalog);
  }

  getScenarios(): AutomationScenario[] {
    return cloneDto(this.#scenarios);
  }

  getArming() {
    return armingDto(this.#arming);
  }

  armQa(): ArmResultDto {
    this.#syncLatch();
    if (this.capabilities.mode !== "authorized-qa" || !this.capabilities.canEmitNativeInput) {
      this.#patchArming({ armed: false });
      return {
        ok: false,
        armed: false,
        reasons: ["public-mode"],
        arming: armingDto(this.#arming),
      };
    }
    const evaluation = evaluateQaArming(this.capabilities, this.#arming, {
      hotkeyRegistered: this.#hotkeyRegistered,
    });
    this.#patchArming(
      armQa(this.capabilities, this.#arming, {
        hotkeyRegistered: this.#hotkeyRegistered,
      }),
    );
    if (this.#arming.armed) {
      this.startLiveLoop();
    }
    return {
      ok: evaluation.allowArm && this.#arming.armed,
      armed: this.#arming.armed,
      reasons: evaluation.reasons,
      arming: armingDto(this.#arming),
    };
  }

  disarmQa(): ArmResultDto {
    this.stopLiveLoop();
    this.#patchArming({ armed: false });
    return {
      ok: true,
      armed: false,
      reasons: [],
      arming: armingDto(this.#arming),
    };
  }

  setDryRunDefault(dryRunDefault: boolean): ArmResultDto {
    if (this.capabilities.mode !== "authorized-qa" || !this.capabilities.canEmitNativeInput) {
      this.#patchArming({ armed: false, dryRunDefault: true });
      return {
        ok: false,
        armed: false,
        reasons: ["public-mode"],
        arming: armingDto(this.#arming),
      };
    }
    this.#patchArming({ dryRunDefault });
    return {
      ok: true,
      armed: this.#arming.armed,
      reasons: [],
      arming: armingDto(this.#arming),
    };
  }

  tripStop(): StopResultDto {
    this.emergencyStop.trip();
    this.#live?.emergencyStop();
    this.stopLiveLoop();
    this.#patchArming({ armed: false, emergencyStopLatched: true });
    this.#world = {
      ...this.#world,
      flags: { ...this.#world.flags, emergencyStopLatched: true },
    };
    return {
      latched: true,
      armed: false,
      arming: armingDto(this.#arming),
    };
  }

  rearmStop(): StopResultDto {
    this.emergencyStop.rearm({ explicit: true });
    this.#patchArming({ emergencyStopLatched: false });
    this.#world = {
      ...this.#world,
      flags: { ...this.#world.flags, emergencyStopLatched: false },
    };
    return {
      latched: false,
      armed: this.#arming.armed,
      arming: armingDto(this.#arming),
    };
  }

  async runReplay(id: string): Promise<ReplayRunDto> {
    this.stopLiveLoop();
    if (this.#replayCatalog === undefined) {
      throw new Error("replay-catalog-unavailable");
    }
    const result = await this.#replayCatalog.run(id);
    this.#traces = result.traces;
    this.#persistTraces(result.traces);
    const last = result.traces[result.traces.length - 1];
    if (last !== undefined) {
      this.#world = {
        ...this.#world,
        tickId: last.tickId,
        clockMs: last.clockMs,
        capturedAtMs: last.clockMs,
        selectedState: last.selectedState,
        previousState: last.previousState,
        activeScenarioId: last.scenarioId,
        runtimeMode: last.runtimeMode,
      };
    }
    return {
      id,
      result: "end-of-stream",
      sinkKind: "noop",
      selectedStates: result.traces.map((trace) => trace.selectedState),
      traces: tracesDto(result.traces),
    };
  }

  async parseClipboard(text?: string): Promise<ParseClipboardResultDto> {
    const rawText = text ?? this.#clipboard?.readText() ?? "";
    if (rawText.trim().length === 0) {
      return {
        ok: false,
        rawText,
        error: "clipboard-empty",
        generatedGameActions: false,
      };
    }
    const parsed = parseItem({
      rawText,
      source: "clipboard",
      capturedAtMs: this.#clock.nowMs(),
    });
    if (!parsed.ok) {
      return {
        ok: false,
        rawText,
        error: parsed.error,
        generatedGameActions: false,
      };
    }
    const quoteContext: QuoteContext = {
      league: this.#settings.league,
      realm: "poe2",
      maxAgeMs: DEFAULT_QUOTE_MAX_AGE_MS,
    };
    const quote =
      this.#market === undefined
        ? failedValuation(parsed.item, "none", this.#clock.nowMs(), "market-unavailable").quote
        : await this.#market.quote(parsed.item, quoteContext);
    const recommended = recommendListingPrice(quote);
    const quoteWithListing: typeof quote = {
      ...quote,
      recommendedListing: "skip" in recommended ? quote.recommendedListing : recommended.price,
    };
    const valuation = {
      item: parsed.item,
      quote: quoteWithListing,
      outlierMethod: LOCKED_OUTLIER_METHOD,
      isGuaranteedSalePrice: false as const,
    };
    this.#upsertCatalog(parsed.item);
    return {
      ok: true,
      rawText,
      item: cloneDto(parsed.item),
      quote: cloneDto(quoteWithListing),
      valuation: cloneDto(valuation),
      estimate: formatPriceEstimate(quoteWithListing),
      generatedGameActions: false,
    };
  }

  exportFilter(profile?: FilterProfile): ExportFilterResultDto {
    const resolved = profile ?? this.#filterProfile;
    this.#filterProfile = cloneDto(resolved);
    this.#persistJson(FILTER_SETTINGS_KEY, this.#filterProfile);
    return {
      body: generateLootFilter(resolved),
      fileName: defaultFilterFileName(resolved),
      oauthSync: false,
    };
  }

  saveSettings(settings: OperatorSettings): OperatorSettings {
    this.#settings = parseOperatorSettings(settings);
    this.#persistJson(OPERATOR_SETTINGS_KEY, this.#settings);
    this.#patchArming({ acknowledged: this.#settings.qaAcknowledged });
    if (this.capabilities.mode !== "authorized-qa") {
      this.#patchArming({ armed: false, dryRunDefault: true });
    }
    return cloneDto(this.#settings);
  }

  saveScenario(scenario: AutomationScenario): AutomationScenario {
    const next = cloneDto(scenario);
    const index = this.#scenarios.findIndex((entry) => entry.id === next.id);
    if (index === -1) {
      this.#scenarios.push(next);
    } else {
      this.#scenarios[index] = next;
    }
    this.#persistJson(SCENARIOS_SETTINGS_KEY, this.#scenarios);
    return cloneDto(next);
  }

  #upsertCatalog(item: NormalizedItem): void {
    const lastSeenMs = this.#clock.nowMs();
    const index = this.#catalog.findIndex((entry) => entry.fingerprint === item.fingerprint);
    const row: CatalogItemDto = { fingerprint: item.fingerprint, item: cloneDto(item), lastSeenMs };
    if (index === -1) {
      this.#catalog.push(row);
    } else {
      this.#catalog[index] = row;
    }
    this.#persistJson(CATALOG_SETTINGS_KEY, this.#catalog);
  }

  bindLiveSession(bindings: LiveSessionBindings): void {
    this.#liveBindings = bindings;
  }

  startLiveLoop(): LiveLoopStatusDto {
    if (this.capabilities.mode !== "authorized-qa" || !this.capabilities.canEmitNativeInput) {
      this.#liveReasons = ["public-mode"];
      return this.getLiveLoopStatus();
    }
    if (this.#liveBindings === undefined) {
      this.#liveReasons = ["live-deps-unbound"];
      return this.getLiveLoopStatus();
    }
    if (!this.#arming.armed) {
      this.#liveReasons = ["qa-not-armed"];
      return this.getLiveLoopStatus();
    }
    if (this.#arming.emergencyStopLatched || this.emergencyStop.isLatched()) {
      this.#liveReasons = ["emergency-stop"];
      return this.getLiveLoopStatus();
    }
    const scenario = selectLiveScenario(this.#scenarios);
    if (scenario === undefined) {
      this.#liveReasons = ["no-live-scenario"];
      return this.getLiveLoopStatus();
    }

    this.stopLiveLoop();
    this.#live = createLiveAutomationLoop({
      frameSource: this.#liveBindings.frameSource,
      perception: this.#liveBindings.perception,
      createNativeSink: this.#liveBindings.createNativeSink,
      desirability: this.#liveBindings.desirability,
      capabilities: this.capabilities,
      arming: this.#arming,
      scenario,
      clock: this.#clock,
      emergencyStop: this.emergencyStop,
      traceSink: this.#traceSink,
    });
    this.#liveReasons = [];
    this.#liveTimer = this.#liveScheduler.start(() => {
      void this.tickLive();
    }, LIVE_TICK_INTERVAL_MS);
    return this.getLiveLoopStatus();
  }

  stopLiveLoop(): void {
    if (this.#liveTimer !== undefined) {
      this.#liveScheduler.stop(this.#liveTimer);
      this.#liveTimer = undefined;
    }
    this.#live = undefined;
    if (this.#liveReasons.length === 0) {
      this.#liveReasons = ["stopped"];
    }
  }

  async tickLive(): Promise<AutomationTickResult | { result: "not-running" }> {
    if (this.#live === undefined) {
      return { result: "not-running" };
    }
    const outcome = await this.#live.tick();
    this.#lastLiveTick = outcome;
    if (outcome.result === "ticked") {
      this.#world = outcome.world;
      this.#traces = [...this.#traces, outcome.trace];
      this.#persistTraces([outcome.trace]);
    }
    return outcome;
  }

  getLiveLoopStatus(): LiveLoopStatusDto {
    const last = this.#lastLiveTick;
    const ticked = last?.result === "ticked" ? last : undefined;
    return {
      running: this.#live !== undefined && this.#liveTimer !== undefined,
      sinkKind: this.#live?.sinkKind ?? "none",
      scenarioId: this.#live?.scenario.id ?? selectLiveScenario(this.#scenarios)?.id,
      lastTickId: ticked?.trace.tickId,
      lastState: ticked?.world.selectedState,
      lastDecisionReason: ticked?.decision.reason,
      lastInterlockCode: ticked?.verdict.code,
      lastExecuted: ticked?.trace.executed,
      lastDryRun: ticked?.trace.dryRun,
      reasons: [...this.#liveReasons],
    };
  }

  #patchArming(patch: Partial<QaArmingState>): void {
    Object.assign(this.#arming, patch);
  }

  #syncLatch(): void {
    this.#patchArming({
      emergencyStopLatched: this.emergencyStop.isLatched(),
    });
    if (this.#arming.emergencyStopLatched) {
      this.#patchArming({ armed: false });
    }
  }

  #loadSettings(): OperatorSettings {
    const raw = this.settingsStore.get(OPERATOR_SETTINGS_KEY);
    if (raw === undefined) {
      return defaultOperatorSettings();
    }
    try {
      return parseOperatorSettings(JSON.parse(raw) as unknown);
    } catch {
      return defaultOperatorSettings();
    }
  }

  #loadJson<T>(key: string, fallback: T): T {
    const raw = this.settingsStore.get(key);
    if (raw === undefined) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  #persistJson(key: string, value: unknown): void {
    this.settingsStore.set(key, JSON.stringify(value), this.#clock.nowMs());
  }

  #persistTraces(traces: readonly QaActionTrace[]): void {
    if (this.#traceSink === undefined) {
      return;
    }
    for (const trace of traces) {
      this.#traceSink.append(trace);
    }
  }
}

export function createOperatorRuntime(options: OperatorRuntimeOptions): OperatorRuntime {
  return new OperatorRuntime(options);
}
