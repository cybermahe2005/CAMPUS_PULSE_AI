'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getToken, setToken, clearToken, login as apiLogin, getMe, changePassword as apiChangePassword } from '@/lib/api';
import { Lock, ShieldAlert, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export interface User {
  userId: string;
  name: string;
  role: string;
  department?: string;
  email?: string;
  responsibilities?: string[];
  mustChangePassword?: boolean;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  loading: true,
  login: async () => ({ userId: '', name: '', role: '' }),
  logout: () => {},
  refreshUser: async () => {},
});

// ── Modal for Initial Password Setup ──────────────────────────────────────────
function ForcedPasswordChangeModal({ user, onComplete }: { user: User; onComplete: () => void }) {
  const [oldP, setOldP] = useState('');
  const [newP, setNewP] = useState('');
  const [confP, setConfP] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newP !== confP) {
      setError('New passwords do not match');
      return;
    }
    if (newP.length < 8) {
      setError('New password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    try {
      await apiChangePassword(oldP || 'Student@123', newP);
      setSuccess(true);
      setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to update password. Verify your current password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0d1526] border border-amber-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-indigo-500 to-emerald-500" />
        
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">First-Time Login Setup</h3>
            <p className="text-xs text-slate-400">Security requirement for {user.name}</p>
          </div>
        </div>

        <p className="text-xs text-slate-300 mb-5 leading-relaxed bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
          Welcome to Campus Pulse AI! Because you signed in using initial or default credentials, institutional security policy requires you to set a personal password before accessing records.
        </p>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="text-center py-6 space-y-2">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <p className="text-sm font-semibold text-white">Password Updated Successfully!</p>
            <p className="text-xs text-slate-400">Accessing your dashboard...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Current Password (e.g. Student@123)</label>
              <input
                type="password"
                value={oldP}
                onChange={e => setOldP(e.target.value)}
                placeholder="Enter current / default password"
                required
                className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">New Password (min 8 chars, 1 number/symbol)</label>
              <input
                type="password"
                value={newP}
                onChange={e => setNewP(e.target.value)}
                placeholder="Enter new password"
                required
                className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confP}
                onChange={e => setConfP(e.target.value)}
                placeholder="Re-type new password"
                required
                className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold text-xs transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Set Password & Proceed
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const u = await getMe();
      setUser(u);
    } catch {
      clearToken();
      setUser(null);
    }
  };

  useEffect(() => {
    const tok = getToken();
    if (tok) {
      getMe()
        .then(u => { setUser(u); setLoading(false); })
        .catch(() => { clearToken(); setLoading(false); });
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string): Promise<User> => {
    const data = await apiLogin(username, password);
    setToken(data.access_token);
    const userInfo: User = {
      ...data.user,
      mustChangePassword: data.mustChangePassword ?? data.user.mustChangePassword,
    };
    setUser(userInfo);
    return userInfo;
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
      {user && user.mustChangePassword && (
        <ForcedPasswordChangeModal
          user={user}
          onComplete={() => {
            setUser({ ...user, mustChangePassword: false });
          }}
        />
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
