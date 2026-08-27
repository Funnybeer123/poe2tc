<template>
  <section>
    <h2>Automation dashboard</h2>
    <div class="panel">
      <p data-testid="runtime-mode">Mode: {{ operatorState.capabilities.mode }}</p>
      <p data-testid="arming-status">Armed: {{ operatorState.arming.armed ? "yes" : "no" }}</p>
      <p data-testid="stop-status">
        Emergency stop: {{ operatorState.arming.emergencyStopLatched ? "latched" : "clear" }}
      </p>
      <p data-testid="dry-run-status">Dry-run default: {{ operatorState.arming.dryRunDefault ? "yes" : "no" }}</p>
      <p>Selected state: {{ operatorState.world?.selectedState ?? "—" }}</p>
      <p data-testid="live-loop-status">
        Live loop: {{ operatorState.liveLoop.running ? "running" : "stopped" }}
        · sink {{ operatorState.liveLoop.sinkKind }}
        · {{ operatorState.liveLoop.scenarioId ?? "no-scenario" }}
      </p>
      <p data-testid="live-loop-decision">
        {{ operatorState.liveLoop.lastDecisionReason ?? operatorState.liveLoop.reasons.join(", ") }}
      </p>
      <div class="row">
        <button
          data-testid="arm-qa"
          type="button"
          :disabled="!canArm"
          @click="arm"
        >
          Arm
        </button>
        <button data-testid="disarm-qa" type="button" @click="disarm">Disarm</button>
        <button class="danger" data-testid="dashboard-stop" type="button" @click="stop">STOP</button>
        <button data-testid="rearm-stop" type="button" @click="rearm">Rearm stop</button>
      </div>
      <div v-if="canArm" class="row">
        <button
          data-testid="dry-run-on"
          type="button"
          :disabled="operatorState.arming.dryRunDefault"
          @click="setDryRun(true)"
        >
          Keep dry-run
        </button>
        <button
          data-testid="dry-run-off"
          type="button"
          :disabled="!operatorState.arming.dryRunDefault"
          @click="setDryRun(false)"
        >
          Allow live execute
        </button>
      </div>
      <p v-if="!canArm" class="muted" data-testid="arm-disabled-reason">
        {{ armDisabledReason }}
      </p>
    </div>
    <div class="panel">
      <h3>Modules</h3>
      <ul>
        <li v-for="(enabled, moduleId) in operatorState.capabilities.modules" :key="moduleId">
          {{ moduleId }}: {{ enabled ? "on" : "off" }}
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { operatorState, refreshArming, refreshLiveLoop, refreshWorld } from "../operatorState.js";

let poll: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  poll = setInterval(() => {
    void refreshArming();
    void refreshLiveLoop();
    void refreshWorld();
  }, 500);
});

onUnmounted(() => {
  if (poll !== undefined) {
    clearInterval(poll);
  }
});

const canArm = computed(
  () =>
    operatorState.capabilities.mode === "authorized-qa" &&
    operatorState.capabilities.canEmitNativeInput === true,
);

const armDisabledReason = computed(() => {
  if (operatorState.capabilities.mode !== "authorized-qa") {
    return "Public companion cannot arm QA automation.";
  }
  return "Arming is available in authorized QA mode.";
});

async function arm(): Promise<void> {
  if (!canArm.value) {
    return;
  }
  try {
    const result = await operatorState.api.armQa();
    operatorState.arming = result.arming;
    await refreshLiveLoop();
    await refreshWorld();
  } catch (error) {
    operatorState.ipcError = {
      code: "ipc-failure",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function disarm(): Promise<void> {
  try {
    const result = await operatorState.api.disarmQa();
    operatorState.arming = result.arming;
    await refreshLiveLoop();
  } catch (error) {
    operatorState.ipcError = {
      code: "ipc-failure",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function stop(): Promise<void> {
  try {
    const result = await operatorState.api.tripStop();
    operatorState.arming = result.arming;
    await refreshLiveLoop();
  } catch (error) {
    operatorState.ipcError = {
      code: "ipc-failure",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function rearm(): Promise<void> {
  try {
    const result = await operatorState.api.rearmStop();
    operatorState.arming = result.arming;
  } catch (error) {
    operatorState.ipcError = {
      code: "ipc-failure",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function setDryRun(dryRunDefault: boolean): Promise<void> {
  if (!canArm.value) {
    return;
  }
  try {
    const result = await operatorState.api.setDryRunDefault(dryRunDefault);
    operatorState.arming = result.arming;
  } catch (error) {
    operatorState.ipcError = {
      code: "ipc-failure",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
</script>
