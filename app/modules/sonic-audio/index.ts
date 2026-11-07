import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

type Events = {
  onMessage: (event: { bytes: number[]; heardAt: number }) => void;
  onTick: (event: { now: number }) => void;
};

export interface SonicAudioModule {
  addListener<K extends keyof Events>(name: K, listener: Events[K]): EventSubscription;
  isPatrolling(): boolean;
  startPatrol(): void;
  stopPatrol(): void;
  transmit(bytes: number[], protocol: number, volume: number, delayMs: number): Promise<number>;
  alert(title: string, body: string): void;
  selfTest(): string;
  pbkdf2(password: string, salt: string, iterations: number, bytes: number): Promise<string>;
  appendLog(text: string): void;
  getPref(key: string): string | null;
  setPref(key: string, value: string): void;
  isBatteryUnrestricted(): boolean;
  openBatterySettings(): void;
}

export default requireNativeModule<SonicAudioModule>('SonicAudio');
