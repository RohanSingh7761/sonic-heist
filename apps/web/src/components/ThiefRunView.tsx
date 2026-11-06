import React, { useEffect, useState } from 'react';
import { Footprints, AlertTriangle, ShieldX, Trophy, Timer, Volume2 } from 'lucide-react';
import { soundFX } from '../game/soundFX';

interface ThiefRunViewProps {
  lootId: number;
  victimName: string;
  lootAmount: number;
  bondAmount: number;
  startedAt: number;
  revealAt: number;
  deadline: number;
  isCaught: boolean;
  onClaimLoot: () => void;
  onClose: () => void;
}

export const ThiefRunView: React.FC<ThiefRunViewProps> = ({
  lootId,
  victimName,
  lootAmount,
  bondAmount,
  revealAt,
  deadline,
  isCaught,
  onClaimLoot,
  onClose,
}) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [headStartLeft, setHeadStartLeft] = useState(0);

  useEffect(() => {
    soundFX.playHeistStart();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const hs = Math.max(0, revealAt - now);
      const total = Math.max(0, deadline - now);

      setHeadStartLeft(hs);
      setTimeLeft(total);
    }, 250);

    return () => clearInterval(interval);
  }, [revealAt, deadline]);

  return (
    <div className="rounded-2xl bg-gradient-to-b from-amber-950/40 via-slate-950 to-slate-950 border border-amber-500/40 p-6 backdrop-blur shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95">
      {/* Top Banner */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold uppercase tracking-wider">
          <Footprints className="w-4 h-4 animate-bounce" />
          <span>HEIST IN PROGRESS #{lootId}</span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
          Target: {victimName}
        </span>
      </div>

      {isCaught ? (
        /* Caught by Victim Outcome */
        <div className="text-center py-6 space-y-4">
          <div className="w-16 h-16 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center mx-auto shadow-[0_0_24px_rgba(244,63,94,0.4)]">
            <ShieldX className="w-8 h-8 text-rose-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white">YOU WERE CAUGHT!</h3>
            <p className="text-xs text-rose-300 font-mono mt-1">
              Victim reached ultrasound range and cancelled the heist.
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Loot returned to victim · Bond of <span className="text-rose-400 font-bold">{bondAmount.toFixed(4)} ETH</span> forfeited.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs font-bold transition-all"
          >
            DISMISS
          </button>
        </div>
      ) : headStartLeft > 0 ? (
        /* 10-Second Head Start Phase */
        <div className="text-center py-4 space-y-4">
          <div className="inline-block px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-mono font-bold animate-pulse">
            HEAD START: SPRINT AWAY!
          </div>

          <div>
            <div className="text-6xl font-black font-mono text-amber-400 tracking-tight drop-shadow-[0_0_20px_rgba(251,191,36,0.4)]">
              00:{headStartLeft.toString().padStart(2, '0')}
            </div>
            <p className="text-xs text-slate-300 font-mono mt-2">
              Victim will be alerted when this timer reaches 0. Put physical distance between you!
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div>
              <span className="text-slate-500 block">Loot Escrow</span>
              <span className="text-emerald-400 font-bold">{lootAmount.toFixed(4)} ETH</span>
            </div>
            <div>
              <span className="text-slate-500 block">Your Bond</span>
              <span className="text-amber-400 font-bold">{bondAmount.toFixed(4)} ETH</span>
            </div>
          </div>
        </div>
      ) : timeLeft > 0 ? (
        /* 60-Second Hunt Window Phase */
        <div className="text-center py-4 space-y-4">
          <div className="inline-block px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 text-xs font-mono font-bold animate-pulse">
            ⚠️ VICTIM ALERTED & HUNTING YOU!
          </div>

          <div>
            <div className="text-5xl font-black font-mono text-white tracking-tight drop-shadow-[0_0_20px_rgba(244,63,94,0.3)]">
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </div>
            <p className="text-xs text-slate-400 font-mono mt-2">
              Stay out of ultrasound range (3 meters). If victim cannot find you before deadline, you win!
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-amber-500 to-rose-500 h-full transition-all duration-300"
              style={{ width: `${(timeLeft / 60) * 100}%` }}
            ></div>
          </div>
        </div>
      ) : (
        /* Escape Success Phase */
        <div className="text-center py-6 space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mx-auto shadow-[0_0_24px_rgba(16,185,129,0.4)]">
            <Trophy className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white">ESCAPE SUCCESSFUL!</h3>
            <p className="text-xs text-emerald-300 font-mono mt-1">
              Victim failed to find you within 60 seconds.
            </p>
            <p className="text-sm font-black text-emerald-400 mt-2 font-mono">
              +{(lootAmount + bondAmount).toFixed(4)} ETH TO CLAIM
            </p>
          </div>
          <button
            onClick={onClaimLoot}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono text-xs font-bold transition-all shadow-lg shadow-emerald-600/30"
          >
            CLAIM LOOT ON-CHAIN
          </button>
        </div>
      )}
    </div>
  );
};
