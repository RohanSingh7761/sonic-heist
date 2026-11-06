import React from 'react';
import { Terminal } from 'lucide-react';

export interface GameLogEntry {
  id: string;
  time: string;
  text: string;
  type: 'info' | 'loot' | 'alert' | 'success' | 'warn';
}

interface ActivityLogProps {
  logs: GameLogEntry[];
  onClear: () => void;
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ logs, onClear }) => {
  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-4 font-mono text-xs backdrop-blur">
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-800">
        <span className="flex items-center gap-1.5 text-slate-300 font-bold text-[11px] tracking-wide">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          STEALTH TERMINAL FEED
        </span>
        <button
          onClick={onClear}
          className="text-[10px] text-slate-500 hover:text-slate-300 font-mono"
        >
          CLEAR
        </button>
      </div>

      <div className="h-36 overflow-y-auto space-y-1.5 text-[11px] pr-1">
        {logs.length === 0 ? (
          <span className="text-slate-600 block py-2 text-center">No surveillance events recorded.</span>
        ) : (
          logs.map((log) => {
            let textColor = 'text-slate-400';
            let prefix = '•';

            if (log.type === 'loot') {
              textColor = 'text-amber-400 font-bold';
              prefix = '⚡';
            } else if (log.type === 'alert') {
              textColor = 'text-rose-400 font-bold';
              prefix = '🚨';
            } else if (log.type === 'success') {
              textColor = 'text-emerald-400 font-bold';
              prefix = '✓';
            } else if (log.type === 'warn') {
              textColor = 'text-amber-300';
              prefix = '▲';
            }

            return (
              <div key={log.id} className="flex items-start gap-1.5 leading-relaxed">
                <span className="text-slate-600 select-none">[{log.time}]</span>
                <span className="select-none">{prefix}</span>
                <span className={textColor}>{log.text}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
