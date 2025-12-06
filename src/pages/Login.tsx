// ============================================================================
// HEKAX Phone - Login & Signup Page
// ============================================================================

import { useState } from 'react';
import { Phone, Mail, Lock, Eye, EyeOff, User, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../utils/api';
import { STORAGE_KEYS } from '../utils/constants';

export function LoginPage() {
  const { login } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignup) {
        // Register new account - uses /auth/register endpoint
        const data = await authApi.register(orgName, email, password, name);
        
        // Store auth data with correct keys
        localStorage.setItem(STORAGE_KEYS.TOKEN, data.accessToken);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
        localStorage.setItem(STORAGE_KEYS.ORG, JSON.stringify(data.organization));
        
        // Redirect to dashboard (or onboarding if not completed)
        window.location.href = data.organization.onboardingCompleted ? '/' : '/onboarding';
      } else {
        // Login
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isSignup ? 'Signup failed' : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
            <Phone size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold">
            <span className="text-white">HEKAX</span>
            <span className="text-slate-400 font-light ml-2">Phone</span>
          </h1>
          <p className="text-slate-400 mt-2">
            {isSignup ? 'Create your account' : 'Sign in to your account'}
          </p>
        </div>

        {/* Form */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Signup-only fields */}
            {isSignup && (
              <>
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Your Name
                  </label>
                  <div className="relative">
                    <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      required
                      className="
                        w-full pl-10 pr-4 py-3 rounded-xl
                        bg-slate-900/50 border border-slate-700
                        text-white placeholder-slate-500
                        focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                        transition-colors
                      "
                    />
                  </div>
                </div>

                {/* Organization Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Company / Organization
                  </label>
                  <div className="relative">
                    <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Acme Inc"
                      required
                      className="
                        w-full pl-10 pr-4 py-3 rounded-xl
                        bg-slate-900/50 border border-slate-700
                        text-white placeholder-slate-500
                        focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                        transition-colors
                      "
                    />
                  </div>
                </div>
              </>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="
                    w-full pl-10 pr-4 py-3 rounded-xl
                    bg-slate-900/50 border border-slate-700
                    text-white placeholder-slate-500
                    focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                    transition-colors
                  "
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={isSignup ? 8 : undefined}
                  className="
                    w-full pl-10 pr-12 py-3 rounded-xl
                    bg-slate-900/50 border border-slate-700
                    text-white placeholder-slate-500
                    focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                    transition-colors
                  "
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {isSignup && (
                <p className="text-xs text-slate-500 mt-1">Minimum 8 characters</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="
                w-full py-3 rounded-xl font-semibold
                bg-blue-600 hover:bg-blue-700 text-white
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors
              "
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {isSignup ? 'Creating account...' : 'Signing in...'}
                </span>
              ) : (
                isSignup ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          {/* Toggle Login/Signup */}
          <div className="mt-6 pt-6 border-t border-slate-700/50 text-center">
            <p className="text-sm text-slate-400">
              {isSignup ? 'Already have an account?' : "Don't have an account?"}
              <button
                type="button"
                onClick={() => {
                  setIsSignup(!isSignup);
                  setError(null);
                }}
                className="ml-2 text-blue-400 hover:text-blue-300 font-medium"
              >
                {isSignup ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
