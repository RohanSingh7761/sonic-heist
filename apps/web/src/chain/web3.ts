import { createPublicClient, createWalletClient, http, formatEther, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { CONFIG, HEIST_VAULT_ABI } from '../config';

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
  try {
    const [balanceWei, vaultWei] = await Promise.all([
      publicClient.getBalance({ address }),
      publicClient.readContract({
        address: CONFIG.heistVaultAddress,
        abi: HEIST_VAULT_ABI,
        functionName: 'vault',
        args: [address],
      }) as Promise<bigint>,
    ]);

    return {
      walletEth: parseFloat(formatEther(balanceWei)),
      stakeEth: parseFloat(formatEther(vaultWei)),
    };
  } catch (err) {
    console.warn('Failed to fetch on-chain balances from Base Sepolia:', err);
    return null;
  }
}

// Execute on-chain deposit to HeistVault
export async function depositToVault(privateKey: `0x${string}`, amountEth: number) {
  const { client, account } = getWalletClient(privateKey);
  const valueWei = parseEther(amountEth.toFixed(6));

  const hash = await client.writeContract({
    address: CONFIG.heistVaultAddress,
    abi: HEIST_VAULT_ABI,
    functionName: 'deposit',
    value: valueWei,
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

// Execute on-chain withdraw from HeistVault
export async function withdrawFromVault(privateKey: `0x${string}`, amountEth: number) {
  const { client, account } = getWalletClient(privateKey);
  const valueWei = parseEther(amountEth.toFixed(6));

  const hash = await client.writeContract({
    address: CONFIG.heistVaultAddress,
    abi: HEIST_VAULT_ABI,
    functionName: 'withdraw',
    args: [valueWei],
    account,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}
