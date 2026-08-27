<template>
  <svg
    v-if="model.visible"
    class="calibration-overlay"
    data-testid="calibration-overlay"
    :viewBox="`0 0 ${model.frameWidth} ${model.frameHeight}`"
    preserveAspectRatio="none"
  >
    <text
      class="label"
      data-testid="calibration-label"
      x="16"
      y="28"
      fill="#22d3ee"
    >
      QA dry-run calibration · no input
      <template v-if="model.inventory.placeholder || model.stash.placeholder">
        · placeholder grids
      </template>
    </text>
    <rect
      v-for="(cell, index) in model.stash.cells"
      :key="`stash-${String(cell.column)}-${String(cell.row)}`"
      data-testid="calibration-stash-cell"
      :data-col="cell.column"
      :data-row="cell.row"
      :x="cell.x"
      :y="cell.y"
      :width="cell.width"
      :height="cell.height"
      class="stash-cell"
      :data-index="index"
    />
    <rect
      v-for="(cell, index) in model.inventory.cells"
      :key="`bag-${String(cell.column)}-${String(cell.row)}`"
      data-testid="calibration-inventory-cell"
      :data-col="cell.column"
      :data-row="cell.row"
      :x="cell.x"
      :y="cell.y"
      :width="cell.width"
      :height="cell.height"
      class="inventory-cell"
      :data-index="index"
    />
    <line
      v-for="(drag, index) in model.drags"
      :key="`drag-${String(index)}`"
      data-testid="calibration-drag"
      :x1="drag.from.x"
      :y1="drag.from.y"
      :x2="drag.to.x"
      :y2="drag.to.y"
      class="drag-arrow"
      marker-end="url(#calibration-arrow)"
    />
    <circle
      v-for="(click, index) in model.clicks"
      :key="`click-${click.kind}-${String(index)}`"
      :data-testid="`calibration-${click.kind}`"
      :cx="click.x"
      :cy="click.y"
      r="7"
      :class="click.kind"
    />
    <defs>
      <marker
        id="calibration-arrow"
        markerWidth="10"
        markerHeight="8"
        refX="8"
        refY="4"
        orient="auto"
      >
        <polygon points="0 0, 10 4, 0 8" fill="#f8fafc" />
      </marker>
    </defs>
  </svg>
</template>

<script setup lang="ts">
import type { DryRunCalibrationOverlay } from "@poe2tc/core/operator";

defineProps<{
  model: DryRunCalibrationOverlay;
}>();
</script>

<style scoped>
.calibration-overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.label {
  font-size: 18px;
  font-weight: 700;
}

.inventory-cell {
  fill: rgba(34, 211, 238, 0.08);
  stroke: #22d3ee;
  stroke-width: 1.5;
}

.stash-cell {
  fill: rgba(234, 179, 8, 0.08);
  stroke: #eab308;
  stroke-width: 1.5;
}

.drag-arrow {
  stroke: #f8fafc;
  stroke-width: 3;
}

.click,
.drag-from,
.drag-to {
  fill: #f8fafc;
  stroke: #0f172a;
  stroke-width: 2;
}

.drag-from {
  fill: #22d3ee;
}

.drag-to {
  fill: #eab308;
}
</style>
