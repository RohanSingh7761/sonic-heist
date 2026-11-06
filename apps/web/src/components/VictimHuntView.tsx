import React, { useEffect, useState, useRef } from 'react';
import { AlertOctagon, Target, Zap, Trophy, Radio, XCircle } from 'lucide-react';
import { soundFX } from '../game/soundFX';

interface VictimHuntViewProps {
  lootId: number;
  thiefName: string;
  thiefUid: number;
  lootAmount: number;
  bondAmount: number;
  deadline: number;
  isThiefInRange: boolean;
  thiefSignalLevel: number; // 0 to 1
  isCancelling: boolean;
  isPinging?: boolean;
  onPingThief: () => void;
  onCancelHeist: () => void;
  onTimeoutLoss: () => void;
}

export const VictimHuntView: React.FC<VictimHuntViewProps> = ({
  lootId,
  thiefName,
  thiefUid,
  lootAmount,
  bondAmount,
  deadline,
  isThiefInRange,
  thiefSignalLevel,
  isCancelling,
  isPinging = false,
  onPingThief,
  onCancelHeist,
  onTimeoutLoss,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, deadline - now);
  });

  const onTimeoutLossRef = useRef(onTimeoutLoss);
  useEffect(() => {
    onTimeoutLossRef.current = onTimeoutLoss;
  });

  useEffect(() => {
    soundFX.playAlarm();
  }, []);

  // Stable countdown timer: FREEZES when thief is in range / caught
  useEffect(() => {
    if (isThiefInRange) return; // Stop timer immediately when suspect is in range!

    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, deadline - now);
      setSecondsLeft(remaining);

      if (remaining <= 0) {
        onTimeoutLossRef.current();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline, isThiefInRange]);

  return (
    <div className="rounded-2xl bg-gradient-to-b from-rose-950/60 via-slate-950 to-slate-950 border-2 border-rose-500/60 p-6 backdrop-blur shadow-[0_0_35px_rgba(244,63,94,0.25)] relative overflow-hidden animate-pulse-border">
      {/* Top Emergency Siren Banner */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-rose-500/30">
        <div className="flex items-center gap-2 text-rose-400 font-mono text-xs font-black tracking-wider uppercase">
          <AlertOctagon className="w-5 h-5 text-rose-500 animate-spin" />
          <span>EMERGENCY: YOU ARE BEING ROBBED!</span>
        </div>
        <span className="text-xs font-mono font-bold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/40">
          #{lootId}
        </span>
      </div>

      {/* 60s Countdown Timer */}
      <div className="text-center py-2 mb-4">
        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
          {isThiefInRange ? '🚨 HUNT FROZEN — THIEF CAUGHT!' : 'Hunt Window Closes In'}
        </span>
        <div className={`text-6xl font-black font-mono tracking-tight drop-shadow-[0_0_24px_rgba(244,63,94,0.6)] ${
          isThiefInRange ? 'text-emerald-400 animate-pulse' : 'text-rose-400'
        }`}>
          00:{secondsLeft.toString().padStart(2, '0')}
        </div>
        <p className="text-xs text-rose-200/90 font-mono mt-1">
          {isThiefInRange
            ? '🎯 Suspect intercepted! Tap below to cancel transaction.'
            : 'Tap "PULSE RADAR" to scan for the thief!'}
        </p>
      </div>

      {/* Target Thief Dossier */}
      <div className="p-3.5 rounded-xl bg-slate-950/90 border border-rose-500/30 mb-4 space-y-2 font-mono text-xs">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Suspect Codename:</span>
          <span className="text-rose-400 font-black text-sm">{thiefName}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Stolen Loot at Stake:</span>
          <span className="text-emerald-400 font-bold">{lootAmount.toFixed(4)} ETH</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Thief Bounty Bond:</span>
          <span className="text-amber-400 font-bold">+{bondAmount.toFixed(4)} ETH (Reward)</span>
        </div>
      </div>

      {/* Manual Proximity Pulse Radar Button */}
      <div className="mb-4">
        <button
          onClick={onPingThief}
          disabled={isPinging || isCancelling}
          className={`w-full py-3.5 px-4 rounded-xl font-mono text-xs font-bold border flex items-center justify-center gap-2 transition-all ${
            isPinging
              ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 cursor-wait animate-pulse'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400 shadow-lg shadow-indigo-600/30'
          }`}
        >
          <Radio className={`w-4 h-4 ${isPinging ? 'animate-spin' : 'animate-pulse'}`} />
          <span>{isPinging ? 'EMITTING HUNT SIGNAL...' : '📡 PULSE RADAR TO LOCATE THIEF'}</span>
        </button>
      </div>

      {/* Direct Cancellation / Status Button */}
      <button
        onClick={onCancelHeist}
        disabled={!isThiefInRange || isCancelling}
        className={`w-full py-4 rounded-xl font-mono text-xs font-black tracking-wider flex items-center justify-center gap-2 transition-all shadow-xl ${
          isCancelling
            ? 'bg-amber-600 text-white cursor-wait animate-pulse'
            : isThiefInRange
            ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-500/30 scale-102 animate-bounce'
            : 'bg-slate-800/70 text-slate-500 border border-slate-700/60 cursor-not-allowed'
        }`}
      >
        <Zap className={`w-4 h-4 ${isThiefInRange ? 'animate-pulse' : ''}`} />
        <span>
          {isCancelling
            ? 'EXECUTING ULTRASOUND HANDSHAKE...'
            : isThiefInRange
            ? 'CANCEL HEIST & CLAIM THIEF BOND!'
            : 'PULSE RADAR TO DETECT THIEF'}
        </span>
      </button>

      {/* Big "THIEF CAUGHT!" Modal Popup */}
      {isThiefInRange && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-emerald-500 rounded-3xl p-6 max-w-sm w-full text-center shadow-[0_0_50px_rgba(16,185,129,0.4)] relative">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-4 animate-bounce">
              <Trophy className="w-8 h-8 text-emerald-400" />
            </div>

            <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase">
              Target Intercepted!
            </span>

            <h3 className="text-xl font-black text-white mt-2">THIEF CAUGHT IN RANGE!</h3>
            <p className="text-xs text-slate-300 font-mono mt-1">
              You detected <span className="text-emerald-400 font-bold">{thiefName}</span>! Intercept successful.
            </p>

            <div className="my-4 p-3 bg-slate-950 rounded-xl border border-slate-800 text-left font-mono text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Recover Stolen Loot:</span>
                <span className="text-emerald-400 font-bold">+{lootAmount.toFixed(4)} ETH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Claim Thief Bounty:</span>
                <span className="text-amber-400 font-bold">+{bondAmount.toFixed(4)} ETH</span>
              </div>
              <div className="flex justify-between border-t border-slate-800/80 pt-1 text-[11px]">
                <span className="text-slate-400">Hunt Timer Status:</span>
                <span className="text-emerald-300 font-bold">FROZEN</span>
              </div>
            </div>

            <button
              onClick={onCancelHeist}
              disabled={isCancelling}
              className="w-full py-4 px-4 rounded-xl font-mono text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/40 transition-all flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4 fill-slate-950" />
              <span>{isCancelling ? 'CANCELLING ON-CHAIN...' : 'CANCEL TRANSACTION & RECOVER FUNDS'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
