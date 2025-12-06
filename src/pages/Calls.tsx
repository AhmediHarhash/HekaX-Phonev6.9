// ============================================================================
// HEKAX Phone - Calls Page
// ============================================================================

import { useState, useEffect } from 'react';
import { 
  Search, 
  PhoneIncoming, 
  Phone,
  Play,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Card, LoadingSpinner, AIBadge, HumanBadge, EmptyState, Badge, AudioPlayer } from '../components/common';
import { callsApi, type CallDetailsResponse } from '../utils/api';
import { formatDuration, formatRelativeTime, formatDateTime } from '../utils/formatters';
import type { CallRecord, TranscriptRecord } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type CallFilter = 'all' | 'ai' | 'human';

export function CallsPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CallFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [callDetails, setCallDetails] = useState<CallDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchCalls();
  }, []);

  const fetchCalls = async () => {
    try {
      setLoading(true);
      const data = await callsApi.list({ limit: 50 });
      setCalls(data);
    } catch (err) {
      console.error('Calls fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCall = async (call: CallRecord) => {
    setSelectedCall(call);
    setDetailsLoading(true);
    
    try {
      const details = await callsApi.get(call.id);
      setCallDetails(details);
    } catch (err) {
      console.error('Call details fetch error:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Filter calls
  const filteredCalls = calls.filter(call => {
    // Filter by handler type
    if (filter === 'ai' && !call.handledByAI) return false;
    if (filter === 'human' && call.handledByAI) return false;
    
    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        call.fromNumber.toLowerCase().includes(search) ||
        call.toNumber.toLowerCase().includes(search)
      );
    }
    
    return true;
  });

  if (loading) {
    return <LoadingSpinner text="Loading calls..." />;
  }

  return (
    <div>
      <PageHeader 
        title="Call History" 
        subtitle={`${calls.length} total calls`}
        actions={
          <button 
            onClick={fetchCalls}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            <RefreshCw size={18} />
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Search */}
        <div className="flex-1 min-w-[200px] max-w-md relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by phone number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="
              w-full pl-10 pr-4 py-2.5 rounded-lg
              bg-slate-800 border border-slate-700
              text-white placeholder-slate-500
              focus:outline-none focus:border-blue-500
            "
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2">
          {(['all', 'ai', 'human'] as CallFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`
                px-4 py-2.5 rounded-lg font-medium text-sm capitalize
                transition-colors border
                ${filter === f
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-blue-500'
                }
              `}
            >
              {f === 'ai' ? 'AI Handled' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calls List */}
        <div className="lg:col-span-2 space-y-2">
          {filteredCalls.length === 0 ? (
            <Card>
              <EmptyState 
                icon={<Phone size={24} />}
                title="No calls found"
                description={searchTerm ? 'Try a different search term' : 'Calls will appear here'}
              />
            </Card>
          ) : (
            filteredCalls.map(call => (
              <div
                key={call.id}
                onClick={() => handleSelectCall(call)}
                className={`
                  flex items-center gap-4 p-4 rounded-xl cursor-pointer
                  border transition-all
                  ${selectedCall?.id === call.id
                    ? 'bg-blue-500/10 border-blue-500/50'
                    : 'bg-slate-800/50 border-slate-700/50 hover:border-blue-500/30'
                  }
                `}
              >
                {/* Direction Icon */}
                <div 
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    ${call.direction === 'INBOUND' 
                      ? 'bg-emerald-500/10 text-emerald-400' 
                      : 'bg-blue-500/10 text-blue-400'
                    }
                  `}
                >
                  {call.direction === 'INBOUND' 
                    ? <PhoneIncoming size={18} /> 
                    : <Phone size={18} />
                  }
                </div>

                {/* Call Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">
                    {call.direction === 'INBOUND' ? call.fromNumber : call.toNumber}
                  </p>
                  <p className="text-sm text-slate-500">
                    {formatRelativeTime(call.createdAt)}
                  </p>
                </div>

                {/* Duration */}
                <span className="text-sm text-slate-400">
                  {formatDuration(call.duration)}
                </span>

                {/* Handler Badge */}
                <div className="w-16 text-right">
                  {call.handledByAI ? <AIBadge /> : <HumanBadge />}
                </div>

                {/* Recording Indicator */}
                {call.recordingUrl && (
                  <div className="w-6 text-emerald-400" title="Has recording">
                    <Play size={16} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Call Details Panel */}
        <div className="lg:col-span-1">
          {selectedCall ? (
            <Card className="sticky top-6">
              <h3 className="text-lg font-semibold text-white mb-4">Call Details</h3>
              
              {detailsLoading ? (
                <LoadingSpinner size="sm" />
              ) : (
                <div className="space-y-4">
                  <DetailRow label="Direction" value={selectedCall.direction} />
                  <DetailRow label="From" value={selectedCall.fromNumber} />
                  <DetailRow label="To" value={selectedCall.toNumber} />
                  <DetailRow label="Duration" value={formatDuration(selectedCall.duration)} />
                  <DetailRow label="Status" value={selectedCall.status} />
                  <DetailRow 
                    label="Handled By" 
                    value={selectedCall.handledByAI ? 'AI Receptionist' : 'Human Agent'} 
                  />
                  <DetailRow label="Date" value={formatDateTime(selectedCall.createdAt)} />

                  {/* Transcript */}
                  {callDetails?.transcript && (
                    <div className="pt-4 border-t border-slate-700">
                      <h4 className="font-medium text-white mb-2">Transcript</h4>
                      
                      {callDetails.transcript.summary && (
                        <div className="p-3 bg-slate-900/50 rounded-lg mb-3">
                          <span className="text-xs text-slate-500 block mb-1">Summary</span>
                          <p className="text-sm text-slate-300">
                            {callDetails.transcript.summary}
                          </p>
                        </div>
                      )}

                      <div className="p-3 bg-slate-900/50 rounded-lg max-h-48 overflow-y-auto">
                        <pre className="text-xs text-slate-400 whitespace-pre-wrap">
                          {callDetails.transcript.fullText}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Audio Player for Recording */}
                  {selectedCall.recordingUrl && (
                    <div className="pt-4 border-t border-slate-700">
                      <h4 className="font-medium text-white mb-3">Call Recording</h4>
                      <AudioPlayer
                        src={`${selectedCall.recordingUrl}.mp3`}
                        title={`Call from ${selectedCall.fromNumber}`}
                        duration={selectedCall.duration}
                      />
                    </div>
                  )}
                </div>
              )}
            </Card>
          ) : (
            <Card className="text-center text-slate-500 py-12">
              <Phone size={32} className="mx-auto mb-3 opacity-50" />
              <p>Select a call to view details</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper component for detail rows
function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <span className="text-xs text-slate-500 uppercase block mb-0.5">{label}</span>
      <span className="text-sm text-white">{value || '-'}</span>
    </div>
  );
}
