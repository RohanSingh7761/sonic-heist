import React, { useEffect, useState } from 'react';
import { AlertOctagon, Target, Zap, ShieldCheck, Skull, Clock } from 'lucide-react';
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
  onCancelHeist,
  onTimeoutLoss,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(60);

  useEffect(() => {
    soundFX.playAlarm();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, deadline - now);
      setSecondsLeft(remaining);

      if (remaining === 0) {
        onTimeoutLoss();
      }
    }, 250);

    return () => clearInterval(interval);
  }, [deadline, onTimeoutLoss]);

  // Closeness bar text & segments
  const getClosenessState = (lvl: number) => {
    if (!isThiefInRange) return { text: 'OUT OF RANGE (>3m)', bars: 0, color: 'text-slate-500' };
    if (lvl > 0.75) return { text: 'VERY CLOSE (<0.5m) - LOCKED ON', bars: 4, color: 'text-emerald-400' };
    if (lvl > 0.5) return { text: 'CLOSE (~1.0m)', bars: 3, color: 'text-emerald-400' };
    if (lvl > 0.25) return { text: 'NEAR (~2.0m)', bars: 2, color: 'text-amber-400' };
    return { text: 'FAR (~3.0m)', bars: 1, color: 'text-rose-400' };
  };

  const closeness = getClosenessState(thiefSignalLevel);

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
          Hunt Window Closes In
        </span>
        <div className="text-6xl font-black font-mono text-rose-400 tracking-tight drop-shadow-[0_0_24px_rgba(244,63,94,0.6)]">
          00:{secondsLeft.toString().padStart(2, '0')}
        </div>
        <p className="text-xs text-rose-200/90 font-mono mt-1">
          Physically find the thief and get within 2 meters to cancel!
        </p>
      </div>

      {/* Target Thief Dossier */}
      <div className="p-3.5 rounded-xl bg-slate-950/90 border border-rose-500/30 mb-5 space-y-2 font-mono text-xs">
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

      {/* Closeness Radar Meter */}
      <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 mb-6">
        <div className="flex justify-between items-center text-xs font-mono mb-2">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-rose-400" />
            Ultrasound Proximity Radar
          </span>
          <span className={`font-bold ${closeness.color}`}>{closeness.text}</span>
        </div>

        {/* 4 Segment Audio Signal Bar */}
        <div className="grid grid-cols-4 gap-1.5 h-3">
          {[1, 2, 3, 4].map((bar) => (
            <div
              key={bar}
              className={`rounded-sm transition-all duration-300 ${
                bar <= closeness.bars
                  ? bar >= 3
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : bar === 2
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
                  : 'bg-slate-800/80'
              }`}
            ></div>
          ))}
        </div>
      </div>

      {/* Action Button: CANCEL HEIST & RECOVER FUNDS */}
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
            : 'GET CLOSER TO THIEF TO CANCEL'}
        </span>
      </button>

      {isThiefInRange && !isCancelling && (
        <p className="text-[11px] text-emerald-400 font-mono text-center mt-2.5 font-bold animate-pulse">
          🎯 IN ULTRASOUND RANGE! TAP CANCEL TO RECOVER LOOT + WIN BOND!
        </p>
      )}
    </div>
  );
};
