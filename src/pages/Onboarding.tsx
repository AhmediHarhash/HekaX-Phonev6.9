// ============================================================================
// HEKAX Phone - Onboarding Wizard
// Phase 6.2: Guided Setup for New Organizations
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import {
  Building,
  Phone,
  Bot,
  Clock,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Upload,
  Play,
  Volume2,
  Loader2,
  Sparkles,
  Square,
  Globe,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Card, Button, Badge } from '../components/common';
import { api } from '../utils/api';

// Step configuration
const STEPS = [
  { id: 'profile', title: 'Organization Profile', icon: Building },
  { id: 'hours', title: 'Business Hours', icon: Clock },
  { id: 'ai', title: 'AI Receptionist', icon: Bot },
  { id: 'phone', title: 'Phone Number', icon: Phone },
  { id: 'test', title: 'Test Call', icon: CheckCircle },
];

// Comprehensive timezone list - USA first, then by region
const TIMEZONE_OPTIONS = [
  // USA
  { value: 'America/New_York', label: 'Eastern Time (ET, GMT-5)', region: 'USA' },
  { value: 'America/Chicago', label: 'Central Time (CT, GMT-6)', region: 'USA' },
  { value: 'America/Denver', label: 'Mountain Time (MT, GMT-7)', region: 'USA' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT, GMT-8)', region: 'USA' },
  { value: 'America/Anchorage', label: 'Alaska (AKT, GMT-9)', region: 'USA' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST, GMT-10)', region: 'USA' },
  // Europe
  { value: 'Europe/London', label: 'London (GMT+0)', region: 'Europe' },
  { value: 'Europe/Paris', label: 'Paris / Berlin (CET, GMT+1)', region: 'Europe' },
  { value: 'Europe/Athens', label: 'Athens / Helsinki (EET, GMT+2)', region: 'Europe' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK, GMT+3)', region: 'Europe' },
  // Middle East
  { value: 'Africa/Cairo', label: 'Cairo (EET, GMT+2)', region: 'Middle East' },
  { value: 'Asia/Dubai', label: 'Dubai (GST, GMT+4)', region: 'Middle East' },
  { value: 'Asia/Riyadh', label: 'Riyadh (AST, GMT+3)', region: 'Middle East' },
  { value: 'Asia/Jerusalem', label: 'Jerusalem (IST, GMT+2)', region: 'Middle East' },
  // Asia Pacific
  { value: 'Asia/Kolkata', label: 'Mumbai / Delhi (IST, GMT+5:30)', region: 'Asia Pacific' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT, GMT+8)', region: 'Asia Pacific' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT, GMT+8)', region: 'Asia Pacific' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST, GMT+9)', region: 'Asia Pacific' },
  { value: 'Asia/Seoul', label: 'Seoul (KST, GMT+9)', region: 'Asia Pacific' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST, GMT+10)', region: 'Asia Pacific' },
  { value: 'Australia/Perth', label: 'Perth (AWST, GMT+8)', region: 'Asia Pacific' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST, GMT+12)', region: 'Asia Pacific' },
  // Americas (non-USA)
  { value: 'America/Toronto', label: 'Toronto (ET, GMT-5)', region: 'Americas' },
  { value: 'America/Vancouver', label: 'Vancouver (PT, GMT-8)', region: 'Americas' },
  { value: 'America/Mexico_City', label: 'Mexico City (CST, GMT-6)', region: 'Americas' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT, GMT-3)', region: 'Americas' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (ART, GMT-3)', region: 'Americas' },
];

// Voice options with preview URLs (using OpenAI TTS voices)
const VOICE_OPTIONS = [
  { 
    id: 'nova', 
    name: 'Nova', 
    description: 'Calm & professional', 
    gender: 'female',
    default: true,
  },
  { 
    id: 'sage', 
    name: 'Sage', 
    description: 'Warm & wise', 
    gender: 'female',
  },
  { 
    id: 'alloy', 
    name: 'Alloy', 
    description: 'Neutral & balanced', 
    gender: 'neutral',
  },
  { 
    id: 'echo', 
    name: 'Echo', 
    description: 'Friendly & warm', 
    gender: 'male',
  },
  { 
    id: 'onyx', 
    name: 'Onyx', 
    description: 'Deep & authoritative', 
    gender: 'male',
  },
  { 
    id: 'shimmer', 
    name: 'Shimmer', 
    description: 'Soft & gentle', 
    gender: 'female',
  },
];

// Industry templates
const INDUSTRY_TEMPLATES = [
  { 
    id: 'general', 
    name: 'General Business',
    greeting: "Thank you for calling {company}. How may I help you today?",
    personality: 'professional',
  },
  { 
    id: 'legal', 
    name: 'Law Firm',
    greeting: "Thank you for calling {company}. All calls may be recorded for quality assurance. How may I direct your call?",
    personality: 'formal',
  },
  { 
    id: 'medical', 
    name: 'Medical Office',
    greeting: "Thank you for calling {company}. If this is a medical emergency, please hang up and dial 911. How may I assist you today?",
    personality: 'empathetic',
  },
  { 
    id: 'realestate', 
    name: 'Real Estate',
    greeting: "Thanks for calling {company}! Are you looking to buy, sell, or have questions about a property?",
    personality: 'enthusiastic',
  },
  { 
    id: 'restaurant', 
    name: 'Restaurant',
    greeting: "Thank you for calling {company}. Would you like to make a reservation or place an order?",
    personality: 'friendly',
  },
  { 
    id: 'hvac', 
    name: 'HVAC / Home Services',
    greeting: "Thanks for calling {company}. Do you need to schedule a service appointment or have questions about our services?",
    personality: 'helpful',
  },
];

// Default business hours
const DEFAULT_HOURS = {
  monday: { enabled: true, open: '09:00', close: '17:00' },
  tuesday: { enabled: true, open: '09:00', close: '17:00' },
  wednesday: { enabled: true, open: '09:00', close: '17:00' },
  thursday: { enabled: true, open: '09:00', close: '17:00' },
  friday: { enabled: true, open: '09:00', close: '17:00' },
  saturday: { enabled: false, open: '10:00', close: '14:00' },
  sunday: { enabled: false, open: '', close: '' },
};

interface OnboardingData {
  // Step 1: Profile
  companyName: string;
  industry: string;
  logoUrl: string;
  timezone: string;
  
  // Step 2: Hours
  businessHours: typeof DEFAULT_HOURS;
  afterHoursMessage: string;
  
  // Step 3: AI
  greeting: string;
  voiceId: string;
  personality: string;
  
  // Step 4: Phone
  phoneNumber: string;
  areaCode: string;
  country: string;
}

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testCallStatus, setTestCallStatus] = useState<'idle' | 'calling' | 'success' | 'failed'>('idle');
  
  // Voice preview
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [data, setData] = useState<OnboardingData>({
    companyName: '',
    industry: 'general',
    logoUrl: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    businessHours: DEFAULT_HOURS,
    afterHoursMessage: "We're currently closed. Please leave a message and we'll get back to you during business hours.",
    greeting: INDUSTRY_TEMPLATES[0].greeting,
    voiceId: 'nova', // Default to Nova (calm & professional)
    personality: 'professional',
    phoneNumber: '',
    areaCode: '',
    country: 'US',
  });

  const [availableNumbers, setAvailableNumbers] = useState<{ 
    number: string; 
    locality?: string;
    region?: string;
    capabilities?: { voice?: boolean; SMS?: boolean; MMS?: boolean; fax?: boolean };
  }[]>([]);
  const [searchingNumbers, setSearchingNumbers] = useState(false);
  const [phoneSearchError, setPhoneSearchError] = useState<string | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Play voice preview
  const playVoicePreview = async (voiceId: string) => {
    // Stop current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // If clicking same voice, just stop
    if (playingVoice === voiceId) {
      setPlayingVoice(null);
      return;
    }

    setLoadingVoice(voiceId);
    
    try {
      // Request voice preview from backend
      const response = await api.post<{ audioUrl: string }>('/api/voice/preview', { 
        voiceId,
        text: 'Hi, thank you for calling. How may I help you today?'
      });
      
      const audio = new Audio(response.audioUrl);
      audioRef.current = audio;
      
      audio.onended = () => {
        setPlayingVoice(null);
      };
      
      audio.onerror = () => {
        setPlayingVoice(null);
        setLoadingVoice(null);
      };
      
      await audio.play();
      setPlayingVoice(voiceId);
    } catch (err) {
      console.error('Voice preview error:', err);
      // Fallback: just select the voice without preview
    } finally {
      setLoadingVoice(null);
    }
  };

  // Update greeting when industry changes
  useEffect(() => {
    const template = INDUSTRY_TEMPLATES.find(t => t.id === data.industry);
    if (template) {
      setData(prev => ({
        ...prev,
        greeting: template.greeting.replace('{company}', prev.companyName || 'our office'),
        personality: template.personality,
      }));
    }
  }, [data.industry]);

  // Update greeting when company name changes
  useEffect(() => {
    if (data.companyName) {
      setData(prev => ({
        ...prev,
        greeting: prev.greeting.replace(/\{company\}|our office/g, data.companyName),
      }));
    }
  }, [data.companyName]);

  const searchPhoneNumbers = async () => {
    // For US, need 3-digit area code. For UK, can be empty or partial
    if (data.country === 'US' && data.areaCode.length !== 3) return;
    
    setSearchingNumbers(true);
    setPhoneSearchError(null);
    setAvailableNumbers([]);
    
    try {
      const params = new URLSearchParams({
        country: data.country,
        ...(data.areaCode && { areaCode: data.areaCode }),
      });
      
      const response = await api.get<Array<{ 
        number: string; 
        locality?: string;
        region?: string;
        capabilities?: { voice?: boolean; SMS?: boolean; MMS?: boolean; fax?: boolean };
      }>>(`/api/phone-numbers/available?${params}`);
      
      if (response.length === 0) {
        setPhoneSearchError('No numbers found for this area code. Try a different one.');
      } else {
        setAvailableNumbers(response);
      }
    } catch (err: any) {
      console.error('Search error:', err);
      setPhoneSearchError(err.message || 'Failed to search for phone numbers');
    } finally {
      setSearchingNumbers(false);
    }
  };

  const saveStep = async () => {
    setSaving(true);
    try {
      // Save organization settings
      await api.patch('/api/organization', {
        name: data.companyName,
        industry: data.industry,
        logoUrl: data.logoUrl || null,
        timezone: data.timezone,
        businessHours: JSON.stringify(data.businessHours),
        afterHoursMessage: data.afterHoursMessage,
        aiGreeting: data.greeting,
        aiVoiceId: data.voiceId,
        aiPersonality: data.personality,
      });
      return true;
    } catch (err) {
      console.error('Save error:', err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    // Save current step data
    const saved = await saveStep();
    if (!saved) return;

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSkipPhone = async () => {
    await saveStep();
    setCurrentStep(STEPS.length - 1); // Go to test step
  };

  const handleAddPhoneNumber = async (number: string) => {
    setSaving(true);
    try {
      await api.post('/api/phone-numbers', { number });
      setData(prev => ({ ...prev, phoneNumber: number }));
      setCurrentStep(prev => prev + 1);
    } catch (err) {
      console.error('Add phone error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleTestCall = async () => {
    setTestCallStatus('calling');
    try {
      // This would trigger a test call through the system
      await api.post('/api/calls/test');
      setTestCallStatus('success');
    } catch (err) {
      console.error('Test call error:', err);
      setTestCallStatus('failed');
    }
  };

  const handleComplete = async () => {
    // Mark onboarding as complete
    await api.patch('/api/organization', { onboardingCompleted: true });
    onComplete();
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Profile
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Company Name *
              </label>
              <input
                type="text"
                value={data.companyName}
                onChange={(e) => setData({ ...data, companyName: e.target.value })}
                placeholder="Your Business Name"
                className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Industry
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {INDUSTRY_TEMPLATES.map(template => (
                  <button
                    key={template.id}
                    onClick={() => setData({ ...data, industry: template.id })}
                    className={`
                      p-3 rounded-lg border text-left transition-all
                      ${data.industry === template.id
                        ? 'border-blue-500 bg-blue-500/10 text-white'
                        : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                      }
                    `}
                  >
                    <span className="text-sm font-medium">{template.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Logo URL (Optional)
              </label>
              <input
                type="url"
                value={data.logoUrl}
                onChange={(e) => setData({ ...data, logoUrl: e.target.value })}
                placeholder="https://example.com/logo.png"
                className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                <Globe size={16} className="inline mr-2" />
                Timezone
              </label>
              <select
                value={data.timezone}
                onChange={(e) => setData({ ...data, timezone: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-blue-500"
              >
                {/* Group timezones by region */}
                {['USA', 'Europe', 'Middle East', 'Asia Pacific', 'Americas'].map(region => (
                  <optgroup key={region} label={`── ${region} ──`}>
                    {TIMEZONE_OPTIONS.filter(tz => tz.region === region).map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        );

      case 1: // Business Hours
        return (
          <div className="space-y-6">
            <p className="text-slate-400">
              Set your business hours. AI will handle after-hours calls differently.
            </p>

            <div className="space-y-3">
              {Object.entries(data.businessHours).map(([day, hours]) => (
                <div key={day} className="flex items-center gap-4 p-3 bg-slate-900/50 rounded-lg">
                  <label className="flex items-center gap-2 w-28">
                    <input
                      type="checkbox"
                      checked={hours.enabled}
                      onChange={(e) => setData({
                        ...data,
                        businessHours: {
                          ...data.businessHours,
                          [day]: { ...hours, enabled: e.target.checked }
                        }
                      })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-white capitalize">{day}</span>
                  </label>
                  
                  {hours.enabled && (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={hours.open}
                        onChange={(e) => setData({
                          ...data,
                          businessHours: {
                            ...data.businessHours,
                            [day]: { ...hours, open: e.target.value }
                          }
                        })}
                        className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-white text-sm"
                      />
                      <span className="text-slate-500">to</span>
                      <input
                        type="time"
                        value={hours.close}
                        onChange={(e) => setData({
                          ...data,
                          businessHours: {
                            ...data.businessHours,
                            [day]: { ...hours, close: e.target.value }
                          }
                        })}
                        className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-white text-sm"
                      />
                    </div>
                  )}
                  
                  {!hours.enabled && (
                    <span className="text-sm text-slate-500">Closed</span>
                  )}
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                After-Hours Message
              </label>
              <textarea
                value={data.afterHoursMessage}
                onChange={(e) => setData({ ...data, afterHoursMessage: e.target.value })}
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          </div>
        );

      case 2: // AI Receptionist
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Greeting Message
              </label>
              <textarea
                value={data.greeting}
                onChange={(e) => setData({ ...data, greeting: e.target.value })}
                rows={3}
                placeholder="Thank you for calling..."
                className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              />
              <p className="mt-2 text-xs text-slate-500">
                This is what callers will hear when they first connect.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                AI Voice <span className="text-slate-500 font-normal">(click to preview)</span>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {VOICE_OPTIONS.map(voice => (
                  <button
                    key={voice.id}
                    onClick={() => {
                      setData({ ...data, voiceId: voice.id });
                      playVoicePreview(voice.id);
                    }}
                    className={`
                      p-4 rounded-lg border text-left transition-all relative
                      ${data.voiceId === voice.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-white">{voice.name}</span>
                      {loadingVoice === voice.id ? (
                        <Loader2 size={16} className="text-blue-400 animate-spin" />
                      ) : playingVoice === voice.id ? (
                        <Square size={16} className="text-blue-400 fill-blue-400" />
                      ) : (
                        <Play size={16} className="text-slate-500" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{voice.description}</p>
                    {playingVoice === voice.id && (
                      <div className="absolute bottom-1 left-4 right-4 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 animate-pulse" style={{ width: '100%' }} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={16} className="text-purple-400" />
                <span className="text-sm font-medium text-white">AI Preview</span>
              </div>
              <p className="text-sm text-slate-400 italic">"{data.greeting}"</p>
            </div>
          </div>
        );

      case 3: // Phone Number
        return (
          <div className="space-y-6">
            <p className="text-slate-400">
              Get a dedicated phone number for your AI receptionist. You can skip this step and add a number later.
            </p>

            {/* Country Selector */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Country
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setData({ ...data, country: 'US', areaCode: '' })}
                  className={`flex-1 p-3 rounded-lg border transition-all ${
                    data.country === 'US'
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  🇺🇸 United States
                </button>
                <button
                  onClick={() => setData({ ...data, country: 'GB', areaCode: '' })}
                  className={`flex-1 p-3 rounded-lg border transition-all ${
                    data.country === 'GB'
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  🇬🇧 United Kingdom
                </button>
              </div>
            </div>

            {/* Area Code Search */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {data.country === 'US' ? 'Search by Area Code' : 'Search Numbers'}
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={data.areaCode}
                  onChange={(e) => setData({ ...data, areaCode: e.target.value.replace(/\D/g, '').slice(0, data.country === 'US' ? 3 : 5) })}
                  placeholder={data.country === 'US' ? 'e.g. 415' : 'e.g. 20 (London)'}
                  maxLength={data.country === 'US' ? 3 : 5}
                  className="flex-1 px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <Button 
                  onClick={searchPhoneNumbers} 
                  disabled={searchingNumbers || (data.country === 'US' && data.areaCode.length !== 3)}
                >
                  {searchingNumbers ? <Loader2 size={18} className="animate-spin" /> : 'Search'}
                </Button>
              </div>
              {data.country === 'GB' && (
                <p className="mt-2 text-xs text-slate-500">
                  UK numbers support voice and fax. Leave empty to see all available numbers.
                </p>
              )}
            </div>

            {/* Error Message */}
            {phoneSearchError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400">{phoneSearchError}</p>
              </div>
            )}

            {/* Available Numbers */}
            {availableNumbers.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <p className="text-sm text-slate-400">{availableNumbers.length} numbers found</p>
                {availableNumbers.map(num => (
                  <div
                    key={num.number}
                    className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700"
                  >
                    <div>
                      <p className="font-medium text-white">{num.number}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {num.locality && (
                          <span className="text-xs text-slate-500">{num.locality}</span>
                        )}
                        {num.region && (
                          <span className="text-xs text-slate-500">• {num.region}</span>
                        )}
                      </div>
                      {num.capabilities && (
                        <div className="flex gap-1 mt-1">
                          {num.capabilities.voice && <Badge variant="success" className="text-[10px] px-1 py-0">Voice</Badge>}
                          {num.capabilities.SMS && <Badge variant="default" className="text-[10px] px-1 py-0">SMS</Badge>}
                          {num.capabilities.MMS && <Badge variant="default" className="text-[10px] px-1 py-0">MMS</Badge>}
                          {num.capabilities.fax && <Badge variant="default" className="text-[10px] px-1 py-0">Fax</Badge>}
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={() => handleAddPhoneNumber(num.number)}
                      disabled={saving}
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : 'Select'}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleSkipPhone}
              className="w-full p-3 rounded-lg border border-dashed border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300 transition-colors"
            >
              Skip for now — I'll add a number later
            </button>
          </div>
        );

      case 4: // Test
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
              <CheckCircle size={40} className="text-emerald-400" />
            </div>

            <div>
              <h3 className="text-xl font-semibold text-white mb-2">
                You're all set! 🎉
              </h3>
              <p className="text-slate-400">
                Your AI receptionist is configured and ready to answer calls.
              </p>
            </div>

            {data.phoneNumber ? (
              <div className="p-4 bg-slate-900/50 rounded-lg">
                <p className="text-sm text-slate-400 mb-1">Your phone number</p>
                <p className="text-2xl font-bold text-white">{data.phoneNumber}</p>
              </div>
            ) : (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-sm text-amber-400">
                  No phone number added yet. Add one from the Phone Numbers page to start receiving calls.
                </p>
              </div>
            )}

            {data.phoneNumber && (
              <div className="space-y-3">
                <p className="text-sm text-slate-400">
                  Try calling your number to test the AI receptionist
                </p>
                <Button
                  onClick={handleTestCall}
                  disabled={testCallStatus === 'calling'}
                  variant={testCallStatus === 'success' ? 'secondary' : 'primary'}
                >
                  {testCallStatus === 'calling' && <Loader2 size={18} className="animate-spin" />}
                  {testCallStatus === 'success' && <CheckCircle size={18} />}
                  {testCallStatus === 'idle' && <Play size={18} />}
                  {testCallStatus === 'idle' && 'Make Test Call'}
                  {testCallStatus === 'calling' && 'Calling...'}
                  {testCallStatus === 'success' && 'Test Complete!'}
                  {testCallStatus === 'failed' && 'Try Again'}
                </Button>
              </div>
            )}

            <div className="pt-4">
              <Button onClick={handleComplete} className="w-full">
                Go to Dashboard
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-white mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Phone size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold">HEKAX Phone</span>
          </div>
          <p className="text-slate-400">Let's get you set up</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isComplete = index < currentStep;

            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center transition-all
                      ${isComplete ? 'bg-emerald-500' : isActive ? 'bg-blue-500' : 'bg-slate-700'}
                    `}
                  >
                    {isComplete ? (
                      <CheckCircle size={20} className="text-white" />
                    ) : (
                      <Icon size={20} className={isActive ? 'text-white' : 'text-slate-400'} />
                    )}
                  </div>
                  <span className={`text-xs mt-2 ${isActive ? 'text-white' : 'text-slate-500'}`}>
                    {step.title}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={`w-12 h-0.5 mx-2 ${isComplete ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-6">
            {STEPS[currentStep].title}
          </h2>
          {renderStepContent()}
        </Card>

        {/* Navigation */}
        {currentStep < STEPS.length - 1 && (
          <div className="flex justify-between">
            <Button
              variant="secondary"
              onClick={handleBack}
              disabled={currentStep === 0}
            >
              <ChevronLeft size={18} />
              Back
            </Button>
            <Button
              onClick={handleNext}
              disabled={saving || (currentStep === 0 && !data.companyName)}
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : null}
              {currentStep === 3 ? 'Skip' : 'Continue'}
              <ChevronRight size={18} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
