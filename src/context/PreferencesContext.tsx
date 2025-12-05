// ============================================================================
// HEKAX Phone - User Preferences Context
// Handles theme, compact mode, sound effects, and other user preferences
// ============================================================================

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface Preferences {
  theme: Theme;
  compactMode: boolean;
  soundEffects: boolean;
  timezone: string;
}

interface PreferencesContextType {
  preferences: Preferences;
  setTheme: (theme: Theme) => void;
  setCompactMode: (enabled: boolean) => void;
  setSoundEffects: (enabled: boolean) => void;
  setTimezone: (timezone: string) => void;
  playSound: (sound: 'click' | 'success' | 'error' | 'notification') => void;
}

const defaultPreferences: Preferences = {
  theme: 'dark',
  compactMode: false,
  soundEffects: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
};

const PreferencesContext = createContext<PreferencesContextType | null>(null);

// Sound URLs (using Web Audio API tones)
const sounds = {
  click: { frequency: 800, duration: 0.05, type: 'sine' as OscillatorType },
  success: { frequency: 880, duration: 0.15, type: 'sine' as OscillatorType },
  error: { frequency: 200, duration: 0.2, type: 'square' as OscillatorType },
  notification: { frequency: 660, duration: 0.1, type: 'sine' as OscillatorType },
};

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    // Load from localStorage
    const saved = localStorage.getItem('hekax-preferences');
    if (saved) {
      try {
        return { ...defaultPreferences, ...JSON.parse(saved) };
      } catch {
        return defaultPreferences;
      }
    }
    return defaultPreferences;
  });

  // Audio context for sound effects
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  // Initialize audio context on first user interaction
  useEffect(() => {
    const initAudio = () => {
      if (!audioContext) {
        setAudioContext(new (window.AudioContext || (window as any).webkitAudioContext)());
      }
      window.removeEventListener('click', initAudio);
    };
    window.addEventListener('click', initAudio);
    return () => window.removeEventListener('click', initAudio);
  }, [audioContext]);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('hekax-preferences', JSON.stringify(preferences));
  }, [preferences]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (preferences.theme === 'light') {
      root.classList.add('light-theme');
      root.classList.remove('dark-theme');
    } else {
      root.classList.add('dark-theme');
      root.classList.remove('light-theme');
    }
  }, [preferences.theme]);

  // Apply compact mode
  useEffect(() => {
    const root = document.documentElement;
    if (preferences.compactMode) {
      root.classList.add('compact-mode');
    } else {
      root.classList.remove('compact-mode');
    }
  }, [preferences.compactMode]);

  const setTheme = (theme: Theme) => {
    setPreferences(prev => ({ ...prev, theme }));
  };

  const setCompactMode = (compactMode: boolean) => {
    setPreferences(prev => ({ ...prev, compactMode }));
  };

  const setSoundEffects = (soundEffects: boolean) => {
    setPreferences(prev => ({ ...prev, soundEffects }));
  };

  const setTimezone = (timezone: string) => {
    setPreferences(prev => ({ ...prev, timezone }));
  };

  const playSound = (sound: 'click' | 'success' | 'error' | 'notification') => {
    if (!preferences.soundEffects || !audioContext) return;

    try {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      const config = sounds[sound];
      oscillator.frequency.value = config.frequency;
      oscillator.type = config.type;

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + config.duration);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + config.duration);
    } catch (err) {
      console.error('Sound playback error:', err);
    }
  };

  return (
    <PreferencesContext.Provider
      value={{
        preferences,
        setTheme,
        setCompactMode,
        setSoundEffects,
        setTimezone,
        playSound,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
