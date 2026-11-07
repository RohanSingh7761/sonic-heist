// Must load before anything that signs: Hermes has no crypto.getRandomValues, and viem's libraries read it at import.
import { getRandomValues } from 'expo-crypto';

if (!(globalThis as any).crypto?.getRandomValues) {
  (globalThis as any).crypto = { ...(globalThis as any).crypto, getRandomValues };
}

// Android pauses JavaScript timers while the app is in the background, which would freeze viem's retries and receipt
// polling on a locked phone. Every timer also fires from the patrol service's heartbeat, whichever comes first.
const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const pending = new Map<number, { at: number; run: () => void; native: ReturnType<typeof nativeSetTimeout> }>();
let nextId = 1;

globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms = 0, ...args: unknown[]) => {
  const id = nextId++;
  const run = () => {
    if (pending.delete(id)) fn(...args);
  };
  pending.set(id, { at: Date.now() + ms, run, native: nativeSetTimeout(run, ms) });
  return id;
}) as unknown as typeof setTimeout;

globalThis.clearTimeout = ((id?: number) => {
  const timer = id === undefined ? undefined : pending.get(id);
  if (!timer) return;
  pending.delete(id as number);
  nativeClearTimeout(timer.native);
}) as unknown as typeof clearTimeout;

export function runDueTimers(now: number) {
  for (const timer of [...pending.values()]) {
    if (now >= timer.at) {
      nativeClearTimeout(timer.native);
      timer.run();
    }
  }
}
