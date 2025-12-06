// ============================================================================
// HEKAX Phone - Automation Management Page
// Manage automation rules, view logs, and access templates
// ============================================================================

import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  triggerEvent: string;
  conditions: Condition[];
  actions: Action[];
  enabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface Condition {
  field: string;
  operator: string;
  value: string | number | boolean;
}

interface Action {
  type: string;
  [key: string]: unknown;
}

interface AutomationLog {
  id: string;
  ruleName: string;
  triggerEvent: string;
  status: "SUCCESS" | "FAILED";
  error?: string;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  triggerEvent: string;
  conditions: Condition[];
  actions: Action[];
}

interface SchedulerJob {
  name: string;
  interval: number;
  intervalHuman: string;
}

type Tab = "rules" | "logs" | "templates" | "scheduler";

const EVENTS = [
  { key: "CALL_STARTED", value: "call:started", label: "Call Started" },
  { key: "CALL_COMPLETED", value: "call:completed", label: "Call Completed" },
  { key: "CALL_MISSED", value: "call:missed", label: "Call Missed" },
  { key: "LEAD_CREATED", value: "lead:created", label: "Lead Created" },
  { key: "LEAD_UPDATED", value: "lead:updated", label: "Lead Updated" },
  { key: "LEAD_STATUS_CHANGED", value: "lead:statusChanged", label: "Lead Status Changed" },
  { key: "APPOINTMENT_BOOKED", value: "appointment:booked", label: "Appointment Booked" },
  { key: "APPOINTMENT_REMINDER", value: "appointment:reminder", label: "Appointment Reminder" },
  { key: "APPOINTMENT_CANCELLED", value: "appointment:cancelled", label: "Appointment Cancelled" },
  { key: "APPOINTMENT_NO_SHOW", value: "appointment:noShow", label: "Appointment No-Show" },
  { key: "FEEDBACK_SUBMITTED", value: "feedback:submitted", label: "Feedback Submitted" },
  { key: "FEEDBACK_APPROVED", value: "feedback:approved", label: "Feedback Approved" },
  { key: "USAGE_THRESHOLD_80", value: "usage:threshold80", label: "Usage at 80%" },
  { key: "USAGE_THRESHOLD_90", value: "usage:threshold90", label: "Usage at 90%" },
  { key: "USAGE_LIMIT_REACHED", value: "usage:limitReached", label: "Usage Limit Reached" },
  { key: "TRIAL_ENDING_SOON", value: "trial:endingSoon", label: "Trial Ending Soon" },
  { key: "TRIAL_ENDED", value: "trial:ended", label: "Trial Ended" },
];

const ACTION_TYPES = [
  { type: "sendSms", label: "Send SMS", icon: "💬" },
  { type: "sendEmail", label: "Send Email", icon: "📧" },
  { type: "updateLead", label: "Update Lead", icon: "✏️" },
  { type: "assignLead", label: "Assign Lead", icon: "👤" },
  { type: "createTask", label: "Create Task", icon: "📋" },
  { type: "syncCrm", label: "Sync to CRM", icon: "🔄" },
  { type: "notify", label: "Send Notification", icon: "🔔" },
  { type: "webhook", label: "Call Webhook", icon: "🌐" },
  { type: "addToSequence", label: "Add to Sequence", icon: "📨" },
];

const OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Does Not Equal" },
  { value: "contains", label: "Contains" },
  { value: "greaterThan", label: "Greater Than" },
  { value: "lessThan", label: "Less Than" },
  { value: "exists", label: "Exists" },
  { value: "in", label: "In List" },
];

export function AutomationPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("rules");
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [schedulerJobs, setSchedulerJobs] = useState<SchedulerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  // Rule form state
  const [ruleName, setRuleName] = useState("");
  const [ruleDescription, setRuleDescription] = useState("");
  const [triggerEvent, setTriggerEvent] = useState("");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [priority, setPriority] = useState(0);

  const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

  useEffect(() => {
    if (activeTab === "rules") fetchRules();
    else if (activeTab === "logs") fetchLogs();
    else if (activeTab === "templates") fetchTemplates();
    else if (activeTab === "scheduler") fetchSchedulerStatus();
  }, [activeTab]);

  async function fetchRules() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/automation/rules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      console.error("Failed to fetch rules:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLogs() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/automation/logs?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTemplates() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/automation/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      console.error("Failed to fetch templates:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSchedulerStatus() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/automation/scheduler/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSchedulerJobs(data.jobs || []);
    } catch (err) {
      console.error("Failed to fetch scheduler status:", err);
    } finally {
      setLoading(false);
    }
  }

  function openRuleForm(rule?: AutomationRule) {
    if (rule) {
      setEditingRule(rule);
      setRuleName(rule.name);
      setRuleDescription(rule.description || "");
      setTriggerEvent(rule.triggerEvent);
      setConditions(rule.conditions || []);
      setActions(rule.actions || []);
      setPriority(rule.priority);
    } else {
      setEditingRule(null);
      setRuleName("");
      setRuleDescription("");
      setTriggerEvent("");
      setConditions([]);
      setActions([]);
      setPriority(0);
    }
    setShowRuleForm(true);
  }

  async function saveRule() {
    try {
      const url = editingRule
        ? `${API}/api/automation/rules/${editingRule.id}`
        : `${API}/api/automation/rules`;
      const method = editingRule ? "PUT" : "POST";

      await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: ruleName,
          description: ruleDescription,
          triggerEvent,
          conditions,
          actions,
          priority,
          enabled: true,
        }),
      });

      setShowRuleForm(false);
      fetchRules();
    } catch (err) {
      console.error("Failed to save rule:", err);
    }
  }

  async function deleteRule(id: string) {
    if (!confirm("Are you sure you want to delete this automation rule?")) return;

    try {
      await fetch(`${API}/api/automation/rules/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchRules();
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
  }

  async function toggleRule(rule: AutomationRule) {
    try {
      await fetch(`${API}/api/automation/rules/${rule.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...rule,
          enabled: !rule.enabled,
        }),
      });
      fetchRules();
    } catch (err) {
      console.error("Failed to toggle rule:", err);
    }
  }

  async function installTemplate(templateId: string) {
    try {
      await fetch(`${API}/api/automation/templates/${templateId}/install`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setActiveTab("rules");
      fetchRules();
    } catch (err) {
      console.error("Failed to install template:", err);
    }
  }

  async function runJob(jobName: string) {
    try {
      await fetch(`${API}/api/automation/scheduler/run/${jobName}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      alert(`Job "${jobName}" executed successfully!`);
    } catch (err) {
      console.error("Failed to run job:", err);
    }
  }

  function addCondition() {
    setConditions([...conditions, { field: "", operator: "equals", value: "" }]);
  }

  function updateCondition(index: number, field: keyof Condition, value: string) {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    setConditions(updated);
  }

  function removeCondition(index: number) {
    setConditions(conditions.filter((_, i) => i !== index));
  }

  function addAction(type: string) {
    setActions([...actions, { type }]);
  }

  function updateAction(index: number, field: string, value: unknown) {
    const updated = [...actions];
    updated[index] = { ...updated[index], [field]: value };
    setActions(updated);
  }

  function removeAction(index: number) {
    setActions(actions.filter((_, i) => i !== index));
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString();
  }

  function getEventLabel(eventValue: string) {
    return EVENTS.find((e) => e.value === eventValue)?.label || eventValue;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Automation</h1>
        <p className="text-gray-400">
          Create rules to automate workflows based on events
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-700 pb-4">
        {[
          { id: "rules", label: "Automation Rules", icon: "⚡" },
          { id: "logs", label: "Execution Logs", icon: "📜" },
          { id: "templates", label: "Templates", icon: "📦" },
          { id: "scheduler", label: "Scheduler", icon: "⏰" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Rules Tab */}
      {activeTab === "rules" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-white">
              Active Rules ({rules.length})
            </h2>
            <button
              onClick={() => openRuleForm()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + Create Rule
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : rules.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-12 text-center">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-lg font-medium text-white mb-2">
                No automation rules yet
              </h3>
              <p className="text-gray-400 mb-4">
                Create rules to automate actions when events occur
              </p>
              <button
                onClick={() => setActiveTab("templates")}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
              >
                Browse Templates
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className={`bg-gray-800 rounded-lg p-4 border ${
                    rule.enabled ? "border-gray-700" : "border-gray-700 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium text-white">{rule.name}</h3>
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            rule.enabled
                              ? "bg-green-600/20 text-green-400"
                              : "bg-gray-600/20 text-gray-400"
                          }`}
                        >
                          {rule.enabled ? "Active" : "Disabled"}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 rounded text-xs">
                          Priority: {rule.priority}
                        </span>
                      </div>
                      {rule.description && (
                        <p className="text-gray-400 text-sm mb-2">
                          {rule.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-500">
                          Trigger:{" "}
                          <span className="text-purple-400">
                            {getEventLabel(rule.triggerEvent)}
                          </span>
                        </span>
                        <span className="text-gray-500">
                          Conditions:{" "}
                          <span className="text-yellow-400">
                            {rule.conditions?.length || 0}
                          </span>
                        </span>
                        <span className="text-gray-500">
                          Actions:{" "}
                          <span className="text-green-400">
                            {rule.actions?.length || 0}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleRule(rule)}
                        className={`px-3 py-1 rounded text-sm ${
                          rule.enabled
                            ? "bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30"
                            : "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                        }`}
                      >
                        {rule.enabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => openRuleForm(rule)}
                        className="px-3 py-1 bg-gray-700 text-white rounded text-sm hover:bg-gray-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="px-3 py-1 bg-red-600/20 text-red-400 rounded text-sm hover:bg-red-600/30"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === "logs" && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Recent Executions
          </h2>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-12 text-center">
              <div className="text-4xl mb-4">📜</div>
              <h3 className="text-lg font-medium text-white mb-2">
                No execution logs yet
              </h3>
              <p className="text-gray-400">
                Logs will appear here when automation rules are triggered
              </p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                      Rule
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                      Trigger
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-300">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-750">
                      <td className="px-4 py-3 text-white">{log.ruleName}</td>
                      <td className="px-4 py-3 text-purple-400">
                        {getEventLabel(log.triggerEvent)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            log.status === "SUCCESS"
                              ? "bg-green-600/20 text-green-400"
                              : "bg-red-600/20 text-red-400"
                          }`}
                        >
                          {log.status}
                        </span>
                        {log.error && (
                          <span className="ml-2 text-xs text-red-400">
                            {log.error}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">
                        {formatDate(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === "templates" && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Pre-built Templates
          </h2>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="bg-gray-800 rounded-lg p-4 border border-gray-700"
                >
                  <h3 className="font-medium text-white mb-2">{template.name}</h3>
                  <p className="text-gray-400 text-sm mb-3">
                    {template.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-purple-400">
                      {getEventLabel(template.triggerEvent)}
                    </span>
                    <button
                      onClick={() => installTemplate(template.id)}
                      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                    >
                      Install
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scheduler Tab */}
      {activeTab === "scheduler" && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">
            Scheduled Jobs
          </h2>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : (
            <div className="space-y-4">
              {schedulerJobs.map((job) => (
                <div
                  key={job.name}
                  className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-medium text-white">
                      {job.name
                        .replace(/([A-Z])/g, " $1")
                        .replace(/^./, (s) => s.toUpperCase())}
                    </h3>
                    <p className="text-gray-400 text-sm">
                      Runs every {job.intervalHuman}
                    </p>
                  </div>
                  <button
                    onClick={() => runJob(job.name)}
                    className="px-3 py-1 bg-gray-700 text-white rounded text-sm hover:bg-gray-600"
                  >
                    Run Now
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rule Form Modal */}
      {showRuleForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">
                {editingRule ? "Edit Automation Rule" : "Create Automation Rule"}
              </h2>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Rule Name
                  </label>
                  <input
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="e.g., Welcome SMS for New Leads"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={ruleDescription}
                    onChange={(e) => setRuleDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    rows={2}
                    placeholder="What does this rule do?"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Trigger Event
                    </label>
                    <select
                      value={triggerEvent}
                      onChange={(e) => setTriggerEvent(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    >
                      <option value="">Select event...</option>
                      {EVENTS.map((event) => (
                        <option key={event.key} value={event.value}>
                          {event.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Priority
                    </label>
                    <input
                      type="number"
                      value={priority}
                      onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                      min="0"
                      max="100"
                    />
                  </div>
                </div>
              </div>

              {/* Conditions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-300">
                    Conditions (Optional)
                  </label>
                  <button
                    onClick={addCondition}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    + Add Condition
                  </button>
                </div>
                {conditions.length === 0 ? (
                  <p className="text-gray-500 text-sm">
                    No conditions - rule will trigger on every event
                  </p>
                ) : (
                  <div className="space-y-2">
                    {conditions.map((condition, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={condition.field}
                          onChange={(e) =>
                            updateCondition(index, "field", e.target.value)
                          }
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                          placeholder="Field (e.g., phone)"
                        />
                        <select
                          value={condition.operator}
                          onChange={(e) =>
                            updateCondition(index, "operator", e.target.value)
                          }
                          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                        >
                          {OPERATORS.map((op) => (
                            <option key={op.value} value={op.value}>
                              {op.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={condition.value as string}
                          onChange={(e) =>
                            updateCondition(index, "value", e.target.value)
                          }
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                          placeholder="Value"
                        />
                        <button
                          onClick={() => removeCondition(index)}
                          className="p-2 text-red-400 hover:text-red-300"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-300">
                    Actions
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                  {ACTION_TYPES.map((actionType) => (
                    <button
                      key={actionType.type}
                      onClick={() => addAction(actionType.type)}
                      className="px-3 py-1 bg-gray-700 text-gray-300 rounded text-sm hover:bg-gray-600"
                    >
                      {actionType.icon} {actionType.label}
                    </button>
                  ))}
                </div>
                {actions.length === 0 ? (
                  <p className="text-gray-500 text-sm">
                    Add at least one action to execute
                  </p>
                ) : (
                  <div className="space-y-3">
                    {actions.map((action, index) => (
                      <div
                        key={index}
                        className="bg-gray-700 rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-white font-medium">
                            {ACTION_TYPES.find((a) => a.type === action.type)
                              ?.icon || "⚡"}{" "}
                            {ACTION_TYPES.find((a) => a.type === action.type)
                              ?.label || action.type}
                          </span>
                          <button
                            onClick={() => removeAction(index)}
                            className="text-red-400 hover:text-red-300"
                          >
                            ✕
                          </button>
                        </div>

                        {action.type === "sendSms" && (
                          <>
                            <input
                              type="text"
                              value={(action.phoneField as string) || ""}
                              onChange={(e) =>
                                updateAction(index, "phoneField", e.target.value)
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                              placeholder="Phone field (e.g., phone, callerPhone)"
                            />
                            <textarea
                              value={(action.message as string) || ""}
                              onChange={(e) =>
                                updateAction(index, "message", e.target.value)
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                              rows={2}
                              placeholder="Message (use {{field}} for variables)"
                            />
                          </>
                        )}

                        {action.type === "sendEmail" && (
                          <>
                            <input
                              type="text"
                              value={(action.emailField as string) || ""}
                              onChange={(e) =>
                                updateAction(index, "emailField", e.target.value)
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                              placeholder="Email field"
                            />
                            <input
                              type="text"
                              value={(action.subject as string) || ""}
                              onChange={(e) =>
                                updateAction(index, "subject", e.target.value)
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                              placeholder="Subject"
                            />
                            <textarea
                              value={(action.body as string) || ""}
                              onChange={(e) =>
                                updateAction(index, "body", e.target.value)
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                              rows={3}
                              placeholder="Email body (HTML supported)"
                            />
                          </>
                        )}

                        {action.type === "notify" && (
                          <>
                            <input
                              type="text"
                              value={(action.title as string) || ""}
                              onChange={(e) =>
                                updateAction(index, "title", e.target.value)
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                              placeholder="Notification title"
                            />
                            <textarea
                              value={(action.message as string) || ""}
                              onChange={(e) =>
                                updateAction(index, "message", e.target.value)
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                              rows={2}
                              placeholder="Message"
                            />
                          </>
                        )}

                        {action.type === "webhook" && (
                          <>
                            <input
                              type="url"
                              value={(action.url as string) || ""}
                              onChange={(e) =>
                                updateAction(index, "url", e.target.value)
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                              placeholder="Webhook URL"
                            />
                            <select
                              value={(action.method as string) || "POST"}
                              onChange={(e) =>
                                updateAction(index, "method", e.target.value)
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                            >
                              <option value="POST">POST</option>
                              <option value="PUT">PUT</option>
                              <option value="PATCH">PATCH</option>
                            </select>
                          </>
                        )}

                        {action.type === "assignLead" && (
                          <select
                            value={(action.strategy as string) || "roundRobin"}
                            onChange={(e) =>
                              updateAction(index, "strategy", e.target.value)
                            }
                            className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                          >
                            <option value="roundRobin">Round Robin</option>
                            <option value="leastBusy">Least Busy</option>
                            <option value="specific">Specific Agent</option>
                          </select>
                        )}

                        {action.type === "createTask" && (
                          <>
                            <input
                              type="text"
                              value={(action.title as string) || ""}
                              onChange={(e) =>
                                updateAction(index, "title", e.target.value)
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                              placeholder="Task title"
                            />
                            <input
                              type="number"
                              value={(action.dueInHours as number) || ""}
                              onChange={(e) =>
                                updateAction(
                                  index,
                                  "dueInHours",
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                              placeholder="Due in hours"
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowRuleForm(false)}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={saveRule}
                disabled={!ruleName || !triggerEvent || actions.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingRule ? "Update Rule" : "Create Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
