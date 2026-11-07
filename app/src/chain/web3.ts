import { createPublicClient, createWalletClient, http, formatEther, parseEther, parseEventLogs, parseSignature, recoverTypedDataAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { CONFIG, HEIST_VAULT_ABI } from '../config';
import { bytesToHex, splitCompactSignature, toCompactSignature } from '../protocol/signatures';

const HEAD_START_SECONDS = 10; // HeistVault.HEAD_START

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(CONFIG.rpcUrl),
});

export function getWalletClient(privateKey: `0x${string}`) {
  const account = privateKeyToAccount(privateKey);
  return {
    client: createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(CONFIG.rpcUrl),
    }),
    account,
  };
}

// Fetch on-chain balance and vault stake on Base Sepolia
export async function fetchOnChainBalances(address: `0x${string}`) {
  const read = (functionName: 'vault' | 'immuneUntil' | 'thiefReadyAt') =>
    publicClient.readContract({
      address: CONFIG.heistVaultAddress,
      abi: HEIST_VAULT_ABI,
      functionName,
      args: [address],
    }) as Promise<bigint>;
  const [balanceWei, vaultWei, immuneUntil, thiefReadyAt, block] = await Promise.all([
    publicClient.getBalance({ address }),
    read('vault'),
    read('immuneUntil'),
    read('thiefReadyAt'),
    publicClient.getBlock(),
  ]);
  const clockOffsetMs = Date.now() - Number(block.timestamp) * 1000;

  return {
    walletEth: parseFloat(formatEther(balanceWei)),
    stakeEth: parseFloat(formatEther(vaultWei)),
    // In this phone's clock. Kept on-chain, so they survive a refresh.
    immuneUntilMs: Number(immuneUntil) * 1000 + clockOffsetMs,
    readyAtMs: Number(thiefReadyAt) * 1000 + clockOffsetMs,
  };
}

let chainLog: (kind: 'good' | 'bad' | 'info', text: string) => void = () => {};
export const setChainLogger = (logger: typeof chainLog) => {
  chainLog = logger;
};

// Simulates first, so a revert shows the contract's error name and costs no gas.
async function send(
  privateKey: `0x${string}`,
  call: { functionName: string; args?: readonly unknown[]; value?: bigint }
) {
  const { client, account } = getWalletClient(privateKey);
  chainLog('info', `Chain: simulating ${call.functionName}`);
  const { request } = await publicClient.simulateContract({
    address: CONFIG.heistVaultAddress,
    abi: HEIST_VAULT_ABI,
    account,
    ...call,
  } as any);
  // simulateContract trims errors from the ABI it returns, and the loot's random roll can change between the two calls.
  const hash = await client.writeContract({ ...request, abi: HEIST_VAULT_ABI } as any);
  chainLog('info', `Chain: sent ${call.functionName}, tx ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`${call.functionName} transaction reverted, tx ${hash}`);
  chainLog('good', `Chain: ${call.functionName} confirmed in block ${receipt.blockNumber}, gas ${receipt.gasUsed}, tx ${hash}`);
  return { hash, receipt };
}

// Execute on-chain deposit to HeistVault
export function depositToVault(privateKey: `0x${string}`, amountEth: number) {
  return send(privateKey, { functionName: 'deposit', value: parseEther(amountEth.toFixed(6)) });
}

// Execute on-chain withdraw from HeistVault
export function withdrawFromVault(privateKey: `0x${string}`, amountEth: number) {
  return send(privateKey, { functionName: 'withdraw', args: [parseEther(amountEth.toFixed(6))] });
}

// --- Signed messages sent over ultrasound. Must match the typehashes in HeistVault.sol. ---
const DOMAIN = {
  name: 'SonicHeist',
  version: '1',
  chainId: CONFIG.chainId,
  verifyingContract: CONFIG.heistVaultAddress,
} as const;

const TYPES = {
  LootTicket: [
    { name: 'thief', type: 'address' },
    { name: 'nonce', type: 'uint64' },
    { name: 'validBefore', type: 'uint32' },
  ],
  // Not checked on-chain: lets the thief's phone ignore a CATCH that isn't from its victim (README 8.4).
  Catch: [
    { name: 'lootId', type: 'uint256' },
    { name: 'challenge', type: 'bytes8' },
  ],
  Caught: [
    { name: 'lootId', type: 'uint256' },
    { name: 'victim', type: 'address' },
    { name: 'challenge', type: 'bytes8' },
  ],
} as const;

async function signCompact(privateKey: `0x${string}`, primaryType: keyof typeof TYPES, message: Record<string, unknown>) {
  const hex = await privateKeyToAccount(privateKey).signTypedData({ domain: DOMAIN, types: TYPES, primaryType, message } as any);
  const { r, s, yParity } = parseSignature(hex);
  return toCompactSignature(r, s, yParity as number);
}

export const signLootTicket = (privateKey: `0x${string}`, thief: `0x${string}`, nonce: bigint, validBefore: number) =>
  signCompact(privateKey, 'LootTicket', { thief, nonce, validBefore });

export const signCatch = (privateKey: `0x${string}`, lootId: number, challenge: Uint8Array) =>
  signCompact(privateKey, 'Catch', { lootId: BigInt(lootId), challenge: bytesToHex(challenge) });

export const signCaught = (privateKey: `0x${string}`, lootId: number, victim: `0x${string}`, challenge: Uint8Array) =>
  signCompact(privateKey, 'Caught', { lootId: BigInt(lootId), victim, challenge: bytesToHex(challenge) });

export const recoverCatchSigner = (lootId: number, challenge: Uint8Array, signature: Uint8Array) => {
  const { r, s, v } = splitCompactSignature(signature);
  return recoverTypedDataAddress({
    domain: DOMAIN,
    types: TYPES,
    primaryType: 'Catch',
    message: { lootId: BigInt(lootId), challenge: bytesToHex(challenge) },
    signature: { r, s, yParity: v - 27 },
  } as any);
};

// --- Loots ---
export const LOOT_CANCELLED = 2;
export const LOOT_CLAIMED = 3;

// revealAt and deadline are in this phone's clock (ms), which can differ from the chain's.
export interface ChainLoot {
  lootId: number;
  thief: `0x${string}`;
  victim: `0x${string}`;
  amount: number;
  bond: number;
  revealAt: number;
  deadline: number;
}

export async function startLootOnChain(privateKey: `0x${string}`, nonce: bigint, validBefore: number, signature: Uint8Array): Promise<ChainLoot> {
  const { receipt } = await send(privateKey, { functionName: 'startLoot', args: [nonce, validBefore, bytesToHex(signature)] });
  const [{ args }] = parseEventLogs({ abi: HEIST_VAULT_ABI, eventName: 'LootStarted', logs: receipt.logs });
  // The loot started in the block we just got a receipt for, one head start before its reveal.
  const clockOffsetMs = Date.now() - (Number(args.revealAt) - HEAD_START_SECONDS) * 1000;
  return {
    lootId: Number(args.lootId),
    thief: args.thief,
    victim: args.victim,
    amount: parseFloat(formatEther(args.amount)),
    bond: parseFloat(formatEther(args.bond)),
    revealAt: Number(args.revealAt) * 1000 + clockOffsetMs,
    deadline: Number(args.deadline) * 1000 + clockOffsetMs,
  };
}

export const cancelLootOnChain = (privateKey: `0x${string}`, lootId: number, challenge: Uint8Array, thiefSignature: Uint8Array) =>
  send(privateKey, { functionName: 'cancel', args: [BigInt(lootId), bytesToHex(challenge), bytesToHex(thiefSignature)] });

export const clearTimerOnChain = (privateKey: `0x${string}`, timer: 'immunity' | 'cooldown') =>
  send(privateKey, { functionName: timer === 'immunity' ? 'clearMyImmunity' : 'clearMyCooldown' });

export const claimLootOnChain = (privateKey: `0x${string}`, lootId: number) =>
  send(privateKey, { functionName: 'claim', args: [BigInt(lootId)] });

const readVault = (functionName: string, args: readonly unknown[]) =>
  publicClient.readContract({ address: CONFIG.heistVaultAddress, abi: HEIST_VAULT_ABI, functionName, args } as any) as Promise<any>;

export async function fetchLootStatus(lootId: number): Promise<number> {
  const loot = await readVault('loots', [BigInt(lootId)]);
  return Number(loot[7]);
}

// The loots this address is in right now. This is how a phone learns it was robbed, and how a heist survives a refresh.
export async function fetchActiveLoots(address: `0x${string}`): Promise<{ asThief: ChainLoot | null; asVictim: ChainLoot | null }> {
  const [thiefId, victimId] = await Promise.all([readVault('activeLootAsThief', [address]), readVault('activeLootAsVictim', [address])]);
  if (thiefId === 0n && victimId === 0n) return { asThief: null, asVictim: null };

  const block = await publicClient.getBlock();
  const clockOffsetMs = Date.now() - Number(block.timestamp) * 1000;
  const read = async (id: bigint): Promise<ChainLoot | null> => {
    if (id === 0n) return null;
    const [thief, victim, amount, bond, , revealAt, deadline] = await readVault('loots', [id]);
    return {
      lootId: Number(id),
      thief,
      victim,
      amount: parseFloat(formatEther(amount)),
      bond: parseFloat(formatEther(bond)),
      revealAt: Number(revealAt) * 1000 + clockOffsetMs,
      deadline: Number(deadline) * 1000 + clockOffsetMs,
    };
  };
  const [asThief, asVictim] = await Promise.all([read(thiefId), read(victimId)]);
  return { asThief, asVictim };
}
