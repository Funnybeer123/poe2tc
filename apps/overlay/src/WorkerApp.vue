<template>
  <main data-testid="hidden-worker">
    <p>Hidden operator worker</p>
    <p data-testid="worker-live-running">
      Live loop: {{ operatorState.liveLoop.running ? "running" : "stopped" }}
    </p>
    <p data-testid="worker-live-sink">Sink: {{ operatorState.liveLoop.sinkKind }}</p>
    <p data-testid="worker-live-state">State: {{ operatorState.liveLoop.lastState ?? "—" }}</p>
    <p data-testid="worker-live-reason">
      {{
        [
          operatorState.liveLoop.lastDecisionReason,
          operatorState.liveLoop.reasons.length > 0
            ? operatorState.liveLoop.reasons.join(", ")
            : undefined,
        ]
          .filter((part) => part !== undefined && part.length > 0)
          .join(" · ")
      }}
    </p>
  </main>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { bootstrapOperator, operatorState, refreshLiveLoop, refreshWorld } from "./operatorState.js";

let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  void bootstrapOperator();
  timer = setInterval(() => {
    void refreshLiveLoop();
    void refreshWorld();
  }, 500);
});

onUnmounted(() => {
  if (timer !== undefined) {
    clearInterval(timer);
  }
});
</script>
