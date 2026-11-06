import React from 'react';
import { Target } from 'lucide-react';
import { getPlayerName } from '../protocol/signatures';

export interface NearbyPlayer {
  uid: number;
  name: string;
  signalLevel: number; // 0 to 1
  lastSeen: number;
  isThief?: boolean;
}

interface RadarSweepProps {
  isScanning: boolean;
  players: NearbyPlayer[];
  selectedUid?: number;
  onSelectPlayer?: (player: NearbyPlayer) => void;
  targetThiefUid?: number;
}

export const RadarSweep: React.FC<RadarSweepProps> = ({
  isScanning,
  players,
  selectedUid,
  onSelectPlayer,
  targetThiefUid,
}) => {
  return (
    <div className="relative w-full aspect-square max-w-[340px] mx-auto flex items-center justify-center select-none">
      {/* Outer Glow & Border */}
      <div className="absolute inset-0 rounded-full border border-emerald-500/30 bg-slate-950/90 shadow-[0_0_30px_rgba(16,185,129,0.12)]"></div>

      {/* Concentric Range Rings */}
      <div className="absolute inset-8 rounded-full border border-emerald-500/20"></div>
      <div className="absolute inset-16 rounded-full border border-emerald-500/20 border-dashed"></div>
      <div className="absolute inset-24 rounded-full border border-emerald-500/15"></div>

      {/* Crosshairs */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-emerald-500/25"></div>
      <div className="absolute inset-y-0 left-1/2 w-px bg-emerald-500/25"></div>

      {/* Distance Labels */}
      <span className="absolute top-2 text-[9px] font-mono text-emerald-500/60 font-semibold tracking-wider">3.0m</span>
      <span className="absolute top-10 text-[9px] font-mono text-emerald-500/50 font-semibold tracking-wider">2.0m</span>
      <span className="absolute top-18 text-[9px] font-mono text-emerald-500/40 font-semibold tracking-wider">1.0m</span>

      {/* Center Beacon (You) */}
      <div className="relative z-10 w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center shadow-[0_0_12px_#34d399]">
        <div className="w-1.5 h-1.5 rounded-full bg-slate-950"></div>
        {isScanning && (
          <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75"></div>
        )}
      </div>

      {/* Rotating Sonar Beam */}
      {isScanning && (
        <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
          <div
            className="w-full h-full origin-center animate-[spin_3s_linear_infinite]"
            style={{
              background: 'conic-gradient(from 0deg, rgba(16,185,129,0.28) 0deg, rgba(16,185,129,0.05) 50deg, transparent 70deg)',
            }}
          ></div>
        </div>
      )}

      {/* Detected Player Blips */}
      {players.map((p, idx) => {
        const isThief = targetThiefUid === p.uid || p.isThief;
        const isSelected = selectedUid === p.uid;

        // Position blip based on index (angle) and signal level (radius)
        const angle = (idx * (360 / Math.max(1, players.length)) + 45) * (Math.PI / 180);
        // Higher signal = closer to center (smaller radius)
        const distanceFactor = Math.max(0.18, 0.88 - (p.signalLevel || 0.4) * 0.65);
        const maxRadius = 145; // pixels from center
        const r = maxRadius * distanceFactor;

        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;

        return (
          <div
            key={p.uid}
            onClick={() => onSelectPlayer && onSelectPlayer(p)}
            style={{
              transform: `translate(${x}px, ${y}px)`,
            }}
            className={`absolute z-20 cursor-pointer group flex flex-col items-center transition-all duration-500`}
          >
            {/* Blip Circle */}
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform group-hover:scale-125 ${
                isThief
                  ? 'bg-rose-500 shadow-[0_0_16px_#f43f5e] animate-bounce'
                  : isSelected
                  ? 'bg-amber-400 shadow-[0_0_14px_#fbbf24] scale-110'
                  : 'bg-emerald-400 shadow-[0_0_10px_#34d399]'
              }`}
            >
              <Target className="w-3 h-3 text-slate-950" />
            </div>

            {/* Label Badge */}
            <div
              className={`mt-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight whitespace-nowrap border ${
                isThief
                  ? 'bg-rose-950/90 text-rose-300 border-rose-500/50 animate-pulse'
                  : isSelected
                  ? 'bg-amber-950/90 text-amber-300 border-amber-500/50'
                  : 'bg-slate-900/90 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {isThief ? '⚠️ THIEF' : p.name.split(' ')[0]}
            </div>
          </div>
        );
      })}
    </div>
  );
};
