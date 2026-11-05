import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  Mic,
  MicOff,
  Radio,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Wifi,
  WifiOff,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Send
} from 'lucide-react';
import { modem, GgwaveProtocol } from './audio/ggwaveModem';
import {
  createMockPayment,
  packPayment,
  unpackPayment,
  packAck,
  unpackAck,
  PaymentData,
  AckData,
  STATUS_NAMES,
  bytesToHex,
} from './audio/mockPayload';

export default function App() {
  const [activeTab, setActiveTab] = useState<'transmitter' | 'receiver' | 'loopback'>('transmitter');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isTransmitting, setIsTransmitting] = useState<boolean>(false);
  const [protocols, setProtocols] = useState<GgwaveProtocol[]>([]);
  const [selectedProtocol, setSelectedProtocol] = useState<number>(1);
  const [volume, setVolume] = useState<number>(30);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [txDuration, setTxDuration] = useState<number | null>(null);

  // Payloads
  const [mockPayment, setMockPayment] = useState<PaymentData>(createMockPayment());
  const [receivedPayments, setReceivedPayments] = useState<{ timestamp: string; data: PaymentData; rawHex: string }[]>([]);
  const [receivedAcks, setReceivedAcks] = useState<{ timestamp: string; data: AckData }[]>([]);
  const [logs, setLogs] = useState<{ time: string; msg: string; type: 'info' | 'success' | 'warn' | 'error' }[]>([]);

  const packedPaymentBytes = React.useMemo(() => packPayment(mockPayment), [mockPayment]);

  // Online / Offline listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize modem & protocols on mount
  useEffect(() => {
    modem.init().then(() => {
      setProtocols(modem.availableProtocols);
      setSelectedProtocol(modem.defaultProtocolId);
      addLog('Audio modem initialized successfully.', 'info');
    }).catch((err) => {
      addLog(`Initialization error: ${err.message}`, 'error');
    });

    return () => {
      modem.stopListening();
    };
  }, []);

  const addLog = (msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ time, msg, type }, ...prev.slice(0, 49)]);
  };

  // Transmit payment over sound
  const handleTransmitPayment = async () => {
    try {
      setIsTransmitting(true);
      addLog(`Playing 132-byte payment audio (UID: 0x${mockPayment.uid.toString(16)})...`, 'info');
      const res = await modem.transmit(packedPaymentBytes, selectedProtocol, volume);
      setTxDuration(Math.round(res.durationMs));
      addLog(`Transmission complete (${Math.round(res.durationMs)} ms). Listening for ACK...`, 'success');
    } catch (err: any) {
      addLog(`Transmit error: ${err.message}`, 'error');
    } finally {
      setIsTransmitting(false);
    }
  };

  // Transmit ACK over sound
  const handleTransmitAck = async (uid: number, status: number = 1) => {
    try {
      setIsTransmitting(true);
      const ackBytes = packAck({
        version: 1,
        uid,
        status,
        txHash: '0x' + Array(64).fill('a').join(''),
      });
      addLog(`Playing 36-byte ACK (UID: 0x${uid.toString(16)}, Status: ${status})...`, 'info');
      const res = await modem.transmit(ackBytes, selectedProtocol, volume);
      addLog(`ACK transmitted (${Math.round(res.durationMs)} ms).`, 'success');
    } catch (err: any) {
      addLog(`ACK error: ${err.message}`, 'error');
    } finally {
      setIsTransmitting(false);
    }
  };

  // Toggle Microphone Receiver
  const toggleListening = async () => {
    if (isListening) {
      modem.stopListening();
      setIsListening(false);
      setMicLevel(0);
      addLog('Microphone listener stopped.', 'info');
    } else {
      try {
        await modem.startListening(
          (bytes) => handleIncomingAudioPacket(bytes),
          (level) => setMicLevel(level)
        );
        setIsListening(true);
        addLog('Microphone active. Listening for payment or ACK chirps...', 'success');
      } catch (err: any) {
        addLog(`Mic access failed: ${err.message}`, 'error');
      }
    }
  };

  // Handle incoming audio packet decoded by ggwave
  const handleIncomingAudioPacket = (bytes: Uint8Array) => {
    addLog(`Captured sound packet: ${bytes.length} bytes!`, 'info');

    if (bytes.length === 132) {
      const payment = unpackPayment(bytes);
      if (payment) {
        addLog(`Valid 132-byte SonicPay payment decoded! UID: 0x${payment.uid.toString(16)}`, 'success');
        setReceivedPayments((prev) => [
          {
            timestamp: new Date().toLocaleTimeString(),
            data: payment,
            rawHex: bytesToHex(bytes),
          },
          ...prev,
        ]);
        return;
      }
    }

    if (bytes.length === 36) {
      const ack = unpackAck(bytes);
      if (ack) {
        addLog(`Valid 36-byte ACK received! Status: ${STATUS_NAMES[ack.status] || ack.status}`, 'success');
        setReceivedAcks((prev) => [
          { timestamp: new Date().toLocaleTimeString(), data: ack },
          ...prev,
        ]);
        return;
      }
    }

    addLog(`Received unknown packet of size ${bytes.length} bytes (hex: ${bytesToHex(bytes.slice(0, 16))}...)`, 'warn');
  };

  // Direct internal memory verification
  const handleMemoryTest = () => {
    const raw = packPayment(mockPayment);
    const decoded = unpackPayment(raw);
    if (decoded && decoded.uid === mockPayment.uid && decoded.amount === mockPayment.amount) {
      addLog(`Pack/Unpack memory validation passed! Exact 132 bytes verified.`, 'success');
    } else {
      addLog(`Pack/Unpack failed!`, 'error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-8 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                SonicPay
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                  Audio Modem Prototype
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Offline Crypto Payments Over Sound (132-Byte Payload Verification)
              </p>
            </div>
          </div>
        </div>

        {/* Connectivity Pill */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'Online (Relayer Mode Ready)' : 'Offline / Airplane Mode'}</span>
          </div>
        </div>
      </header>

      {/* Mode Navigation Tabs */}
      <div className="flex rounded-xl bg-slate-900/80 p-1.5 border border-slate-800 mb-8">
        <button
          onClick={() => setActiveTab('transmitter')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'transmitter'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Volume2 className="w-4 h-4" />
          <span>Payer (Transmitter)</span>
        </button>

        <button
          onClick={() => setActiveTab('receiver')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'receiver'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Mic className="w-4 h-4" />
          <span>Relayer (Receiver)</span>
          {isListening && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('loopback')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'loopback'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Verification & Diagnostics</span>
        </button>
      </div>

      {/* TAB 1: TRANSMITTER (PAYER) */}
      {activeTab === 'transmitter' && (
        <div className="space-y-6">
          {/* Card: Mock Payload Fields */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 backdrop-blur">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                Offline Payment Payload Structure
              </h2>
              <span className="text-xs px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-300 font-mono">
                Exact Size: 132 Bytes
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-500 block mb-1">Payer (from)</span>
                <span className="text-slate-200 break-all">{mockPayment.from}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-500 block mb-1">Receiver (Bob)</span>
                <span className="text-slate-200 break-all">{mockPayment.receiver}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-500 block mb-1">Amount</span>
                <span className="text-emerald-400 font-semibold text-sm">
                  {(Number(mockPayment.amount) / 1e6).toFixed(6)} USDC
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-500 block mb-1">Relayer Fee</span>
                <span className="text-indigo-400 font-semibold text-sm">
                  {(mockPayment.fee / 1e6).toFixed(6)} USDC
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-500 block mb-1">UID (16-bit match tag)</span>
                <span className="text-amber-300">0x{mockPayment.uid.toString(16).toUpperCase()}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-500 block mb-1">Target Chain</span>
                <span className="text-slate-200">Sepolia (Index: {mockPayment.chainIndex})</span>
              </div>
            </div>

            {/* Raw Hex view */}
            <div className="mt-4 pt-4 border-t border-slate-800/80">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-400 font-mono">Raw Binary Hex (132 bytes)</span>
                <span className="text-xs text-slate-500 font-mono">
                  {packedPaymentBytes.length} / 140 max bytes
                </span>
              </div>
              <p className="font-mono text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-lg border border-slate-800 break-all select-all">
                {bytesToHex(packedPaymentBytes)}
              </p>
            </div>
          </div>

          {/* Audio Controls */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Transmission Settings</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block">Acoustic Protocol</label>
                <select
                  value={selectedProtocol}
                  onChange={(e) => setSelectedProtocol(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {protocols.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>Speaker Volume</span>
                  <span className="font-mono">{volume}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>

            {/* Play Button */}
            <button
              onClick={handleTransmitPayment}
              disabled={isTransmitting}
              className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-3 transition-all shadow-lg ${
                isTransmitting
                  ? 'bg-amber-600 text-white cursor-not-allowed animate-pulse'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-600/25'
              }`}
            >
              <Volume2 className={`w-5 h-5 ${isTransmitting ? 'animate-bounce' : ''}`} />
              <span>
                {isTransmitting
                  ? 'Playing Audio Waveform... (Keep Near Receiver)'
                  : 'Broadcast Payment Over Sound (132 Bytes)'}
              </span>
            </button>

            {txDuration && !isTransmitting && (
              <p className="text-xs text-emerald-400 text-center mt-3">
                Last broadcast took {txDuration} ms to emit through speakers.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: RECEIVER (RELAYER) */}
      {activeTab === 'receiver' && (
        <div className="space-y-6">
          {/* Listening Control */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Mic className="w-5 h-5 text-indigo-400" />
                  Relayer Acoustic Listener
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Listens through microphone for 132-byte payments or 36-byte ACKs.
                </p>
              </div>

              <button
                onClick={toggleListening}
                className={`px-5 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
                  isListening
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
                }`}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>Stop Listening</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Start Listening</span>
                  </>
                )}
              </button>
            </div>

            {/* Mic VU meter */}
            {isListening && (
              <div className="mt-5 pt-4 border-t border-slate-800">
                <div className="flex justify-between items-center text-xs text-slate-400 mb-1.5 font-mono">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    Microphone Active (Continuous Ingestion)
                  </span>
                  <span>Audio Level</span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-indigo-500 h-full transition-all duration-75"
                    style={{ width: `${Math.min(100, micLevel * 100)}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* Captured Payments Feed */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center justify-between">
              <span>Captured Offline Payments</span>
              <span className="text-xs font-mono font-normal text-slate-400">
                {receivedPayments.length} Detected
              </span>
            </h3>

            {receivedPayments.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl">
                <Volume2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No sound packets decoded yet.</p>
                <p className="text-xs text-slate-500 mt-1">
                  Start listening and emit a payment from the Payer tab or another device.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {receivedPayments.map((p, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-300">
                          DECODED 132-BYTE PAYMENT
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">{p.timestamp}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-slate-500">From: </span>
                        <span className="text-slate-300">{p.data.from.slice(0, 10)}...</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Receiver: </span>
                        <span className="text-slate-300">{p.data.receiver.slice(0, 10)}...</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Amount: </span>
                        <span className="text-emerald-400">
                          {(Number(p.data.amount) / 1e6).toFixed(6)} USDC
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Relay Fee: </span>
                        <span className="text-indigo-400">
                          {(p.data.fee / 1e6).toFixed(6)} USDC
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">UID Tag: </span>
                        <span className="text-amber-300">0x{p.data.uid.toString(16)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Expires: </span>
                        <span className="text-slate-300">
                          {new Date(p.data.validBefore * 1000).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>

                    {/* Simulate sending ACK */}
                    <div className="pt-2 border-t border-slate-900 flex justify-end">
                      <button
                        onClick={() => handleTransmitAck(p.data.uid, 1)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-xs font-medium flex items-center gap-1.5 transition-all"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send Audio ACK (Status 1)</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: VERIFICATION & DIAGNOSTICS */}
      {activeTab === 'loopback' && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6">
            <h2 className="text-base font-semibold text-white mb-2">
              End-to-End Verification Instructions
            </h2>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              This prototype tests the acoustic transport layer required by SonicPay before the full
              on-chain smart contract integration.
            </p>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">1. Single-Machine Loopback Test</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Open two browser windows (or tabs) side-by-side. On Tab 1, switch to "Relayer" and click
                    "Start Listening". On Tab 2, switch to "Payer" and click "Broadcast Payment Over Sound".
                    Within 5–8 seconds, Tab 1 will decode the exact 132 bytes and show green confirmation!
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 mt-0.5">
                  <WifiOff className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">2. Two-Device Airplane Mode Test</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Load this PWA on your phone. Put your phone in <strong>Airplane Mode</strong> (Wi-Fi and
                    cellular off). Keep the laptop online on the Relayer tab. Play the sound from the offline phone.
                    The online laptop will capture and decode the payload over the air!
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex gap-3">
              <button
                onClick={handleMemoryTest}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-2 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Run In-Memory Binary Roundtrip Test</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Event Log Console */}
      <div className="mt-8 rounded-2xl bg-slate-900/60 border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-300 font-mono flex items-center gap-2">
            <span>Diagnostic Activity Log</span>
          </h3>
          <button
            onClick={() => setLogs([])}
            className="text-[11px] text-slate-500 hover:text-slate-300 font-mono"
          >
            Clear
          </button>
        </div>
        <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 font-mono text-[11px] h-44 overflow-y-auto space-y-1.5">
          {logs.length === 0 ? (
            <span className="text-slate-600">No events logged yet.</span>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-slate-600 select-none">[{log.time}]</span>
                <span
                  className={
                    log.type === 'success'
                      ? 'text-emerald-400'
                      : log.type === 'error'
                      ? 'text-rose-400'
                      : log.type === 'warn'
                      ? 'text-amber-400'
                      : 'text-slate-400'
                  }
                >
                  {log.msg}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
