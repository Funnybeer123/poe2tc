import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./ipcChannels.js";

contextBridge.exposeInMainWorld("poe2tcCalibration", {
  getCapabilities: () => ipcRenderer.invoke(IPC_CHANNELS.getCapabilities),
  getArming: () => ipcRenderer.invoke(IPC_CHANNELS.getArming),
  getLiveLoopStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getLiveLoopStatus),
  tripStop: () => ipcRenderer.invoke(IPC_CHANNELS.tripStop),
});
