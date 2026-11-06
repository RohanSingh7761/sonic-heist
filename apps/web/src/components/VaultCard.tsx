import React, { useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Lock, Unlock, ArrowDownToLine, ArrowUpFromLine, User } from 'lucide-react';

interface VaultCardProps {
  vaultEth: number;
  walletEth: number;
  playerName: string;
  playerAddress: string;
  playerUid: number;
  isPatrolActive: boolean;
  isShielded: boolean;
  immunitySeconds: number;
  cooldownSeconds: number;
  onTogglePatrol: () => void;
  onToggleShield: () => void;
  onDeposit: (amount: number) => void;
  onWithdraw: (amount: number) => void;
}

export const VaultCard: React.FC<VaultCardProps> = ({
  vaultEth,
  walletEth,
  playerName,
  playerAddress,
  playerUid,
  isPatrolActive,
  isShielded,
  immunitySeconds,
  cooldownSeconds,
  onTogglePatrol,
  onToggleShield,
  onDeposit,
  onWithdraw,
}) => {
  const [depositAmount, setDepositAmount] = useState('0.1');

  return (
    <div className="rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800 p-5 backdrop-blur shadow-xl relative overflow-hidden">
      {/* Background Cyber Accents */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>

      {/* Top Header: Player Identity & Role Status */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-xs font-mono font-semibold text-emerald-400 tracking-wider uppercase">
              Agent Alias
            </span>
          </div>
          <h2 className="text-lg font-black text-white tracking-wide mt-0.5">{playerName}</h2>
          <p className="text-[11px] font-mono text-slate-400">
            UID: <span className="text-amber-300 font-bold">0x{playerUid.toString(16).toUpperCase()}</span> ·{' '}
            {playerAddress.slice(0, 6)}...{playerAddress.slice(-4)}
          </p>
        </div>

        {/* Status Pill */}
        <div className="flex flex-col items-end gap-1.5">
          {immunitySeconds > 0 ? (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
              IMMUNITY: {immunitySeconds}s
            </span>
          ) : isShielded ? (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
              SHIELDED
            </span>
          ) : isPatrolActive ? (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              PATROL ACTIVE
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700">
              IDLE
            </span>
          )}

          {cooldownSeconds > 0 && (
            <span className="text-[10px] font-mono text-indigo-400 font-medium">
              Thief Cooldown: {cooldownSeconds}s
            </span>
          )}
        </div>
      </div>

      {/* Vault Balance Display */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 relative">
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1 font-mono">
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-400" />
              Vault Stake
            </span>
            <span className="text-[10px] text-rose-400 font-bold">5%-25% at risk</span>
          </div>
          <div className="text-xl font-black font-mono text-emerald-400 tracking-tight">
            {vaultEth.toFixed(4)} <span className="text-xs font-normal text-emerald-500">ETH</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1 font-mono">
            <span>Gas Wallet</span>
            <span className="text-[10px] text-slate-500">Safe</span>
          </div>
          <div className="text-xl font-black font-mono text-slate-200 tracking-tight">
            {walletEth.toFixed(4)} <span className="text-xs font-normal text-slate-400">ETH</span>
          </div>
        </div>
      </div>

      {/* Patrol & Shield Controls */}
      <div className="flex gap-2">
        <button
          onClick={onTogglePatrol}
          className={`flex-1 py-2.5 px-3 rounded-xl font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            isPatrolActive
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
              : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
          }`}
        >
          {isPatrolActive ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          <span>{isPatrolActive ? 'STOP PATROL' : 'START PATROL'}</span>
        </button>

        <button
          onClick={onToggleShield}
          className={`px-3 py-2.5 rounded-xl font-mono text-xs font-semibold border transition-all ${
            isShielded
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
          }`}
          title="Shield Mode stops your phone from answering ultrasound pings and signing loot tickets"
        >
          <Shield className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
