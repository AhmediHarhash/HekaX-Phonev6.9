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
  AlertCircle,
  CreditCard,
  Volume2,
  VolumeX,
  Volume1,
} from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Card, Button } from '../components/common';
import { useTwilio } from '../hooks/useTwilio';
import { useAuth } from '../context/AuthContext';
import { formatDuration } from '../utils/formatters';

const DIAL_PAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
];

export function SoftphonePage() {
  const { org } = useAuth();
  const isTrial = !org?.plan || org.plan === 'TRIAL';
  const hasPhoneNumber = !!org?.twilioNumber;

  // Only initialize Twilio if user is not on trial and has a phone number
  const twilioEnabled = !isTrial && hasPhoneNumber;

  const {
    status,
    statusMessage,
    isRegistered,
    isMuted,
    callDuration,
    activeCall,
    incomingCall,
    volume,
    makeCall,
    hangup,
    toggleMute,
    acceptIncoming,
    rejectIncoming,
    sendDigits,
    setVolume,
  } = useTwilio({ enabled: twilioEnabled });

  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

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

  // Show upgrade prompt for trial users
  if (isTrial) {
    return (
      <div className="flex justify-center pt-8">
        <Card className="w-full max-w-md text-center">
          <div className="py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Phone size={32} className="text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Softphone</h2>
            <p className="text-slate-400 mb-6">
              Make and receive calls directly from your browser.
              Upgrade to a paid plan to unlock this feature.
            </p>
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-6">
              <div className="flex items-center gap-3 text-amber-400">
                <AlertCircle size={20} />
                <span className="text-sm font-medium">Free Trial</span>
              </div>
              <p className="text-sm text-slate-400 mt-2">
                The softphone requires an active subscription and a purchased phone number.
              </p>
            </div>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'billing' }))}
              className="w-full"
            >
              <CreditCard size={18} />
              Upgrade Now
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Show no phone number message
  if (!hasPhoneNumber) {
    return (
      <div className="flex justify-center pt-8">
        <Card className="w-full max-w-md text-center">
          <div className="py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700 flex items-center justify-center">
              <Phone size={32} className="text-slate-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">No Phone Number</h2>
            <p className="text-slate-400 mb-6">
              You need to add a phone number before you can use the softphone.
            </p>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'phone-numbers' }))}
              className="w-full"
            >
              <Phone size={18} />
              Add Phone Number
            </Button>
          </div>
        </Card>
      </div>
    );
  }

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
            <div className="flex justify-center gap-4 mb-6">
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
                onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                className={`
                  w-16 h-16 rounded-full flex items-center justify-center
                  transition-colors
                  ${showVolumeSlider
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }
                `}
              >
                {volume === 0 ? <VolumeX size={24} /> : volume < 50 ? <Volume1 size={24} /> : <Volume2 size={24} />}
              </button>
              <button
                onClick={hangup}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center"
              >
                <PhoneOff size={24} />
              </button>
            </div>

            {/* Volume Slider */}
            {showVolumeSlider && (
              <div className="mb-6 px-4">
                <div className="flex items-center gap-3">
                  <VolumeX size={18} className="text-slate-400" />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="
                      flex-1 h-2 rounded-full appearance-none cursor-pointer
                      bg-slate-700
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:w-4
                      [&::-webkit-slider-thumb]:h-4
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-blue-500
                      [&::-webkit-slider-thumb]:hover:bg-blue-400
                      [&::-webkit-slider-thumb]:cursor-pointer
                      [&::-moz-range-thumb]:w-4
                      [&::-moz-range-thumb]:h-4
                      [&::-moz-range-thumb]:rounded-full
                      [&::-moz-range-thumb]:bg-blue-500
                      [&::-moz-range-thumb]:border-0
                      [&::-moz-range-thumb]:cursor-pointer
                    "
                  />
                  <Volume2 size={18} className="text-slate-400" />
                </div>
                <p className="text-center text-sm text-slate-500 mt-2">Volume: {volume}%</p>
              </div>
            )}

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
