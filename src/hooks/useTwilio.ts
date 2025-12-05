// ============================================================================
// HEKAX Phone - Twilio Hook
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { getTwilioToken } from '../utils/api';
import type { TwilioDevice, TwilioCall } from '../types';

export type TwilioStatus = 
  | 'initializing' 
  | 'ready' 
  | 'connecting' 
  | 'connected' 
  | 'disconnected' 
  | 'error';

interface UseTwilioReturn {
  device: TwilioDevice | null;
  activeCall: TwilioCall | null;
  status: TwilioStatus;
  statusMessage: string;
  isRegistered: boolean;
  isMuted: boolean;
  callDuration: number;
  incomingCall: TwilioCall | null;
  // Actions
  makeCall: (phoneNumber: string) => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  acceptIncoming: () => void;
  rejectIncoming: () => void;
  sendDigits: (digits: string) => void;
}

interface UseTwilioOptions {
  enabled?: boolean;
}

export function useTwilio(options: UseTwilioOptions = {}): UseTwilioReturn {
  const { enabled = true } = options;

  const [device, setDevice] = useState<TwilioDevice | null>(null);
  const [activeCall, setActiveCall] = useState<TwilioCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<TwilioCall | null>(null);
  const [status, setStatus] = useState<TwilioStatus>(enabled ? 'initializing' : 'disconnected');
  const [statusMessage, setStatusMessage] = useState(enabled ? 'Initializing...' : 'Softphone disabled');
  const [isRegistered, setIsRegistered] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const timerRef = useRef<number | null>(null);
  const deviceRef = useRef<TwilioDevice | null>(null);

  // Initialize Twilio Device
  useEffect(() => {
    // Skip initialization if not enabled
    if (!enabled) {
      setStatus('disconnected');
      setStatusMessage('Softphone disabled');
      return;
    }

    let mounted = true;

    const setupDevice = async () => {
      try {
        setStatus('initializing');
        setStatusMessage('Getting token...');

        // Get token from backend
        const { token, identity } = await getTwilioToken();
        
        if (!mounted) return;

        // Dynamically import Twilio Voice SDK
        const { Device } = await import('@twilio/voice-sdk');
        
        if (!mounted) return;

        setStatusMessage('Connecting to Twilio...');

        // Create device
        const twilioDevice = new Device(token, {
          logLevel: 1,
          codecPreferences: ['opus', 'pcmu'],
        });

        // Setup event handlers
        twilioDevice.on('registered', () => {
          if (!mounted) return;
          console.log('✅ Twilio device registered');
          setStatus('ready');
          setStatusMessage('Ready');
          setIsRegistered(true);
        });

        twilioDevice.on('unregistered', () => {
          if (!mounted) return;
          console.log('📴 Twilio device unregistered');
          setIsRegistered(false);
          setStatus('disconnected');
          setStatusMessage('Disconnected');
        });

        twilioDevice.on('error', (error: Error) => {
          if (!mounted) return;
          console.error('❌ Twilio device error:', error);
          setStatus('error');
          setStatusMessage(`Error: ${error.message}`);
        });

        twilioDevice.on('incoming', (call: TwilioCall) => {
          if (!mounted) return;
          console.log('📞 Incoming call from:', call.parameters.From);
          setIncomingCall(call);
          setStatus('connecting');
          setStatusMessage(`Incoming: ${call.parameters.From || 'Unknown'}`);
        });

        // Register the device
        await twilioDevice.register();
        
        deviceRef.current = twilioDevice;
        setDevice(twilioDevice);

      } catch (error) {
        if (!mounted) return;
        console.error('Failed to setup Twilio:', error);
        setStatus('error');
        setStatusMessage(error instanceof Error ? error.message : 'Setup failed');
      }
    };

    setupDevice();

    return () => {
      mounted = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (deviceRef.current) {
        deviceRef.current.destroy();
      }
    };
  }, [enabled]);

  // Handle call events
  const setupCallEvents = useCallback((call: TwilioCall) => {
    call.on('accept', () => {
      console.log('📞 Call accepted');
      setStatus('connected');
      setStatusMessage('Connected');
      setCallDuration(0);
      
      // Start duration timer
      timerRef.current = window.setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    });

    call.on('disconnect', () => {
      console.log('📴 Call disconnected');
      setActiveCall(null);
      setIncomingCall(null);
      setStatus('ready');
      setStatusMessage('Ready');
      setIsMuted(false);
      setCallDuration(0);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    });

    call.on('cancel', () => {
      console.log('❌ Call cancelled');
      setIncomingCall(null);
      setActiveCall(null);
      setStatus('ready');
      setStatusMessage('Ready');
    });

    call.on('reject', () => {
      console.log('❌ Call rejected');
      setIncomingCall(null);
      setStatus('ready');
      setStatusMessage('Ready');
    });

    call.on('error', (error: Error) => {
      console.error('❌ Call error:', error);
      setStatus('error');
      setStatusMessage(`Call error: ${error.message}`);
    });
  }, []);

  // Make outgoing call
  const makeCall = useCallback(async (phoneNumber: string) => {
    if (!device || !isRegistered) {
      throw new Error('Device not ready');
    }

    try {
      setStatus('connecting');
      setStatusMessage(`Calling ${phoneNumber}...`);

      const call = await device.connect({
        params: { To: phoneNumber },
      });

      setupCallEvents(call);
      setActiveCall(call);

    } catch (error) {
      console.error('Failed to make call:', error);
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Call failed');
      throw error;
    }
  }, [device, isRegistered, setupCallEvents]);

  // Hang up current call
  const hangup = useCallback(() => {
    if (activeCall) {
      activeCall.disconnect();
    }
  }, [activeCall]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (activeCall) {
      const newMuteState = !isMuted;
      activeCall.mute(newMuteState);
      setIsMuted(newMuteState);
    }
  }, [activeCall, isMuted]);

  // Accept incoming call
  const acceptIncoming = useCallback(() => {
    if (incomingCall) {
      setupCallEvents(incomingCall);
      // @ts-ignore - Twilio SDK typing issue
      incomingCall.accept();
      setActiveCall(incomingCall);
      setIncomingCall(null);
    }
  }, [incomingCall, setupCallEvents]);

  // Reject incoming call
  const rejectIncoming = useCallback(() => {
    if (incomingCall) {
      // @ts-ignore - Twilio SDK typing issue
      incomingCall.reject();
      setIncomingCall(null);
      setStatus('ready');
      setStatusMessage('Ready');
    }
  }, [incomingCall]);

  // Send DTMF digits
  const sendDigits = useCallback((digits: string) => {
    if (activeCall) {
      activeCall.sendDigits(digits);
    }
  }, [activeCall]);

  return {
    device,
    activeCall,
    status,
    statusMessage,
    isRegistered,
    isMuted,
    callDuration,
    incomingCall,
    makeCall,
    hangup,
    toggleMute,
    acceptIncoming,
    rejectIncoming,
    sendDigits,
  };
}
