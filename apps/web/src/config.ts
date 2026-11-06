// Sonic Heist Base Sepolia Configuration

export const CONFIG = {
  chainId: 84532,
  chainName: 'Base Sepolia',
  rpcUrl: 'https://base-sepolia.g.alchemy.com/v2/alch_bH1hVFNxdA8htgBUYZCpf',
  heistVaultAddress: '0xd21904c952F6a9ac4Db73a3d3F08675ACec7eAb7' as `0x${string}`,
  blockExplorer: 'https://base-sepolia.blockscout.com/address/0xd21904c952F6a9ac4Db73a3d3F08675ACec7eAb7',
};

export const HEIST_VAULT_ABI = [
  {
    type: 'function',
    name: 'gameActive',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'setGameActive',
    inputs: [{ name: 'active', type: 'bool' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'vault',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'deposit',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'startLoot',
    inputs: [
      { name: 'nonce', type: 'uint64' },
      { name: 'validBefore', type: 'uint32' },
      { name: 'sig', type: 'bytes' },
    ],
    outputs: [{ name: 'lootId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'cancel',
    inputs: [
      { name: 'lootId', type: 'uint256' },
      { name: 'challenge', type: 'bytes8' },
      { name: 'thiefSig', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'claim',
    inputs: [{ name: 'lootId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'immuneUntil',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'thiefReadyAt',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'LootStarted',
    inputs: [
      { name: 'lootId', type: 'uint256', indexed: true },
      { name: 'thief', type: 'address', indexed: true },
      { name: 'victim', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'bond', type: 'uint256', indexed: false },
      { name: 'revealAt', type: 'uint256', indexed: false },
      { name: 'deadline', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LootCancelled',
    inputs: [
      { name: 'lootId', type: 'uint256', indexed: true },
      { name: 'victim', type: 'address', indexed: true },
      { name: 'thief', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'LootClaimed',
    inputs: [
      { name: 'lootId', type: 'uint256', indexed: true },
      { name: 'thief', type: 'address', indexed: true },
      { name: 'victim', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;
