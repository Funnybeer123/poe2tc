<template>
  <CalibrationOverlay v-if="model" :model="model" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import {
  CALIBRATION_OVERLAY_TICK_MS,
  hiddenCalibrationOverlay,
  type DryRunCalibrationOverlay,
} from "@poe2tc/core/operator";
import CalibrationOverlay from "./components/CalibrationOverlay.vue";

const model = ref<DryRunCalibrationOverlay>(hiddenCalibrationOverlay("not-armed"));
let poll: ReturnType<typeof setInterval> | undefined;

async function refresh(): Promise<void> {
  const api = window.poe2tcCalibration ?? window.poe2tc;
  if (api === undefined || typeof api.getLiveLoopStatus !== "function") {
    model.value = hiddenCalibrationOverlay("public-mode");
    return;
  }
  try {
    const status = await api.getLiveLoopStatus();
    model.value = status.calibrationOverlay ?? hiddenCalibrationOverlay("not-armed");
  } catch {
    model.value = hiddenCalibrationOverlay("not-armed");
  }
}

onMounted(() => {
  void refresh();
  poll = setInterval(() => {
    void refresh();
  }, CALIBRATION_OVERLAY_TICK_MS);
});

onUnmounted(() => {
  if (poll !== undefined) {
    clearInterval(poll);
  }
});
</script>
