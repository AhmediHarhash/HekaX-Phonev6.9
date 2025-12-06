// ============================================================================
// HEKAX Phone - AI Training Page
// Manage FAQs, scripts, and custom responses for AI training
// ============================================================================

import { useState, useEffect } from 'react';
import {
  Brain,
  HelpCircle,
  FileText,
  MessageCircle,
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Upload,
  Download,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Card, LoadingSpinner } from '../components/common';
import { api } from '../utils/api';

// Types
interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  priority: number;
  keywords: string[];
}

interface Script {
  id: string;
  name: string;
  description?: string;
  scenario: string;
  script: string;
  isActive: boolean;
}

interface CustomResponse {
  id: string;
  triggerPhrase: string;
  response: string;
  matchType: string;
  isActive: boolean;
}

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  source?: string;
  sourceUrl?: string;
}

interface TrainingData {
  faqs: FAQ[];
  scripts: Script[];
  responses: CustomResponse[];
  knowledgeBase: KnowledgeEntry[];
}

interface TrainingStats {
  faqs: number;
  scripts: number;
  customResponses: number;
  knowledgeEntries: number;
  totalEntries: number;
}

type TabType = 'faqs' | 'scripts' | 'responses' | 'knowledge';

export function AITrainingPage() {
  const [activeTab, setActiveTab] = useState<TabType>('faqs');
  const [data, setData] = useState<TrainingData | null>(null);
  const [stats, setStats] = useState<TrainingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [trainingData, trainingStats] = await Promise.all([
        api.get<TrainingData>('/api/training'),
        api.get<TrainingStats>('/api/training/stats'),
      ]);
      setData(trainingData);
      setStats(trainingStats);
    } catch (err) {
      console.error('Failed to fetch training data:', err);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'faqs' as TabType, label: 'FAQs', icon: HelpCircle, count: stats?.faqs || 0 },
    { id: 'scripts' as TabType, label: 'Scripts', icon: FileText, count: stats?.scripts || 0 },
    { id: 'responses' as TabType, label: 'Responses', icon: MessageCircle, count: stats?.customResponses || 0 },
    { id: 'knowledge' as TabType, label: 'Knowledge', icon: BookOpen, count: stats?.knowledgeEntries || 0 },
  ];

  if (loading) {
    return <LoadingSpinner text="Loading training data..." />;
  }

  return (
    <div>
      <PageHeader
        title="AI Training"
        subtitle="Train your AI with FAQs, scripts, and custom responses"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        }
      />

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`p-4 rounded-xl transition-all ${
              activeTab === tab.id
                ? 'bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/30'
                : 'bg-slate-800/50 hover:bg-slate-800 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                activeTab === tab.id ? 'bg-purple-500/20' : 'bg-slate-700'
              }`}>
                <tab.icon size={20} className={activeTab === tab.id ? 'text-purple-400' : 'text-slate-400'} />
              </div>
              <div className="text-left">
                <p className="text-2xl font-bold text-white">{tab.count}</p>
                <p className="text-xs text-slate-400">{tab.label}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full pl-11 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Content */}
      {activeTab === 'faqs' && (
        <FAQsSection
          faqs={data?.faqs || []}
          search={search}
          onRefresh={fetchData}
        />
      )}
      {activeTab === 'scripts' && (
        <ScriptsSection
          scripts={data?.scripts || []}
          search={search}
          onRefresh={fetchData}
        />
      )}
      {activeTab === 'responses' && (
        <ResponsesSection
          responses={data?.responses || []}
          search={search}
          onRefresh={fetchData}
        />
      )}
      {activeTab === 'knowledge' && (
        <KnowledgeSection
          entries={data?.knowledgeBase || []}
          search={search}
          onRefresh={fetchData}
        />
      )}
    </div>
  );
}

// FAQs Section
interface FAQsSectionProps {
  faqs: FAQ[];
  search: string;
  onRefresh: () => void;
}

function FAQsSection({ faqs, search, onRefresh }: FAQsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQ | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(search.toLowerCase()) ||
      faq.answer.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async (faq: Partial<FAQ>) => {
    try {
      if (editingFaq) {
        await api.put(`/api/training/faqs/${editingFaq.id}`, faq);
      } else {
        await api.post('/api/training/faqs', faq);
      }
      setShowForm(false);
      setEditingFaq(null);
      onRefresh();
    } catch (err) {
      console.error('Failed to save FAQ:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this FAQ?')) return;
    try {
      await api.delete(`/api/training/faqs/${id}`);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete FAQ:', err);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-slate-400 text-sm">{filtered.length} FAQs</p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-white font-medium hover:from-blue-500 hover:to-purple-500 transition-all"
        >
          <Plus size={18} />
          Add FAQ
        </button>
      </div>

      {showForm && (
        <FAQForm
          faq={editingFaq}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditingFaq(null);
          }}
        />
      )}

      <div className="space-y-3">
        {filtered.map((faq) => (
          <Card key={faq.id} className="!p-0 overflow-hidden">
            <button
              onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-700/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{faq.question}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-0.5 bg-slate-700 rounded text-slate-400">
                    {faq.category}
                  </span>
                  {faq.priority > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                      Priority: {faq.priority}
                    </span>
                  )}
                </div>
              </div>
              {expandedId === faq.id ? (
                <ChevronDown size={20} className="text-slate-400" />
              ) : (
                <ChevronRight size={20} className="text-slate-400" />
              )}
            </button>
            {expandedId === faq.id && (
              <div className="px-4 pb-4 border-t border-slate-700">
                <p className="text-slate-300 text-sm mt-3 whitespace-pre-wrap">{faq.answer}</p>
                {faq.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {faq.keywords.map((kw, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => {
                      setEditingFaq(faq);
                      setShowForm(true);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(faq.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            )}
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-slate-500 py-8">No FAQs found</p>
        )}
      </div>
    </div>
  );
}

// FAQ Form
interface FAQFormProps {
  faq: FAQ | null;
  onSave: (faq: Partial<FAQ>) => void;
  onCancel: () => void;
}

function FAQForm({ faq, onSave, onCancel }: FAQFormProps) {
  const [question, setQuestion] = useState(faq?.question || '');
  const [answer, setAnswer] = useState(faq?.answer || '');
  const [category, setCategory] = useState(faq?.category || 'general');
  const [priority, setPriority] = useState(faq?.priority || 0);
  const [keywords, setKeywords] = useState(faq?.keywords.join(', ') || '');

  return (
    <Card className="mb-4">
      <h4 className="text-lg font-semibold text-white mb-4">
        {faq ? 'Edit FAQ' : 'New FAQ'}
      </h4>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Question</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What question will this answer?"
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Answer</label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="The AI's response to this question..."
            rows={4}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g., pricing, hours, services"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Priority (0-10)</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
              min={0}
              max={10}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Keywords (comma-separated)</label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="price, cost, fee, payment"
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                question,
                answer,
                category,
                priority,
                keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
              })
            }
            disabled={!question || !answer}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
          >
            <Save size={18} />
            Save
          </button>
        </div>
      </div>
    </Card>
  );
}

// Scripts Section
interface ScriptsSectionProps {
  scripts: Script[];
  search: string;
  onRefresh: () => void;
}

function ScriptsSection({ scripts, search, onRefresh }: ScriptsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | null>(null);

  const filtered = scripts.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.scenario.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async (script: Partial<Script>) => {
    try {
      if (editingScript) {
        await api.put(`/api/training/scripts/${editingScript.id}`, script);
      } else {
        await api.post('/api/training/scripts', script);
      }
      setShowForm(false);
      setEditingScript(null);
      onRefresh();
    } catch (err) {
      console.error('Failed to save script:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this script?')) return;
    try {
      await api.delete(`/api/training/scripts/${id}`);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete script:', err);
    }
  };

  const toggleActive = async (script: Script) => {
    try {
      await api.put(`/api/training/scripts/${script.id}`, {
        ...script,
        isActive: !script.isActive,
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to toggle script:', err);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-slate-400 text-sm">{filtered.length} Scripts</p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-white font-medium hover:from-blue-500 hover:to-purple-500 transition-all"
        >
          <Plus size={18} />
          Add Script
        </button>
      </div>

      {showForm && (
        <ScriptForm
          script={editingScript}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditingScript(null);
          }}
        />
      )}

      <div className="space-y-3">
        {filtered.map((script) => (
          <Card key={script.id}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h4 className="text-white font-medium">{script.name}</h4>
                  <button
                    onClick={() => toggleActive(script)}
                    className={`p-1 rounded ${script.isActive ? 'text-emerald-400' : 'text-slate-500'}`}
                  >
                    {script.isActive ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                  </button>
                </div>
                {script.description && (
                  <p className="text-sm text-slate-400 mt-1">{script.description}</p>
                )}
                <div className="mt-3 p-3 bg-slate-700/50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">When:</p>
                  <p className="text-sm text-slate-300">{script.scenario}</p>
                </div>
                <div className="mt-2 p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                  <p className="text-xs text-purple-400 mb-1">Response:</p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{script.script}</p>
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => {
                    setEditingScript(script);
                    setShowForm(true);
                  }}
                  className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(script.id)}
                  className="p-2 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-slate-500 py-8">No scripts found</p>
        )}
      </div>
    </div>
  );
}

// Script Form
interface ScriptFormProps {
  script: Script | null;
  onSave: (script: Partial<Script>) => void;
  onCancel: () => void;
}

function ScriptForm({ script, onSave, onCancel }: ScriptFormProps) {
  const [name, setName] = useState(script?.name || '');
  const [description, setDescription] = useState(script?.description || '');
  const [scenario, setScenario] = useState(script?.scenario || '');
  const [scriptContent, setScriptContent] = useState(script?.script || '');

  return (
    <Card className="mb-4">
      <h4 className="text-lg font-semibold text-white mb-4">
        {script ? 'Edit Script' : 'New Script'}
      </h4>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Appointment Booking"
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">When to use (scenario)</label>
          <textarea
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            placeholder="Describe when this script should be used..."
            rows={2}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Script Content</label>
          <textarea
            value={scriptContent}
            onChange={(e) => setScriptContent(e.target.value)}
            placeholder="The AI's response or conversation flow..."
            rows={6}
            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300">
            Cancel
          </button>
          <button
            onClick={() => onSave({ name, description, scenario, script: scriptContent })}
            disabled={!name || !scenario || !scriptContent}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium disabled:opacity-50"
          >
            <Save size={18} />
            Save
          </button>
        </div>
      </div>
    </Card>
  );
}

// Responses Section (simplified for brevity)
interface ResponsesSectionProps {
  responses: CustomResponse[];
  search: string;
  onRefresh: () => void;
}

function ResponsesSection({ responses, search, onRefresh }: ResponsesSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingResponse, setEditingResponse] = useState<CustomResponse | null>(null);
  const [triggerPhrase, setTriggerPhrase] = useState('');
  const [response, setResponse] = useState('');
  const [matchType, setMatchType] = useState('contains');

  const filtered = responses.filter(
    (r) =>
      r.triggerPhrase.toLowerCase().includes(search.toLowerCase()) ||
      r.response.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    try {
      if (editingResponse) {
        await api.put(`/api/training/responses/${editingResponse.id}`, { triggerPhrase, response, matchType });
      } else {
        await api.post('/api/training/responses', { triggerPhrase, response, matchType });
      }
      setShowForm(false);
      setEditingResponse(null);
      setTriggerPhrase('');
      setResponse('');
      onRefresh();
    } catch (err) {
      console.error('Failed to save response:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this response?')) return;
    try {
      await api.delete(`/api/training/responses/${id}`);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete response:', err);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-slate-400 text-sm">{filtered.length} Custom Responses</p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-white font-medium"
        >
          <Plus size={18} />
          Add Response
        </button>
      </div>

      {showForm && (
        <Card className="mb-4">
          <h4 className="text-lg font-semibold text-white mb-4">
            {editingResponse ? 'Edit Response' : 'New Custom Response'}
          </h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Trigger Phrase</label>
              <input
                type="text"
                value={triggerPhrase}
                onChange={(e) => setTriggerPhrase(e.target.value)}
                placeholder="When caller says..."
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Match Type</label>
              <select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              >
                <option value="contains">Contains</option>
                <option value="exact">Exact Match</option>
                <option value="regex">Regex</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Response</label>
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="AI should respond with..."
                rows={3}
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white resize-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowForm(false); setEditingResponse(null); }} className="px-4 py-2 bg-slate-700 rounded-lg text-slate-300">
                Cancel
              </button>
              <button onClick={handleSave} disabled={!triggerPhrase || !response} className="px-4 py-2 bg-blue-600 rounded-lg text-white font-medium disabled:opacity-50">
                Save
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">{r.matchType}</span>
                  <span className={`w-2 h-2 rounded-full ${r.isActive ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                </div>
                <p className="text-white mt-2">"{r.triggerPhrase}"</p>
                <p className="text-sm text-slate-400 mt-1">→ {r.response}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditingResponse(r); setTriggerPhrase(r.triggerPhrase); setResponse(r.response); setMatchType(r.matchType); setShowForm(true); }} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => handleDelete(r.id)} className="p-2 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-slate-500 py-8">No custom responses</p>}
      </div>
    </div>
  );
}

// Knowledge Section (simplified)
interface KnowledgeSectionProps {
  entries: KnowledgeEntry[];
  search: string;
  onRefresh: () => void;
}

function KnowledgeSection({ entries, search, onRefresh }: KnowledgeSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('general');

  const filtered = entries.filter(
    (e) =>
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.content.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    try {
      await api.post('/api/training/knowledge', { title, content, category });
      setShowForm(false);
      setTitle('');
      setContent('');
      onRefresh();
    } catch (err) {
      console.error('Failed to save knowledge entry:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await api.delete(`/api/training/knowledge/${id}`);
      onRefresh();
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-slate-400 text-sm">{filtered.length} Knowledge Entries</p>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg text-white font-medium">
          <Plus size={18} />
          Add Entry
        </button>
      </div>

      {showForm && (
        <Card className="mb-4">
          <h4 className="text-lg font-semibold text-white mb-4">New Knowledge Entry</h4>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Entry title" className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Category</label>
                <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g., products, policies" className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Content</label>
              <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Knowledge content..." rows={6} className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white resize-none" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-700 rounded-lg text-slate-300">Cancel</button>
              <button onClick={handleSave} disabled={!title || !content} className="px-4 py-2 bg-blue-600 rounded-lg text-white font-medium disabled:opacity-50">Save</button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((entry) => (
          <Card key={entry.id}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="text-white font-medium">{entry.title}</h4>
                <span className="text-xs px-2 py-0.5 bg-slate-700 rounded text-slate-400">{entry.category}</span>
              </div>
              <button onClick={() => handleDelete(entry.id)} className="p-1.5 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            </div>
            <p className="text-sm text-slate-400 line-clamp-4">{entry.content}</p>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-slate-500 py-8 col-span-2">No knowledge entries</p>}
      </div>
    </div>
  );
}
