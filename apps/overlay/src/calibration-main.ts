import { createApp } from "vue";
import CalibrationApp from "./CalibrationApp.vue";
import { resolvePreloadApi } from "./ipc/client.js";
import "./calibration.css";

resolvePreloadApi();
createApp(CalibrationApp).mount("#app");
