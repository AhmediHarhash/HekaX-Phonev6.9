// ============================================================================
// HEKAX Phone - Softphone Page
// ============================================================================

import { useState } from 'react';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff,
  Clock,
  PhoneIncoming,
  X,
  Check,
  Delete,
} from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Card } from '../components/common';
import { useTwilio } from '../hooks/useTwilio';
import { formatDuration, formatPhoneNumber } from '../utils/formatters';

const DIAL_PAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

export function SoftphonePage() {
  const {
    status,
    statusMessage,
    isRegistered,
    isMuted,
    callDuration,
    activeCall,
    incomingCall,
    makeCall,
    hangup,
    toggleMute,
    acceptIncoming,
    rejectIncoming,
    sendDigits,
  } = useTwilio();

  const [phoneNumber, setPhoneNumber] = useState('');

  const handleDial = (digit: string) => {
    setPhoneNumber(prev => prev + digit);
    if (activeCall) {
      sendDigits(digit);
    }
  };

  const handleBackspace = () => {
    setPhoneNumber(prev => prev.slice(0, -1));
  };

  const handleCall = async () => {
    if (!phoneNumber || !isRegistered) return;
    try {
      await makeCall(phoneNumber);
    } catch (err) {
      console.error('Call failed:', err);
    }
  };

  return (
    <div className="flex justify-center pt-8">
      <Card className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-white mb-2">Softphone</h2>
          <div className="flex items-center justify-center gap-2">
            <div 
              className={`w-2.5 h-2.5 rounded-full ${
                status === 'ready' ? 'bg-emerald-500' :
                status === 'connected' ? 'bg-blue-500 animate-pulse' :
                status === 'connecting' ? 'bg-amber-500 animate-pulse' :
                status === 'error' ? 'bg-red-500' :
                'bg-slate-500'
              }`}
            />
            <span className="text-sm text-slate-400">{statusMessage}</span>
          </div>
        </div>

        {/* Incoming Call Alert */}
        {incomingCall && (
          <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl animate-pulse">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <PhoneIncoming size={24} className="text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-white">Incoming Call</p>
                <p className="text-sm text-slate-400">
                  {incomingCall.parameters.From || 'Unknown'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={rejectIncoming}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium flex items-center justify-center gap-2"
              >
                <X size={18} /> Decline
              </button>
              <button
                onClick={acceptIncoming}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center justify-center gap-2"
              >
                <Check size={18} /> Answer
              </button>
            </div>
          </div>
        )}

        {/* Active Call View */}
        {activeCall && !incomingCall ? (
          <div className="text-center">
            {/* Call Timer */}
            <div className="mb-8">
              <div className="flex items-center justify-center gap-3 text-4xl font-bold text-white mb-2">
                <Clock size={32} className="text-blue-400" />
                {formatDuration(callDuration)}
              </div>
              <p className="text-slate-400">{phoneNumber || 'Connected'}</p>
            </div>

            {/* Call Controls */}
            <div className="flex justify-center gap-4 mb-8">
              <button
                onClick={toggleMute}
                className={`
                  w-16 h-16 rounded-full flex items-center justify-center
                  transition-colors
                  ${isMuted
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }
                `}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              <button
                onClick={hangup}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center"
              >
                <PhoneOff size={24} />
              </button>
            </div>

            {/* DTMF Dial Pad */}
            <div className="grid grid-cols-3 gap-3">
              {DIAL_PAD.flat().map(digit => (
                <button
                  key={digit}
                  onClick={() => handleDial(digit)}
                  className="
                    py-3 rounded-lg bg-slate-800 hover:bg-slate-700
                    text-lg font-semibold text-white
                    transition-colors
                  "
                >
                  {digit}
                </button>
              ))}
            </div>
          </div>
        ) : !incomingCall && (
          /* Dial Pad View */
          <div>
            {/* Phone Number Input */}
            <div className="relative mb-6">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="
                  w-full py-4 px-4 text-center text-2xl font-medium
                  bg-slate-900/50 border border-slate-700 rounded-xl
                  text-white placeholder-slate-600
                  focus:outline-none focus:border-blue-500
                "
              />
              {phoneNumber && (
                <button
                  onClick={handleBackspace}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-white"
                >
                  <Delete size={20} />
                </button>
              )}
            </div>

            {/* Dial Pad */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {DIAL_PAD.flat().map(digit => (
                <button
                  key={digit}
                  onClick={() => handleDial(digit)}
                  className="
                    py-4 rounded-xl bg-slate-800 hover:bg-slate-700
                    text-xl font-semibold text-white
                    transition-colors active:scale-95
                  "
                >
                  {digit}
                </button>
              ))}
            </div>

            {/* Call Button */}
            <button
              onClick={handleCall}
              disabled={!isRegistered || !phoneNumber}
              className="
                w-full py-4 rounded-xl font-semibold text-lg
                bg-emerald-600 hover:bg-emerald-700 text-white
                disabled:opacity-50 disabled:cursor-not-allowed
                flex items-center justify-center gap-3
                transition-colors
              "
            >
              <Phone size={24} /> Call
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
