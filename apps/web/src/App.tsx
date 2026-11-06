import React, { useState, useEffect, useRef } from 'react';
import {
  Skull,
  Shield,
  Radio,
  Zap,
  Target,
  Wifi,
  WifiOff,
  Volume2,
  RefreshCw,
  Award,
  AlertTriangle
} from 'lucide-react';
import { modem } from './audio/ggwaveModem';
import {
  MessageType,
  PingMessage,
  PongMessage,
  LootReqMessage,
  TicketMessage,
  CatchMessage,
  CaughtMessage,
} from './protocol/types';
import {
  decodeHeistMessage,
  encodePing,
  encodePong,
  encodeLootReq,
  encodeTicket,
  encodeCatch,
  encodeCaught,
} from './protocol/codecs';
import {
  getPlayerName,
  bytesToHex,
  hexToBytes,
  toCompactSignature,
  splitCompactSignature,
} from './protocol/signatures';
import { RadarSweep, NearbyPlayer } from './components/RadarSweep';
import { VaultCard } from './components/VaultCard';
import { ThiefRunView } from './components/ThiefRunView';
import { VictimHuntView } from './components/VictimHuntView';
import { ActivityLog, GameLogEntry } from './components/ActivityLog';
import { soundFX } from './game/soundFX';
import { CONFIG } from './config';

// Simple deterministic burner account generation for demo
function getOrCreateBurner() {
  let addr = localStorage.getItem('sonic_heist_addr');
  let uid = localStorage.getItem('sonic_heist_uid');
  if (!addr || !uid) {
    const randomHex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    addr = `0x${randomHex}`;
    const cleanUid = Math.floor(Math.random() * 0xffffffff) >>> 0;
    localStorage.setItem('sonic_heist_addr', addr);
    localStorage.setItem('sonic_heist_uid', cleanUid.toString());
    uid = cleanUid.toString();
  }
  return { address: addr as `0x${string}`, uid: parseInt(uid) };
}

export default function App() {
  const [burner, setBurner] = useState(getOrCreateBurner());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isPatrolActive, setIsPatrolActive] = useState(false);
  const [isShielded, setIsShielded] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  // Vault balances
  const [vaultEth, setVaultEth] = useState(1.5);
  const [walletEth, setWalletEth] = useState(0.045);
  const [immunitySeconds, setImmunitySeconds] = useState(0);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Radar & Nearby Players
  const [nearbyPlayers, setNearbyPlayers] = useState<NearbyPlayer[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<NearbyPlayer | null>(null);

  // Active Heist States
  const [activeHeistAsThief, setActiveHeistAsThief] = useState<{
    lootId: number;
    victimName: string;
    victimUid: number;
    lootAmount: number;
    bondAmount: number;
    startedAt: number;
    revealAt: number;
    deadline: number;
    isCaught: boolean;
  } | null>(null);

  const [activeHeistAsVictim, setActiveHeistAsVictim] = useState<{
    lootId: number;
    thiefName: string;
    thiefUid: number;
    lootAmount: number;
    bondAmount: number;
    deadline: number;
    isThiefInRange: boolean;
    thiefSignalLevel: number;
    isCancelling: boolean;
  } | null>(null);

  // Protocol & Audio Settings
  const [audioProtocol, setAudioProtocol] = useState<number>(1); // Default: Audible Fast (3.6 kHz, guaranteed reliable)
  const [volume, setVolume] = useState<number>(75);
  const [logs, setLogs] = useState<GameLogEntry[]>([]);

  // Persistent live refs to eliminate React stale closure bugs inside Web Audio callbacks & timers
  const isPatrolActiveRef = useRef(isPatrolActive);
  const isShieldedRef = useRef(isShielded);
  const burnerRef = useRef(burner);
  const vaultEthRef = useRef(vaultEth);
  const audioProtocolRef = useRef(audioProtocol);
  const volumeRef = useRef(volume);
  const immunitySecondsRef = useRef(immunitySeconds);
  const activeHeistAsVictimRef = useRef(activeHeistAsVictim);
  const activeHeistAsThiefRef = useRef(activeHeistAsThief);
  const selectedTargetRef = useRef(selectedTarget);
  const nearbyPlayersRef = useRef(nearbyPlayers);

  useEffect(() => {
    isPatrolActiveRef.current = isPatrolActive;
    isShieldedRef.current = isShielded;
    burnerRef.current = burner;
    vaultEthRef.current = vaultEth;
    audioProtocolRef.current = audioProtocol;
    volumeRef.current = volume;
    immunitySecondsRef.current = immunitySeconds;
    activeHeistAsVictimRef.current = activeHeistAsVictim;
    activeHeistAsThiefRef.current = activeHeistAsThief;
    selectedTargetRef.current = selectedTarget;
    nearbyPlayersRef.current = nearbyPlayers;
  });

  const addLog = (text: string, type: GameLogEntry['type'] = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ id: Math.random().toString(), time, text, type }, ...prev.slice(0, 49)]);
  };

  // Online / Offline monitor
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setImmunitySeconds((prev) => Math.max(0, prev - 1));
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load ggwave library on mount
  useEffect(() => {
    modem.loadLibrary().then(() => {
      addLog(`Sonic Heist acoustic engine ready (Audible 3.6 kHz & Ultrasound 16.2 kHz enabled).`, 'info');
    }).catch((err) => {
      addLog(`Audio init failed: ${err.message}`, 'warn');
    });

    return () => {
      modem.stopListening();
    };
  }, []);

  // Handle Incoming Decoded Sound Messages (The Dumb Pipe Handler)
  const handleIncomingAudio = (bytes: Uint8Array) => {
    addLog(`🔊 Audio frame detected (${bytes.length} bytes)`, 'info');

    // Test tone detection
    if (bytes.length === 5 && bytes[0] === 0x53 && bytes[1] === 0x4f && bytes[2] === 0x4e) {
      soundFX.playRadarPing();
      addLog('🎉 Acoustic test tone received & decoded successfully!', 'success');
      return;
    }

    const msg = decodeHeistMessage(bytes);
    if (!msg) {
      addLog(`Unrecognized audio packet format (${bytes.length} bytes).`, 'warn');
      return;
    }

    const currentBurner = burnerRef.current;
    const isPatrol = isPatrolActiveRef.current;
    const isShield = isShieldedRef.current;
    const proto = audioProtocolRef.current;
    const vol = volumeRef.current;

    switch (msg.type) {
      // 1. PING received
      case MessageType.PING: {
        const m = msg as PingMessage;
        if (!isPatrol) {
          addLog(`Ignored PING: Patrol mode is OFF on this device.`, 'warn');
          return;
        }
        if (isShield) {
          addLog(`Ignored PING: Phone is currently SHIELDED.`, 'warn');
          return;
        }

        // Check if targeted ping or broadcast (targetUid === 0 means broadcast to all)
        if (m.targetUid === 0 || m.targetUid === currentBurner.uid) {
          addLog(`📡 Heard PING from 0x${m.scannerUid.toString(16)}. Answering with PONG...`, 'loot');
          soundFX.playRadarPing();

          // Reply with PONG after brief delay
          setTimeout(() => {
            const pong = encodePong({
              responderUid: currentBurner.uid,
              echoNonce: m.nonce,
            });
            modem.transmit(pong, proto, vol);
            addLog(`Sent PONG reply (UID: 0x${currentBurner.uid.toString(16)}).`, 'info');
          }, 350);
        }
        break;
      }

      // 2. PONG received
      case MessageType.PONG: {
        const m = msg as PongMessage;
        soundFX.playRadarPing();
        const pName = getPlayerName(m.responderUid);
        addLog(`🎯 Discovered nearby player: "${pName}" (UID: 0x${m.responderUid.toString(16)})`, 'success');

        setNearbyPlayers((prev) => {
          const exists = prev.find((p) => p.uid === m.responderUid);
          const sig = Math.random() * 0.4 + 0.5; // Estimated proximity level
          const next = exists
            ? prev.map((p) => (p.uid === m.responderUid ? { ...p, signalLevel: sig, lastSeen: Date.now() } : p))
            : [...prev, { uid: m.responderUid, name: pName, signalLevel: sig, lastSeen: Date.now() }];
          nearbyPlayersRef.current = next;
          return next;
        });

        // If currently hunting this thief, update victim closeness!
        if (activeHeistAsVictimRef.current && activeHeistAsVictimRef.current.thiefUid === m.responderUid) {
          setActiveHeistAsVictim((prev) => prev ? ({ ...prev, isThiefInRange: true, thiefSignalLevel: 0.85 }) : null);
        }
        break;
      }

      // 3. LOOT_REQ received (Victim targeted)
      case MessageType.LOOT_REQ: {
        const m = msg as LootReqMessage;
        if (!isPatrol) {
          addLog(`Ignored LOOT_REQ: Patrol is OFF.`, 'warn');
          return;
        }
        if (isShield) {
          addLog(`Ignored LOOT_REQ: Shielded.`, 'warn');
          return;
        }
        if (m.victimUid !== currentBurner.uid) return;
        if (immunitySecondsRef.current > 0) {
          addLog(`Rejected LOOT_REQ: currently immune.`, 'warn');
          return;
        }

        addLog(`Targeted by thief ${m.thiefAddress.slice(0, 8)}... Auto-signing consent ticket.`, 'loot');

        // Auto-sign mock ticket
        const ticketNonce = BigInt(Math.floor(Math.random() * 100000) + 1);
        const validBefore = Math.floor(Date.now() / 1000) + 90;
        const dummyCompactSig = new Uint8Array(64).fill(0x55);

        const ticketBytes = encodeTicket({
          thiefUid: parseInt(m.thiefAddress.slice(2, 10), 16),
          nonce: ticketNonce,
          validBefore,
          signature: dummyCompactSig,
        });

        // Transmit ticket back over ultrasound
        modem.transmit(ticketBytes, proto, vol);

        // Schedule victim notification for 10 seconds later (end of head start)
        const lootAmountEst = vaultEthRef.current * 0.15;
        const bondEst = lootAmountEst * 0.2;
        const now = Math.floor(Date.now() / 1000);

        setTimeout(() => {
          soundFX.playAlarm();
          setActiveHeistAsVictim({
            lootId: Math.floor(Math.random() * 900) + 100,
            thiefName: getPlayerName(parseInt(m.thiefAddress.slice(2, 10), 16)),
            thiefUid: parseInt(m.thiefAddress.slice(2, 10), 16),
            lootAmount: lootAmountEst,
            bondAmount: bondEst,
            deadline: now + 10 + 60,
            isThiefInRange: false,
            thiefSignalLevel: 0.2,
            isCancelling: false,
          });
          setVaultEth((prev) => Math.max(0, prev - lootAmountEst));
          addLog(`🚨 HEAD START ENDED! You were heisted for ${lootAmountEst.toFixed(4)} ETH!`, 'alert');
        }, 10000);
        break;
      }

      // 4. TICKET received (Thief side)
      case MessageType.TICKET: {
        const m = msg as TicketMessage;
        if (m.thiefUid !== currentBurner.uid) return;
        addLog(`Received valid consent ticket from victim! Escrowing loot & starting 10s head start...`, 'loot');

        // Enter Thief Run mode
        const loot = vaultEthRef.current * 0.18;
        const bond = loot * 0.2;
        const now = Math.floor(Date.now() / 1000);

        setActiveHeistAsThief({
          lootId: Math.floor(Math.random() * 900) + 100,
          victimName: selectedTargetRef.current ? selectedTargetRef.current.name : 'Unknown Victim',
          victimUid: selectedTargetRef.current ? selectedTargetRef.current.uid : 0,
          lootAmount: loot,
          bondAmount: bond,
          startedAt: now,
          revealAt: now + 10,
          deadline: now + 10 + 60,
          isCaught: false,
        });

        setVaultEth((prev) => Math.max(0, prev - bond));
        break;
      }

      // 5. CATCH received (Thief side caught by hunting victim)
      case MessageType.CATCH: {
        const m = msg as CatchMessage;
        if (!activeHeistAsThiefRef.current) return;
        addLog(`Victim physically reached range and sent CATCH! Auto-signing CAUGHT...`, 'alert');
        soundFX.playAlarm();

        // Echo CAUGHT signature over ultrasound
        const caughtBytes = encodeCaught({
          lootId: m.lootId,
          challenge: m.challenge,
          signature: new Uint8Array(64).fill(0x77),
        });

        modem.transmit(caughtBytes, proto, vol);
        setActiveHeistAsThief((prev) => prev ? ({ ...prev, isCaught: true }) : null);
        break;
      }

      // 6. CAUGHT received (Victim side)
      case MessageType.CAUGHT: {
        if (!activeHeistAsVictimRef.current) return;
        soundFX.playCatchLock();
        addLog(`Thief CAUGHT handshake verified! Recovering loot + winning bond!`, 'success');

        const reward = activeHeistAsVictimRef.current.lootAmount + activeHeistAsVictimRef.current.bondAmount;
        setVaultEth((prev) => prev + reward);
        setImmunitySeconds(300); // 5 min immunity
        setActiveHeistAsVictim(null);
        break;
      }
    }
  };

  // Toggle Continuous Patrol Service
  const togglePatrol = async () => {
    if (isPatrolActiveRef.current) {
      modem.stopListening();
      setIsPatrolActive(false);
      isPatrolActiveRef.current = false;
      addLog('Patrol deactivated. Microphone listening off.', 'info');
    } else {
      try {
        await modem.startListening(
          (bytes) => handleIncomingAudio(bytes),
          (lvl) => setMicLevel(lvl)
        );
        setIsPatrolActive(true);
        isPatrolActiveRef.current = true;
        addLog(`Patrol active. Microphone listening for acoustic pings...`, 'success');
      } catch (err: any) {
        addLog(`Microphone error: ${err.message}`, 'warn');
      }
    }
  };

  // Broadcast Room Scan
  const handleScanRoom = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setSelectedTarget(null);
    addLog('Emitting acoustic PING (broadcast)...', 'info');

    // Ensure audio context & microphone are active
    if (!isPatrolActiveRef.current) {
      await togglePatrol();
    }

    const currentBurner = burnerRef.current;
    const proto = audioProtocolRef.current;
    const vol = volumeRef.current;

    const ping = encodePing({
      scannerUid: currentBurner.uid,
      nonce: Math.floor(Math.random() * 0xffff),
      targetUid: 0, // Everyone
    });

    try {
      await modem.transmit(ping, proto, vol);
      addLog('Ping broadcast transmitted. Listening for player replies...', 'info');
    } catch (err: any) {
      addLog(`Scan transmit error: ${err.message}`, 'warn');
    }

    setTimeout(() => {
      setIsScanning(false);
      const count = nearbyPlayersRef.current.length;
      addLog(`Scan complete. ${count} agents in range.`, count > 0 ? 'success' : 'info');
    }, 4500);
  };

  // Send Test Chirp / Ping
  const handleTestChirp = async () => {
    const proto = audioProtocolRef.current;
    const vol = volumeRef.current;
    addLog(`Transmitting acoustic test signal (${proto === 1 ? '3.6 kHz Audible' : '16.2 kHz Ultrasound'})...`, 'info');
    try {
      const testPayload = new Uint8Array([0x53, 0x4f, 0x4e, 0x49, 0x43]); // 'SONIC'
      await modem.transmit(testPayload, proto, vol);
      addLog('Test signal sent. Look for confirmation on nearby patrol devices.', 'success');
    } catch (err: any) {
      addLog(`Test signal error: ${err.message}`, 'warn');
    }
  };

  // Initiate Heist against selected target
  const handleInitiateHeist = async () => {
    if (!selectedTarget) return;
    if (cooldownSeconds > 0) {
      addLog(`Cannot loot: cooldown active for ${cooldownSeconds}s.`, 'warn');
      return;
    }
    if (vaultEth < 0.05) {
      addLog(`Vault stake too low to post bond! Deposit ETH first.`, 'warn');
      return;
    }

    addLog(`Initiating ultrasound heist against "${selectedTarget.name}"...`, 'loot');
    const req = encodeLootReq({
      thiefAddress: burner.address,
      victimUid: selectedTarget.uid,
    });

    await modem.transmit(req, audioProtocol, volume);
    addLog(`LOOT_REQ transmitted. Awaiting consent ticket from target phone...`, 'info');
  };

  // Victim Cancel Action
  const handleVictimCancel = async () => {
    if (!activeHeistAsVictim) return;
    setActiveHeistAsVictim((prev) => prev ? ({ ...prev, isCancelling: true }) : null);
    addLog('Transmitting CATCH challenge to thief over ultrasound...', 'loot');

    const catchMsg = encodeCatch({
      lootId: activeHeistAsVictim.lootId,
      challenge: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      signature: new Uint8Array(64).fill(0x33),
    });

    await modem.transmit(catchMsg, audioProtocol, volume);
  };

  // Thief Claim Action
  const handleThiefClaim = () => {
    if (!activeHeistAsThief) return;
    const payout = activeHeistAsThief.lootAmount + activeHeistAsThief.bondAmount;
    setVaultEth((prev) => prev + payout);
    setCooldownSeconds(120); // 2 min thief cooldown
    addLog(`CLAIMED! +${payout.toFixed(4)} ETH credited to your vault!`, 'success');
    setActiveHeistAsThief(null);
  };

  // Quick Simulation Helper (For 1-device demonstration)
  const handleQuickSimulate = () => {
    addLog('Simulating incoming heist on this device...', 'alert');
    const dummyLoot = 0.25;
    const dummyBond = 0.05;
    const now = Math.floor(Date.now() / 1000);

    setActiveHeistAsVictim({
      lootId: 404,
      thiefName: 'Shadow Lynx 7A1F',
      thiefUid: 0x7a1f,
      lootAmount: dummyLoot,
      bondAmount: dummyBond,
      deadline: now + 60,
      isThiefInRange: true,
      thiefSignalLevel: 0.9,
      isCancelling: false,
    });
    setVaultEth((prev) => Math.max(0, prev - dummyLoot));
  };

  return (
    <div className="max-w-md mx-auto min-h-screen px-4 py-6 flex flex-col justify-between">
      <div>
        {/* Header Bar */}
        <header className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Skull className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-black text-white tracking-wider flex items-center gap-1.5 font-mono">
                SONIC HEIST
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  L2
                </span>
              </h1>
              <p className="text-[10px] font-mono text-slate-400">Ultrasound Real-World Thief Game</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={CONFIG.blockExplorer}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-mono text-emerald-400 hover:text-emerald-300 underline flex items-center gap-1"
              title="View verified contract on Blockscout"
            >
              0xd219...eAb7
            </a>
            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border ${
                isOnline
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isOnline ? 'Base Sepolia' : 'No Signal'}</span>
            </div>
          </div>
        </header>

        {/* Dynamic Overlays: Thief Running View or Victim Hunting View */}
        {activeHeistAsVictim ? (
          <div className="mb-6">
            <VictimHuntView
              lootId={activeHeistAsVictim.lootId}
              thiefName={activeHeistAsVictim.thiefName}
              thiefUid={activeHeistAsVictim.thiefUid}
              lootAmount={activeHeistAsVictim.lootAmount}
              bondAmount={activeHeistAsVictim.bondAmount}
              deadline={activeHeistAsVictim.deadline}
              isThiefInRange={activeHeistAsVictim.isThiefInRange}
              thiefSignalLevel={activeHeistAsVictim.thiefSignalLevel}
              isCancelling={activeHeistAsVictim.isCancelling}
              onCancelHeist={handleVictimCancel}
              onTimeoutLoss={() => {
                addLog('HUNT WINDOW EXPIRED! Loot lost to thief.', 'alert');
                setActiveHeistAsVictim(null);
              }}
            />
          </div>
        ) : activeHeistAsThief ? (
          <div className="mb-6">
            <ThiefRunView
              lootId={activeHeistAsThief.lootId}
              victimName={activeHeistAsThief.victimName}
              lootAmount={activeHeistAsThief.lootAmount}
              bondAmount={activeHeistAsThief.bondAmount}
              startedAt={activeHeistAsThief.startedAt}
              revealAt={activeHeistAsThief.revealAt}
              deadline={activeHeistAsThief.deadline}
              isCaught={activeHeistAsThief.isCaught}
              onClaimLoot={handleThiefClaim}
              onClose={() => setActiveHeistAsThief(null)}
            />
          </div>
        ) : (
          /* Normal Vault & Radar View */
          <div className="space-y-5">
            {/* Player Vault Card */}
            <VaultCard
              vaultEth={vaultEth}
              walletEth={walletEth}
              playerName={getPlayerName(burner.uid)}
              playerAddress={burner.address}
              playerUid={burner.uid}
              isPatrolActive={isPatrolActive}
              isShielded={isShielded}
              immunitySeconds={immunitySeconds}
              cooldownSeconds={cooldownSeconds}
              micLevel={micLevel}
              onTogglePatrol={togglePatrol}
              onToggleShield={() => {
                setIsShielded(!isShielded);
                addLog(`Shield mode ${!isShielded ? 'ENABLED' : 'DISABLED'}.`, 'info');
              }}
              onDeposit={(amt) => setVaultEth((v) => v + amt)}
              onWithdraw={(amt) => setVaultEth((v) => Math.max(0, v - amt))}
            />

            {/* Radar Sweep Display */}
            <div className="py-2">
              <RadarSweep
                isScanning={isScanning}
                players={nearbyPlayers}
                selectedUid={selectedTarget?.uid}
                onSelectPlayer={(p) => {
                  setSelectedTarget(p);
                  addLog(`Locked target: ${p.name}`, 'info');
                }}
              />
            </div>

            {/* Radar Actions: Scan Room & Target Selection */}
            <div className="space-y-3">
              <button
                onClick={handleScanRoom}
                disabled={isScanning}
                className={`w-full py-3.5 rounded-xl font-mono text-xs font-black tracking-wider flex items-center justify-center gap-2 transition-all ${
                  isScanning
                    ? 'bg-emerald-600/50 text-emerald-200 cursor-wait animate-pulse'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/25'
                }`}
              >
                <Radio className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'PULSING ULTRASOUND SCAN (16.2 kHz)...' : 'SCAN ROOM FOR TARGETS'}</span>
              </button>

              {/* Selected Target Action Card */}
              {selectedTarget && (
                <div className="p-4 rounded-xl bg-slate-900 border border-amber-500/40 space-y-3 animate-in fade-in">
                  <div className="flex justify-between items-center text-xs font-mono">
                    <div>
                      <span className="text-slate-400 block text-[10px]">LOCKED VICTIM:</span>
                      <span className="text-amber-300 font-bold text-sm">{selectedTarget.name}</span>
                    </div>
                    <span className="text-emerald-400 font-bold">~1.2m away</span>
                  </div>

                  <button
                    onClick={handleInitiateHeist}
                    className="w-full py-3 rounded-lg bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-mono text-xs font-black tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-600/30"
                  >
                    <Zap className="w-4 h-4" />
                    <span>STEAL FROM VAULT (5%-25%)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Acoustic Protocol Selector & Acoustic Test Signal */}
        <div className="mt-5 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-2.5 text-xs font-mono">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              Frequency Mode:
            </span>
            <select
              value={audioProtocol}
              onChange={(e) => {
                const val = Number(e.target.value);
                setAudioProtocol(val);
                addLog(`Switched frequency mode to ${val === 1 ? '3.6 kHz Audible Fast' : val === 4 ? '16.2 kHz Ultrasound' : '17.5 kHz Ultrasound'}`, 'info');
              }}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-[11px] text-emerald-300 focus:outline-none"
            >
              <option value={1}>Audible Fast (3.6 kHz, Recommended)</option>
              <option value={4}>Ultrasound Fast (16.2 kHz, Inaudible)</option>
              <option value={5}>Ultrasound Fastest (17.5 kHz)</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
            <span className="text-[11px] text-slate-500">
              Transmit Vol: <span className="text-slate-300 font-bold">{volume}%</span>
            </span>
            <button
              onClick={handleTestChirp}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-emerald-400 border border-slate-700 flex items-center gap-1 transition-all"
              title="Emit a test chirp over audio to verify that the other phone/laptop microphone hears it"
            >
              <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span>TEST AUDIO CHIRP</span>
            </button>
          </div>
        </div>

        {/* Surveillance Feed */}
        <div className="mt-4">
          <ActivityLog logs={logs} onClear={() => setLogs([])} />
        </div>
      </div>

      {/* Footer / Demo Simulator Controls */}
      <footer className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-500">
        <span>Sonic Heist v1.0</span>
        <button
          onClick={handleQuickSimulate}
          className="text-amber-400/80 hover:text-amber-300 underline"
        >
          [Simulate Alert on Me]
        </button>
      </footer>
    </div>
  );
}
