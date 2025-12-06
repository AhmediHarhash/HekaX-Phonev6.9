// ============================================================================
// HEKAX Phone - AI Feedback Panel
// Component for reviewing AI responses and providing feedback
// ============================================================================

import { useState } from 'react';
import {
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Star,
  Send,
  X,
  AlertCircle,
  CheckCircle,
  Lightbulb,
} from 'lucide-react';
import { api } from '../../utils/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface AIFeedbackPanelProps {
  callId: string;
  transcriptId?: string;
  messages: Message[];
  onFeedbackSubmitted?: () => void;
}

type FeedbackType = 'correction' | 'rating' | 'suggestion';
type FeedbackCategory = 'accuracy' | 'tone' | 'completeness' | 'relevance' | 'timing' | 'other';

export function AIFeedbackPanel({
  callId,
  transcriptId,
  messages,
  onFeedbackSubmitted,
}: AIFeedbackPanelProps) {
  const [selectedMessage, setSelectedMessage] = useState<number | null>(null);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('rating');
  const [rating, setRating] = useState<number>(0);
  const [category, setCategory] = useState<FeedbackCategory>('accuracy');
  const [correctedResponse, setCorrectedResponse] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const aiMessages = messages
    .map((msg, index) => ({ ...msg, index }))
    .filter((msg) => msg.role === 'assistant');

  const handleSubmit = async () => {
    if (selectedMessage === null) {
      setError('Please select an AI response to provide feedback on');
      return;
    }

    if (feedbackType === 'rating' && rating === 0) {
      setError('Please select a rating');
      return;
    }

    if (feedbackType === 'correction' && !correctedResponse.trim()) {
      setError('Please provide the corrected response');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      await api.post('/api/feedback', {
        callId,
        transcriptId,
        messageIndex: selectedMessage,
        feedbackType: feedbackType.toUpperCase(),
        rating: feedbackType === 'rating' ? rating : undefined,
        category: category.toUpperCase(),
        originalResponse: messages[selectedMessage]?.content,
        correctedResponse: feedbackType === 'correction' ? correctedResponse : undefined,
        notes: notes || undefined,
      });

      setSubmitted(true);
      onFeedbackSubmitted?.();

      // Reset form after delay
      setTimeout(() => {
        setSelectedMessage(null);
        setRating(0);
        setCorrectedResponse('');
        setNotes('');
        setSubmitted(false);
      }, 2000);
    } catch (err) {
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 text-center">
        <CheckCircle size={48} className="mx-auto text-emerald-400 mb-3" />
        <h3 className="text-lg font-semibold text-white mb-1">Feedback Submitted</h3>
        <p className="text-sm text-slate-400">
          Thank you for helping improve the AI receptionist!
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
          <MessageSquare size={20} className="text-purple-400" />
        </div>
        <div>
          <h3 className="font-semibold text-white">AI Feedback</h3>
          <p className="text-sm text-slate-400">Help improve AI responses</p>
        </div>
      </div>

      {/* Feedback Type Selector */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFeedbackType('rating')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            feedbackType === 'rating'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              : 'bg-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          <Star size={16} />
          Rate
        </button>
        <button
          onClick={() => setFeedbackType('correction')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            feedbackType === 'correction'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          <Edit3 size={16} />
          Correct
        </button>
        <button
          onClick={() => setFeedbackType('suggestion')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            feedbackType === 'suggestion'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          <Lightbulb size={16} />
          Suggest
        </button>
      </div>

      {/* Message Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-400 mb-3">
          Select AI Response
        </label>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {aiMessages.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              No AI responses in this conversation
            </p>
          ) : (
            aiMessages.map((msg) => (
              <button
                key={msg.index}
                onClick={() => {
                  setSelectedMessage(msg.index);
                  if (feedbackType === 'correction') {
                    setCorrectedResponse(msg.content);
                  }
                }}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedMessage === msg.index
                    ? 'bg-purple-500/20 border border-purple-500/30'
                    : 'bg-slate-700/50 hover:bg-slate-700 border border-transparent'
                }`}
              >
                <p className="text-sm text-slate-300 line-clamp-2">{msg.content}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Rating Section */}
      {feedbackType === 'rating' && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-400 mb-3">
            How well did the AI respond?
          </label>
          <div className="flex gap-2 justify-center">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                onClick={() => setRating(value)}
                className={`p-3 rounded-lg transition-colors ${
                  rating >= value
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-slate-700 text-slate-500 hover:text-slate-400'
                }`}
              >
                <Star size={24} fill={rating >= value ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-slate-500 mt-2">
            {rating === 0 && 'Click to rate'}
            {rating === 1 && 'Poor - Needs significant improvement'}
            {rating === 2 && 'Below Average - Several issues'}
            {rating === 3 && 'Average - Acceptable'}
            {rating === 4 && 'Good - Minor improvements possible'}
            {rating === 5 && 'Excellent - Perfect response'}
          </p>
        </div>
      )}

      {/* Correction Section */}
      {feedbackType === 'correction' && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-400 mb-2">
            Correct Response
          </label>
          <textarea
            value={correctedResponse}
            onChange={(e) => setCorrectedResponse(e.target.value)}
            placeholder="Enter what the AI should have said..."
            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
            rows={4}
          />
        </div>
      )}

      {/* Category Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-400 mb-2">
          Category
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'accuracy', label: 'Accuracy' },
            { value: 'tone', label: 'Tone' },
            { value: 'completeness', label: 'Completeness' },
            { value: 'relevance', label: 'Relevance' },
            { value: 'timing', label: 'Timing' },
            { value: 'other', label: 'Other' },
          ].map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value as FeedbackCategory)}
              className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                category === cat.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-400 mb-2">
          Additional Notes (Optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional context or suggestions..."
          className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          rows={2}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={submitting || selectedMessage === null}
        className="w-full py-3 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send size={18} />
            Submit Feedback
          </>
        )}
      </button>
    </div>
  );
}

// Quick feedback buttons for inline use
interface QuickFeedbackProps {
  callId: string;
  messageIndex: number;
  originalResponse: string;
  onFeedback?: (type: 'positive' | 'negative') => void;
}

export function QuickFeedback({
  callId,
  messageIndex,
  originalResponse,
  onFeedback,
}: QuickFeedbackProps) {
  const [submitted, setSubmitted] = useState<'positive' | 'negative' | null>(null);

  const handleFeedback = async (type: 'positive' | 'negative') => {
    try {
      await api.post('/api/feedback', {
        callId,
        messageIndex,
        feedbackType: 'RATING',
        rating: type === 'positive' ? 5 : 1,
        category: 'ACCURACY',
        originalResponse,
      });
      setSubmitted(type);
      onFeedback?.(type);
    } catch (err) {
      console.error('Failed to submit quick feedback:', err);
    }
  };

  if (submitted) {
    return (
      <span className={`text-xs ${submitted === 'positive' ? 'text-emerald-400' : 'text-red-400'}`}>
        {submitted === 'positive' ? 'Marked helpful' : 'Marked for review'}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleFeedback('positive')}
        className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 transition-colors"
        title="Good response"
      >
        <ThumbsUp size={14} />
      </button>
      <button
        onClick={() => handleFeedback('negative')}
        className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
        title="Needs improvement"
      >
        <ThumbsDown size={14} />
      </button>
    </div>
  );
}
