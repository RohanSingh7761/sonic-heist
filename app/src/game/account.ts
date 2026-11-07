// Accounts and leaderboard over Neon's HTTP SQL endpoint, so no server of our own is needed.
// The password stays on the phone: one half of its derived key logs in, the other half encrypts the wallet key.
import { gcm } from '@noble/ciphers/aes.js';
import SonicAudio from '../../modules/sonic-audio';
import { bytesToHex, hexToBytes } from '../protocol/signatures';

const KDF_ITERATIONS = 100_000;
const NONCE_BYTES = 12;
const REQUEST_TIMEOUT_MS = 15_000;

export const USERNAME_RULE = /^[A-Za-z0-9_]{3,20}$/;
export const MIN_PASSWORD = 8;

export interface LeaderboardRow {
  username: string;
  robs: number;
}

export class AccountError extends Error {}

const FRIENDLY: Record<string, string> = {
  BAD_USERNAME: 'Usernames are 3 to 20 letters, numbers or underscores.',
  USERNAME_TAKEN: 'That username is taken.',
  WALLET_TAKEN: 'This phone\'s wallet already has an account. Log in instead.',
  BAD_LOGIN: 'Wrong username or password.',
  LOCKED: 'Too many wrong passwords. Try again in 15 minutes.',
  BAD_REQUEST: 'Something went wrong. Try again.',
};

async function call(fn: string, params: unknown[]): Promise<any> {
  const connection = process.env.EXPO_PUBLIC_DATABASE_URL;
  if (!connection) throw new AccountError('Accounts are not set up in this build.');
  const host = connection.split('@')[1]?.split('/')[0] ?? '';
  const placeholders = params.map((_, i) => `$${i + 1}`).join(',');
  const request = JSON.stringify({ query: `select sonic_heist.${fn}(${placeholders}) as result`, params });

  // Neon answers on two addresses, so a network that can't reach one may still reach the other.
  let res: Response | undefined;
  let reason = 'unknown error';
  for (const url of [`https://${host.replace(/^[^.]+\./, 'api.')}/sql`, `https://${host}/sql`]) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': connection, 'Neon-Raw-Text-Output': 'true' },
        body: request,
        signal: abort.signal,
      });
      break;
    } catch (err) {
      reason = abort.signal.aborted ? 'timed out' : err instanceof Error ? err.message : String(err);
      SonicAudio.appendLog(`Account request failed at ${url}: ${reason}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!res) throw new AccountError(`Could not reach the server. Check your internet. (${reason})`);
  if (!res.ok) throw new AccountError('The server had a problem. Try again.');
  const body = await res.json();
  const value = body.rows?.[0]?.result;
  const result = typeof value === 'string' ? JSON.parse(value) : value;
  if (result?.error) throw new AccountError(FRIENDLY[result.error] ?? 'Something went wrong. Try again.');
  return result;
}

async function deriveKeys(username: string, password: string) {
  const salt = `sonic-heist:v1:${username.toLowerCase()}`;
  const derived = hexToBytes(await SonicAudio.pbkdf2(password, salt, KDF_ITERATIONS, 64));
  return { auth: bytesToHex(derived.slice(0, 32)).slice(2), encryptionKey: derived.slice(32, 64) };
}

function encryptWalletKey(privateKey: string, encryptionKey: Uint8Array) {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const sealed = gcm(encryptionKey, nonce).encrypt(hexToBytes(privateKey));
  return `${bytesToHex(nonce).slice(2)}${bytesToHex(sealed).slice(2)}`;
}

function decryptWalletKey(stored: string, encryptionKey: Uint8Array): `0x${string}` {
  const bytes = hexToBytes(stored);
  const opened = gcm(encryptionKey, bytes.slice(0, NONCE_BYTES)).decrypt(bytes.slice(NONCE_BYTES));
  return bytesToHex(opened);
}

export async function signUp(username: string, password: string, privateKey: `0x${string}`, address: string) {
  const { auth, encryptionKey } = await deriveKeys(username, password);
  const result = await call('signup', [username, auth, address, encryptWalletKey(privateKey, encryptionKey)]);
  return { username: result.username as string, token: result.token as string };
}

export async function logIn(username: string, password: string) {
  const { auth, encryptionKey } = await deriveKeys(username, password);
  const result = await call('login', [username, auth]);
  return {
    username: result.username as string,
    token: result.token as string,
    robs: Number(result.robs ?? 0),
    privateKey: decryptWalletKey(result.key, encryptionKey),
  };
}

export const recordRob = (token: string, lootId: number) => call('record_rob', [token, lootId]);

export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const rows = await call('leaderboard', [50]);
  return (rows as { username: string; robs: number | string }[]).map((r) => ({ username: r.username, robs: Number(r.robs) }));
}
