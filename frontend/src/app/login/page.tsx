'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Brain, Eye, EyeOff, AlertCircle, Loader2, ChevronRight, Shield, Zap } from 'lucide-react';

// Role → home page routing
function getRoleHome(role: string): string {
  const r = role?.toUpperCase();
  if (r === 'STUDENT')                            return '/student';
  if (r === 'JOINT_SECRETARY' || r === 'PRINCIPAL') return '/dashboard';
  if (r === 'HOD')                                return '/dashboard';
  if (r === 'PLACEMENT_OFFICER')                  return '/placement';
  if (r === 'FACULTY')                            return '/dashboard';
  return '/dashboard';
}

const STAFF_ACCOUNTS = [
  { label:'Joint Secretary', u:'js',          p:'js123',        desc:'Institution-wide analytics',    icon:'🏛️', badge:'JOINT_SEC' },
  { label:'Principal',       u:'principal',   p:'principal123', desc:'Institution monitoring',        icon:'👩‍💼', badge:'PRINCIPAL' },
  { label:'HOD (CS)',        u:'hod',         p:'hod123',       desc:'Computer Science dept',         icon:'🎓', badge:'HOD' },
  { label:'Class Advisor',   u:'faculty',     p:'faculty123',   desc:'Faculty · Class Advisor',       icon:'👨‍🏫', badge:'FACULTY' },
  { label:'Mentor',          u:'mentor',      p:'mentor123',    desc:'Faculty · Mentor',              icon:'🧑‍🏫', badge:'MENTOR' },
  { label:'Placement Officer',u:'placement',  p:'placement123', desc:'Placement & Jobs management',  icon:'💼', badge:'PLACEMENT' },
  { label:'Quick Demo',      u:'admin',       p:'admin123',     desc:'Admin — full access',           icon:'⚡', badge:'ADMIN' },
];

const STUDENT_ACCOUNTS = [
  { label:'Initial Login Demo (Student@123)', u:'STU001', p:'Student@123', cgpa:'8.7', desc:'🔑 Demonstrates Forced First-Login Password Change', color:'text-amber-400 font-bold' },
  { label:'Arun Kumar',    u:'stu001', p:'stu001', cgpa:'8.7', desc:'✅ All eligible — CSE, no arrears', color:'text-emerald-400' },
  { label:'Priya Devi',    u:'stu002', p:'stu002', cgpa:'7.8', desc:'❌ 1 current arrear — ECE',          color:'text-amber-400'  },
  { label:'Ravi Shankar',  u:'stu003', p:'stu003', cgpa:'8.2', desc:'❌ Mechanical — ineligible stream',  color:'text-red-400'    },
  { label:'Lakshmi Reddy', u:'stu004', p:'stu004', cgpa:'7.5', desc:'❌ 2 historical arrears — CSE',      color:'text-orange-400' },
  { label:'Rahul Patel',   u:'stu005', p:'stu005', cgpa:'6.8', desc:'❌ CGPA 6.8 — below threshold',      color:'text-rose-400'   },
  { label:'Ananya Singh',  u:'stu006', p:'stu006', cgpa:'—',   desc:'⚠️  Missing academic data',          color:'text-slate-400'  },
  { label:'Karthik Nair',  u:'stu007', p:'stu007', cgpa:'8.5', desc:'✅ Eligible but missing Java skill', color:'text-blue-400'   },
];

export default function LoginPage() {
  const { login }  = useAuth();
  const router     = useRouter();
  const [u, setU]           = useState('');
  const [p, setP]           = useState('');
  const [show, setShow]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [tab, setTab]       = useState<'staff'|'student'>('staff');

  const doLogin = async (username: string, password: string) => {
    setError(''); setLoading(true);
    try {
      const userData = await login(username, password);
      router.replace(getRoleHome(userData.role));
    } catch {
      setError('Invalid credentials. Use the quick-access buttons below.');
    } finally { setLoading(false); }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (u && p) doLogin(u, p); };
  const quickLogin   = (username: string, password: string) => { setU(username); setP(password); doLogin(username, password); };

  return (
    <div className="min-h-screen bg-[#080d1a] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-0 left-1/3 w-[700px] h-[700px] bg-indigo-600/6 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-violet-600/6 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 left-0 w-[300px] h-[300px] bg-emerald-600/4 rounded-full blur-[80px] pointer-events-none" />

      <div className="w-full max-w-xl relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600/30 to-violet-600/20 border border-indigo-500/30 mb-4 shadow-xl shadow-indigo-500/10">
            <Brain className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Campus Pulse AI</h1>
          <p className="text-sm text-slate-500 mt-1">Student Success Decision Intelligence Platform</p>
        </div>

        {/* Login card */}
        <div className="bg-[#0d1526]/90 border border-slate-700/50 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-4 mb-5">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Username</label>
              <input
                id="username-input"
                value={u} onChange={e => setU(e.target.value)}
                placeholder="e.g. stu001, hod, placement..."
                autoComplete="username"
                className="w-full bg-[#0a1020] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Password</label>
              <div className="relative">
                <input
                  id="password-input"
                  value={p} onChange={e => setP(e.target.value)}
                  type={show ? 'text' : 'password'}
                  placeholder="Password"
                  autoComplete="current-password"
                  className="w-full bg-[#0a1020] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/70 focus:ring-1 focus:ring-indigo-500/30 transition-all pr-10"
                />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
              </div>
            )}
            <button
              id="login-submit-btn"
              type="submit" disabled={loading || !u || !p}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Quick access tabs */}
          <div className="border-t border-slate-800 pt-4">
            <p className="text-[10px] text-slate-500 text-center mb-3 uppercase tracking-wider">Quick Demo Access</p>
            <div className="flex gap-1 mb-3 bg-slate-800/50 rounded-lg p-0.5">
              {(['staff','student'] as const).map(t => (
                <button key={t} id={`tab-${t}`} onClick={() => setTab(t)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${tab===t?'bg-indigo-600 text-white':'text-slate-400 hover:text-slate-300'}`}>
                  {t === 'staff' ? '🏢 Staff & Faculty' : '🎓 Students (Test Cases)'}
                </button>
              ))}
            </div>

            {tab === 'staff' ? (
              <div className="grid grid-cols-2 gap-1.5">
                {STAFF_ACCOUNTS.map(a => (
                  <button key={a.u} id={`quick-${a.u}`} onClick={() => quickLogin(a.u, a.p)} disabled={loading}
                    className="text-left bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-indigo-500/40 rounded-xl p-2.5 transition-all group disabled:opacity-50">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm">{a.icon}</span>
                      <span className="text-xs font-semibold text-slate-200 truncate">{a.label}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 truncate">{a.desc}</p>
                    <span className="text-[9px] font-mono text-indigo-400/70 mt-0.5 inline-block">{a.u}/{a.p}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {STUDENT_ACCOUNTS.map(a => (
                  <button key={a.u} id={`quick-${a.u}`} onClick={() => quickLogin(a.u, a.p)} disabled={loading}
                    className="w-full text-left bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-indigo-500/40 rounded-xl px-3 py-2 transition-all flex items-center justify-between disabled:opacity-50">
                    <div>
                      <span className="text-xs font-semibold text-slate-200">{a.label}</span>
                      <p className={`text-[10px] mt-0.5 ${a.color}`}>{a.desc}</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className="text-[10px] font-mono text-slate-500">{a.u}/{a.p}</p>
                      {a.cgpa !== '—' && <p className="text-[10px] text-slate-600">CGPA {a.cgpa}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-700 mt-4">
          🔬 All student data is synthetic and labeled for demo purposes
        </p>
      </div>
    </div>
  );
}
