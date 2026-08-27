/// <reference types="vite/client" />

import type {
  ArmingDto,
  CapabilitiesDto,
  LiveLoopStatusDto,
  Poe2tcPreloadApi,
  StopResultDto,
} from "@poe2tc/core/operator";

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare global {
  interface Window {
    poe2tc?: Poe2tcPreloadApi;
    poe2tcBanner?: {
      getCapabilities(): Promise<CapabilitiesDto>;
      tripStop(): Promise<StopResultDto>;
    };
    poe2tcCalibration?: {
      getCapabilities(): Promise<CapabilitiesDto>;
      getArming(): Promise<ArmingDto>;
      getLiveLoopStatus(): Promise<LiveLoopStatusDto>;
      tripStop(): Promise<StopResultDto>;
    };
  }
}

export {};
