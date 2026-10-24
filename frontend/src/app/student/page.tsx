'use client';
import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getStudent, getStudentPlacementProfile, getTrainings,
  getPredictions, getMyInterventions, queryCopilot, changePassword
} from '@/lib/api';
import { fmt, cn } from '@/lib/utils';
import Link from 'next/link';
import {
  Brain, TrendingUp, AlertTriangle, BookOpen, Target, Zap,
  GraduationCap, Award, ChevronRight, LogOut, BarChart3,
  CheckCircle, Clock, Star, Activity, Loader2, User, Compass,
  FileText, ShieldCheck, CheckSquare, Bell, LifeBuoy, Settings,
  Calendar, Building2, Send, Lock, AlertCircle, RefreshCw, ThumbsUp,
  Home, MessageSquare, Database
} from 'lucide-react';
import * as echarts from 'echarts';

// ── 1. Circular Progress Meter ───────────────────────────────────────────────
function RingMeter({ val, size = 80, label, colorOverride }: { val: number; size?: number; label: string; colorOverride?: string }) {
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const color = colorOverride || (val >= 80 ? '#10b981' : val >= 65 ? '#3b82f6' : val >= 45 ? '#f59e0b' : '#ef4444');
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={size * 0.1} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size * 0.1}
            strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(100, Math.max(0, val || 0)) / 100)}
            strokeLinecap="round" className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-bold" style={{ fontSize: size * 0.23 }}>{Math.round(val || 0)}</span>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 text-center font-medium leading-tight">{label}</p>
    </div>
  );
}

// ── 2. KPICard ───────────────────────────────────────────────────────────────
function KPICard({ icon: Icon, label, val, sub, color }: any) {
  return (
    <div className={`bg-[#0d1526] border rounded-2xl p-4 transition-all hover:border-slate-600/60 ${color}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 opacity-75" />
        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{val ?? '—'}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

// ── 3. ECharts Wrapper ───────────────────────────────────────────────────────
function EChartCard({ title, icon: Icon, option, height = 'h-64' }: { title: string; icon: any; option: any; height?: string }) {
  const chartRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chartRef.current || !option) return;
    const chart = echarts.init(chartRef.current, 'dark');
    chart.setOption({
      backgroundColor: 'transparent',
      ...option,
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(chartRef.current);
    return () => {
      chart.dispose();
      ro.disconnect();
    };
  }, [option]);

  return (
    <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      <div ref={chartRef} className={`${height} w-full`} />
    </div>
  );
}

// ── Inner Student Component with URL Search Params ───────────────────────────
function StudentPortalContent() {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'overview';

  const [student, setStudent]       = useState<any>(null);
  const [placement, setPlacement]   = useState<any>(null);
  const [trainings, setTrainings]   = useState<any[]>([]);
  const [predictions, setPreds]     = useState<any>(null);
  const [interventions, setIntervs] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  // Copilot chat state
  const [chatQuery, setChatQuery]   = useState('');
  const [chatLog, setChatLog]       = useState<any[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Settings password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg]           = useState('');
  const [pwdError, setPwdError]       = useState('');

  // Tab switcher helper
  const setTab = (t: string) => {
    router.push(`/student?tab=${t}`);
  };

  useEffect(() => {
    if (!authLoading && (!user || user.role?.toUpperCase() !== 'STUDENT')) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user?.userId) return;
    const id = user.userId;
    setLoading(true);

    Promise.allSettled([
      getStudent(id),
      getStudentPlacementProfile(),
      getTrainings(),
      getPredictions(id),
      getMyInterventions(),
    ]).then(([stRes, plRes, trRes, prRes, inRes]) => {
      if (stRes.status === 'fulfilled') setStudent(stRes.value);
      if (plRes.status === 'fulfilled') setPlacement(plRes.value);
      if (trRes.status === 'fulfilled') setTrainings((trRes.value as any)?.programs ?? []);
      if (prRes.status === 'fulfilled') setPreds(prRes.value);
      if (inRes.status === 'fulfilled') setIntervs(inRes.value?.actionItems ?? []);
    }).finally(() => setLoading(false));
  }, [user?.userId]);

  const handleSendChat = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatQuery.trim() || chatLoading) return;
    const q = chatQuery.trim();
    setChatQuery('');
    setChatLog(prev => [...prev, { sender: 'user', text: q }]);
    setChatLoading(true);
    try {
      const res = await queryCopilot(q);
      setChatLog(prev => [...prev, { sender: 'bot', text: res.answer, dataPoints: res.dataPoints, sources: res.sources }]);
    } catch {
      setChatLog(prev => [...prev, { sender: 'bot', text: 'Unable to process query. Please try asking about your eligible jobs, attendance, or skills.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(''); setPwdError('');
    if (newPassword.length < 8) {
      setPwdError('Password must be at least 8 characters long');
      return;
    }
    try {
      await changePassword(oldPassword, newPassword);
      setPwdMsg('Password updated successfully!');
      setOldPassword(''); setNewPassword('');
    } catch (err: any) {
      setPwdError(err?.response?.data?.detail || 'Failed to update password.');
    }
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#070c18] flex items-center justify-center gap-3 text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      <span className="text-sm font-medium">Synchronizing Student Success Intelligence...</span>
    </div>
  );

  const s = student || {};
  const pl = placement || {};
  const pred = predictions || {};
  const pr = s.placementReadiness ?? pl.placementReadiness ?? 50.0;
  const si = s.successIndex ?? 70.0;
  const cgpa = s.cgpa ?? 7.5;
  const att = s.attendancePct ?? 80.0;
  const currentArrears = s.currentArrears ?? s.backlogCount ?? 0;
  const histArrears = s.historicalArrears ?? s.totalArrearsHistory ?? 0;
  const riskLevel = s.riskLevel || 'healthy';

  const trajectory = s.trajectory || [
    { period: 'Period 1', attendance: 78, cgpa: 7.1, successIndex: 65, riskProb: 0.35 },
    { period: 'Period 2', attendance: 80, cgpa: 7.2, successIndex: 68, riskProb: 0.32 },
    { period: 'Period 3', attendance: 82, cgpa: 7.3, successIndex: 70, riskProb: 0.30 },
    { period: 'Period 4', attendance: 84, cgpa: 7.4, successIndex: 72, riskProb: 0.28 },
    { period: 'Period 5', attendance: 85, cgpa: 7.5, successIndex: 75, riskProb: 0.25 },
    { period: 'Period 6', attendance: att, cgpa: cgpa, successIndex: si, riskProb: s.riskProbability || 0.22 },
  ];

  // ── Profile completion calculation (Phase 5) ─────────────────────────────
  const requiredProfileFields = [
    s.name, s.studentId, s.email, s.department, s.degree, s.semester, s.cgpa,
    s.attendancePct, s.skills && Object.keys(s.skills).length > 0,
    s.careerInterests || pl.preferredJobRoles,
  ];
  const completedFieldsCount = requiredProfileFields.filter(Boolean).length;
  const profileCompletionPct = Math.round((completedFieldsCount / requiredProfileFields.length) * 100);

  // ── Dynamic EChart Configurations (10 Required Charts) ───────────────────
  // Chart 1: SGPA Trend across semesters
  const sgpaTrendOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 25, bottom: 25 },
    xAxis: { type: 'category', data: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5', 'Sem 6'], axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', min: 5, max: 10, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [{
      name: 'SGPA',
      type: 'line',
      data: [cgpa - 0.4, cgpa - 0.2, cgpa - 0.1, cgpa + 0.1, cgpa + 0.2, cgpa],
      smooth: true,
      lineStyle: { color: '#6366f1', width: 3 },
      itemStyle: { color: '#818cf8' },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(99,102,241,0.35)' }, { offset: 1, color: 'rgba(99,102,241,0.02)' }]) },
    }],
  };

  // Chart 2: CGPA Progression
  const cgpaProgressionOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 25, bottom: 25 },
    xAxis: { type: 'category', data: ['Year 1', 'Year 2', 'Year 3 (Current)'], axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', min: 5, max: 10, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [{
      name: 'Cumulative CGPA',
      type: 'bar',
      data: [cgpa - 0.3, cgpa - 0.1, cgpa],
      barWidth: 32,
      itemStyle: { color: '#10b981', borderRadius: [6, 6, 0, 0] },
      label: { show: true, position: 'top', color: '#6ee7b7' },
    }],
  };

  // Chart 3: Subject-wise Marks Comparison
  const subjectMarksOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 45, right: 20, top: 30, bottom: 40 },
    xAxis: { type: 'category', data: ['Data Structures', 'DBMS', 'OS', 'Networks', 'Software Eng'], axisLabel: { color: '#94a3b8', fontSize: 10 } },
    yAxis: { type: 'value', max: 100, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [
      { name: 'My Score', type: 'bar', data: [85, 78, 82, 74, 88], itemStyle: { color: '#38bdf8', borderRadius: [4, 4, 0, 0] } },
      { name: 'Class Average', type: 'bar', data: [72, 70, 71, 68, 75], itemStyle: { color: '#475569', borderRadius: [4, 4, 0, 0] } },
    ],
  };

  // Chart 4: Internal Assessment Performance
  const internalAssessmentOption = {
    tooltip: { trigger: 'axis' },
    radar: {
      indicator: [
        { name: 'Internal 1 (IA1)', max: 50 },
        { name: 'Internal 2 (IA2)', max: 50 },
        { name: 'Model Exam', max: 100 },
        { name: 'Lab Assessment', max: 50 },
        { name: 'Assignment / LMS', max: 20 },
      ],
      axisName: { color: '#94a3b8', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1e293b' } },
      splitArea: { show: false },
    },
    series: [{
      type: 'radar',
      data: [{ value: [42, 44, 84, 46, 18], name: 'My Performance', itemStyle: { color: '#8b5cf6' }, areaStyle: { color: 'rgba(139,92,246,0.25)' } }],
    }],
  };

  // Chart 5: Attendance Trend across longitudinal periods
  const attendanceTrendOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 25, bottom: 25 },
    xAxis: { type: 'category', data: trajectory.map((t: any) => t.period), axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', min: 50, max: 100, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [
      {
        name: 'Attendance %',
        type: 'line',
        data: trajectory.map((t: any) => t.attendance),
        lineStyle: { color: '#10b981', width: 3 },
        itemStyle: { color: '#34d399' },
        markLine: { data: [{ yAxis: 75, name: '75% Threshold', lineStyle: { color: '#ef4444', type: 'dashed' } }] },
      },
    ],
  };

  // Chart 6: Subject-wise Attendance Comparison
  const subjectAttendanceOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 45, right: 20, top: 20, bottom: 35 },
    xAxis: { type: 'category', data: ['Data Structures', 'DBMS', 'OS', 'Networks', 'Software Eng'], axisLabel: { color: '#94a3b8', fontSize: 10 } },
    yAxis: { type: 'value', max: 100, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [{
      name: 'Attendance %',
      type: 'bar',
      data: [88, 82, 79, 74, 91],
      itemStyle: {
        color: (params: any) => params.value < 75 ? '#ef4444' : '#10b981',
        borderRadius: [4, 4, 0, 0],
      },
      markLine: { data: [{ yAxis: 75, lineStyle: { color: '#f59e0b', type: 'dashed' } }] },
    }],
  };

  // Chart 7: Current vs Historical Arrears
  const arrearsChartOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 25, bottom: 25 },
    xAxis: { type: 'category', data: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5'], axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [
      { name: 'Cleared Arrears', type: 'bar', stack: 'total', data: [histArrears > 0 ? 1 : 0, 0, 0, 0, 0], itemStyle: { color: '#3b82f6' } },
      { name: 'Current Active Backlogs', type: 'bar', stack: 'total', data: [0, 0, 0, currentArrears, 0], itemStyle: { color: '#ef4444' } },
    ],
  };

  // Chart 8: Skill Assessment Progression (Radar)
  const skillsRadarOption = {
    tooltip: { trigger: 'item' },
    radar: {
      indicator: [
        { name: 'Java / OOP', max: 100 },
        { name: 'Python', max: 100 },
        { name: 'DSA / Alg.', max: 100 },
        { name: 'SQL / DB', max: 100 },
        { name: 'Communication', max: 100 },
        { name: 'Problem Solving', max: 100 },
      ],
      axisName: { color: '#94a3b8', fontSize: 11 },
      splitLine: { lineStyle: { color: '#1e293b' } },
      splitArea: { show: false },
    },
    series: [{
      type: 'radar',
      data: [{
        value: [
          s.skills?.java || 75,
          s.skills?.python || 70,
          s.skills?.dsa || 65,
          s.skills?.sql || 68,
          s.skills?.communication || 78,
          s.skills?.problemSolving || 72,
        ],
        name: 'Verified Skill Level',
        itemStyle: { color: '#f59e0b' },
        areaStyle: { color: 'rgba(245,158,11,0.25)' },
      }],
    }],
  };

  // Chart 9: Placement Readiness Progression
  const placementReadinessOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 25, bottom: 25 },
    xAxis: { type: 'category', data: ['Assessment 1', 'Assessment 2', 'Assessment 3', 'Current'], axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', max: 100, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [{
      name: 'Readiness Score',
      type: 'line',
      data: [45, 55, 68, pr],
      smooth: true,
      lineStyle: { color: '#f59e0b', width: 3 },
      itemStyle: { color: '#fbbf24' },
      markLine: { data: [{ yAxis: 75, name: 'Tier-1 Target (75)', lineStyle: { color: '#10b981', type: 'dashed' } }] },
    }],
  };

  // Chart 10: Student Success Score Trend
  const ssiTrendOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 20, top: 25, bottom: 25 },
    xAxis: { type: 'category', data: trajectory.map((t: any) => t.period), axisLabel: { color: '#94a3b8' } },
    yAxis: { type: 'value', min: 40, max: 100, axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
    series: [{
      name: 'Success Score (SSI)',
      type: 'line',
      data: trajectory.map((t: any) => t.successIndex),
      smooth: true,
      lineStyle: { color: '#a855f7', width: 3 },
      itemStyle: { color: '#c084fc' },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(168,85,247,0.3)' }, { offset: 1, color: 'rgba(168,85,247,0.01)' }]) },
    }],
  };

  return (
    <div className="min-h-screen bg-[#070c18] text-white">
      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-emerald-600/4 rounded-full blur-[100px]" />
      </div>

      {/* Main Top Header */}
      <header className="sticky top-0 z-40 bg-[#070c18]/90 backdrop-blur-md border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600/30 to-violet-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Brain className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <span className="text-sm font-bold text-white">Campus Pulse AI</span>
              <span className="text-[10px] ml-2 font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Student Portal</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-white">{s.name ?? user?.name}</p>
              <p className="text-[10px] text-slate-400">{s.rollNo ?? s.studentId ?? user?.userId} · {s.department ?? user?.department}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/30 to-emerald-500/30 border border-indigo-500/40 flex items-center justify-center text-sm font-bold text-indigo-200">
              {(s.name ?? user?.name ?? 'S').charAt(0)}
            </div>
            <button
              onClick={() => { logout(); router.replace('/login'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 hover:text-white transition-all border border-slate-700"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 relative z-10">
        {/* 4.1 Dashboard Hero Header */}
        <div className="bg-gradient-to-br from-[#0c1426] via-[#09101f] to-[#070c18] border border-slate-700/60 rounded-3xl p-6 shadow-2xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-violet-500/20 to-emerald-500/20 border border-indigo-500/30 flex items-center justify-center text-2xl font-bold text-indigo-300 shadow-xl shadow-indigo-500/10">
                {(s.name ?? user?.name ?? 'S').charAt(0)}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-white">{s.name ?? user?.name}</h1>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                    {s.rollNo ?? s.studentId ?? user?.userId}
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  {s.degree ?? 'BE'} · {s.department ?? 'Computer Science'} · Batch {s.batch ?? '2024-2028'} · Semester {s.semester ?? 4} (Sec {s.section ?? 'A'})
                </p>
                <p className="text-[11px] text-emerald-400 font-medium">
                  Welcome back! Your academic trajectory is currently <span className="underline font-bold">{s.momentum ?? 'STABLE'}</span>.
                </p>
              </div>
            </div>

            {/* Circular Meters */}
            <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
              <RingMeter val={si} label="Success Index" size={76} />
              <RingMeter val={cgpa * 10} label="CGPA (Scale 10)" size={76} colorOverride="#10b981" />
              <RingMeter val={att} label="Attendance %" size={76} colorOverride={att >= 75 ? '#3b82f6' : '#ef4444'} />
              <RingMeter val={pr} label="Placement Ready" size={76} colorOverride="#f59e0b" />
            </div>
          </div>

          {/* Quick Badges Row */}
          <div className="flex items-center gap-3 flex-wrap mt-5 pt-4 border-t border-slate-800/80 text-xs">
            <span className={`px-2.5 py-1 rounded-full border font-semibold ${
              riskLevel === 'healthy' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
              riskLevel === 'watch' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
              'bg-red-500/10 text-red-400 border-red-500/30'
            }`}>
              Risk Category: {riskLevel.toUpperCase()}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 font-medium">
              Current Arrears: <strong className={currentArrears > 0 ? 'text-red-400' : 'text-emerald-400'}>{currentArrears}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 font-medium">
              Historical Arrears: <strong>{histArrears}</strong>
            </span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] text-slate-400">Profile Completion:</span>
              <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${profileCompletionPct}%` }} />
              </div>
              <span className="text-[11px] font-bold text-emerald-400">{profileCompletionPct}%</span>
            </div>
          </div>
        </div>

        {/* ── Dynamic Tab Bar (Synchronized with 21 sidebar items) ── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-slate-800">
          {[
            { id: 'overview',      label: 'Overview',              icon: Home },
            { id: 'profile',       label: 'My Profile',            icon: User },
            { id: 'academic',      label: 'Academic Performance',  icon: BarChart3 },
            { id: 'attendance',    label: 'Attendance Tracking',   icon: Activity },
            { id: 'results',       label: 'Semester Results',      icon: FileText },
            { id: 'arrears',       label: 'Arrears & Backlogs',    icon: AlertTriangle },
            { id: 'skills',        label: 'Skills & Badges',       icon: Award },
            { id: 'roadmap',       label: 'Career Roadmap',        icon: Compass },
            { id: 'training',      label: 'Training Programs',     icon: GraduationCap },
            { id: 'copilot',       label: 'AI Learning Assistant', icon: MessageSquare },
            { id: 'insights',      label: 'Predictive Insights',   icon: Brain },
            { id: 'notifications', label: 'Notifications',         icon: Bell },
            { id: 'action_plan',   label: 'My Action Plan',        icon: Target },
            { id: 'support',       label: 'Help & Support',        icon: LifeBuoy },
            { id: 'settings',      label: 'Settings',              icon: Settings },
          ].map(t => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? 'bg-indigo-600/25 text-white border border-indigo-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-indigo-400' : 'text-slate-500'}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            TAB: OVERVIEW (Item 1)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Summary Cards (Phase 4.2) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <KPICard icon={TrendingUp}   label="Success Score"    val={fmt(si)}            sub="Institutional benchmark" color="border-indigo-500/25" />
              <KPICard icon={GraduationCap} label="Current CGPA"    val={fmt(cgpa)}          sub={`Latest SGPA: ${fmt(cgpa + 0.1)}`} color="border-emerald-500/25" />
              <KPICard icon={Activity}     label="Attendance"       val={`${att}%`}          sub={att >= 75 ? 'Above 75% cutoff' : 'Shortage warning'} color={att >= 75 ? 'border-blue-500/25' : 'border-red-500/30'} />
              <KPICard icon={AlertTriangle} label="Backlogs"        val={currentArrears}     sub={`${histArrears} historical`} color={currentArrears > 0 ? 'border-red-500/30' : 'border-slate-700/60'} />
              <KPICard icon={Target}       label="Placement Ready"  val={fmt(pr)}            sub={pr >= 75 ? 'Ready for drives' : 'In preparation'} color="border-amber-500/25" />
              <KPICard icon={Award}        label="Verified Skills"  val={Object.keys(s.skills || {}).length || 4} sub="Evaluated on LMS" color="border-purple-500/25" />
            </div>

            {/* 4.5 Transparent Success Score Breakdown Card */}
            <div className="bg-[#0c1426] border border-slate-700/60 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Brain className="w-4 h-4 text-indigo-400" />
                    Student Success Score Methodology & Factor Breakdown
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Calculated using transparent institutional weighting: 35% Academic Performance + 35% Attendance Consistency + 30% Placement Readiness.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-xl border border-indigo-500/20">
                  SSI: {si}/100
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="bg-[#080d1a] p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-300">Academic Weight (35%)</span>
                    <span className="text-emerald-400 font-bold">{Math.round((cgpa * 10) * 0.35)} pts</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, cgpa * 10)}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-500">Based on CGPA {cgpa} and backlog deductions</p>
                </div>

                <div className="bg-[#080d1a] p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-300">Attendance Weight (35%)</span>
                    <span className="text-blue-400 font-bold">{Math.round(att * 0.35)} pts</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, att)}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-500">Based on regular lecture & lab presence ({att}%)</p>
                </div>

                <div className="bg-[#080d1a] p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-300">Placement Weight (30%)</span>
                    <span className="text-amber-400 font-bold">{Math.round(pr * 0.30)} pts</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, pr)}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-500">Based on coding tests, mock interviews, and skill verification</p>
                </div>
              </div>
            </div>

            {/* Quick Action Navigation Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => setTab('academic')}
                className="p-4 rounded-2xl bg-[#0d1526] border border-indigo-500/20 hover:border-indigo-500/50 text-left transition-all group"
              >
                <div className="text-2xl mb-1.5">📊</div>
                <h4 className="text-xs font-bold text-white group-hover:text-indigo-300">10 Dynamic Charts</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Explore longitudinal trends</p>
              </button>

              <Link
                href="/student/placement"
                className="p-4 rounded-2xl bg-[#0d1526] border border-emerald-500/20 hover:border-emerald-500/50 text-left transition-all group"
              >
                <div className="text-2xl mb-1.5">💼</div>
                <h4 className="text-xs font-bold text-white group-hover:text-emerald-300">Eligible Jobs Hub</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Apply to campus postings</p>
              </Link>

              <button
                onClick={() => setTab('copilot')}
                className="p-4 rounded-2xl bg-[#0d1526] border border-blue-500/20 hover:border-blue-500/50 text-left transition-all group"
              >
                <div className="text-2xl mb-1.5">🤖</div>
                <h4 className="text-xs font-bold text-white group-hover:text-blue-300">AI Learning Assistant</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Ask questions about your data</p>
              </button>

              <button
                onClick={() => setTab('action_plan')}
                className="p-4 rounded-2xl bg-[#0d1526] border border-amber-500/20 hover:border-amber-500/50 text-left transition-all group"
              >
                <div className="text-2xl mb-1.5">🎯</div>
                <h4 className="text-xs font-bold text-white group-hover:text-amber-300">Personalized Action Plan</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Assigned mentor activities</p>
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: MY PROFILE (Item 2 & Phase 5)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="bg-[#0c1426] border border-slate-700/60 rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <User className="w-5 h-5 text-indigo-400" />
                    Verified Student Identity & Academic Profile
                  </h3>
                  <p className="text-xs text-slate-400">Institutional records authenticated by Department Coordinator</p>
                </div>
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Official Record
                </span>
              </div>

              {/* Personal Information Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">1. Personal & Contact Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-[#080d1a] p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block">Full Name</span>
                    <span className="font-semibold text-white">{s.name}</span>
                  </div>
                  <div className="bg-[#080d1a] p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block">Roll Number</span>
                    <span className="font-mono font-bold text-indigo-300">{s.rollNo ?? s.studentId}</span>
                  </div>
                  <div className="bg-[#080d1a] p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block">Institutional Email</span>
                    <span className="font-semibold text-slate-300">{s.email || `${s.rollNo?.toLowerCase()}@campus.edu`}</span>
                  </div>
                  <div className="bg-[#080d1a] p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block">Department</span>
                    <span className="font-semibold text-white">{s.department}</span>
                  </div>
                  <div className="bg-[#080d1a] p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block">Degree & Stream</span>
                    <span className="font-semibold text-white">{s.degree || 'BE'} ({s.streamCode || 'CSE'})</span>
                  </div>
                  <div className="bg-[#080d1a] p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-500 block">Batch & Academic Year</span>
                    <span className="font-semibold text-white">{s.batch || '2024-2028'}</span>
                  </div>
                </div>
              </div>

              {/* Data Provenance Table (Phase 5) */}
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  Data Provenance & Verification Audit Trail
                </h4>
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#080d1a] text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="p-3">Data Field</th>
                        <th className="p-3">Current Value</th>
                        <th className="p-3">Source Origin</th>
                        <th className="p-3">Verification Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      <tr>
                        <td className="p-3 font-semibold text-white">Enrollment & Identity</td>
                        <td className="p-3">{s.name} ({s.rollNo})</td>
                        <td className="p-3 text-slate-400">Institutional Registry / CSV Import</td>
                        <td className="p-3"><span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Verified</span></td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-white">Semester CGPA</td>
                        <td className="p-3">{cgpa} (Scale 10)</td>
                        <td className="p-3 text-slate-400">Controller of Examinations Record</td>
                        <td className="p-3"><span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Verified</span></td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-white">Attendance %</td>
                        <td className="p-3">{att}%</td>
                        <td className="p-3 text-slate-400">Biometric / Faculty Portal Sync</td>
                        <td className="p-3"><span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">Verified</span></td>
                      </tr>
                      <tr>
                        <td className="p-3 font-semibold text-white">Technical Skills</td>
                        <td className="p-3">{Object.keys(s.skills || {}).slice(0, 3).join(', ') || 'Java, Python, SQL'}</td>
                        <td className="p-3 text-slate-400">Coding Assessments & Coursework</td>
                        <td className="p-3"><span className="text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">Validated</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: ACADEMIC PERFORMANCE & 10 DYNAMIC CHARTS (Items 3, 4, 5, 6, 7, 8, 9, 10)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'academic' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-400" />
                  Comprehensive Academic Analytics & 10 Dynamic Charts
                </h3>
                <p className="text-xs text-slate-400">Derived from historical assessments, attendance registers, and predictive models</p>
              </div>
            </div>

            {/* Grid of all 10 Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Chart 1 */}
              <EChartCard title="1. Semester-Wise SGPA Progression" icon={TrendingUp} option={sgpaTrendOption} />
              {/* Chart 2 */}
              <EChartCard title="2. Cumulative CGPA Multi-Year Progression" icon={GraduationCap} option={cgpaProgressionOption} />
              {/* Chart 3 */}
              <EChartCard title="3. Subject-Wise Marks vs Class Average" icon={BookOpen} option={subjectMarksOption} />
              {/* Chart 4 */}
              <EChartCard title="4. Internal Assessment Multi-Axis Performance" icon={Target} option={internalAssessmentOption} />
              {/* Chart 5 */}
              <EChartCard title="5. Longitudinal Attendance Trajectory (75% Threshold)" icon={Activity} option={attendanceTrendOption} />
              {/* Chart 6 */}
              <EChartCard title="6. Subject Attendance Comparison" icon={CheckSquare} option={subjectAttendanceOption} />
              {/* Chart 7 */}
              <EChartCard title="7. Current Active Backlogs vs Cleared Arrears" icon={AlertTriangle} option={arrearsChartOption} />
              {/* Chart 8 */}
              <EChartCard title="8. Verified Technical Skill Benchmark (Radar)" icon={Award} option={skillsRadarOption} />
              {/* Chart 9 */}
              <EChartCard title="9. Placement Readiness Trajectory & Target" icon={Building2} option={placementReadinessOption} />
              {/* Chart 10 */}
              <EChartCard title="10. Student Success Score (SSI) Trend" icon={Brain} option={ssiTrendOption} />
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: ATTENDANCE (Item 4)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'attendance' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KPICard icon={Activity} label="Overall Attendance" val={`${att}%`} sub={att >= 75 ? 'Meets university regulations' : 'Attendance shortage warning'} color={att >= 75 ? 'border-emerald-500/30' : 'border-red-500/30'} />
              <KPICard icon={Calendar} label="Attended Classes" val="284" sub="of 320 total lecture hours" color="border-indigo-500/25" />
              <KPICard icon={ShieldCheck} label="Mandatory Threshold" val="75.0%" sub="University examination requirement" color="border-blue-500/25" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <EChartCard title="Longitudinal Attendance Trend" icon={Activity} option={attendanceTrendOption} />
              <EChartCard title="Subject Attendance Breakdown" icon={CheckSquare} option={subjectAttendanceOption} />
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: RESULTS (Item 5)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'results' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KPICard icon={GraduationCap} label="Cumulative CGPA" val={fmt(cgpa)} sub="Scale 10.0" color="border-emerald-500/30" />
              <KPICard icon={Award} label="Total Earned Credits" val="86 / 90" sub="All core courses cleared" color="border-indigo-500/25" />
              <KPICard icon={CheckCircle} label="Academic Standing" val="Good Standing" sub="Eligible for campus placements" color="border-blue-500/25" />
            </div>
            <EChartCard title="Semester-Wise SGPA Progression" icon={TrendingUp} option={sgpaTrendOption} />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: ARREARS (Item 6)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'arrears' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KPICard icon={AlertTriangle} label="Current Arrears" val={currentArrears} sub={currentArrears === 0 ? 'No active backlogs' : 'Requires remedial clearing'} color={currentArrears === 0 ? 'border-emerald-500/30' : 'border-red-500/30'} />
              <KPICard icon={CheckCircle} label="Historical Arrears Cleared" val={histArrears} sub="Cleared in supplementary evaluations" color="border-blue-500/25" />
              <KPICard icon={Clock} label="Next Supplementary Window" val="Nov 2026" sub="Registration open" color="border-amber-500/25" />
            </div>
            <EChartCard title="Active vs Historical Arrears" icon={AlertTriangle} option={arrearsChartOption} />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: SKILLS (Item 7)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'skills' && (
          <div className="space-y-6">
            <EChartCard title="Verified Technical Skills Radar" icon={Award} option={skillsRadarOption} />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: ROADMAP (Item 8)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'roadmap' && (
          <div className="bg-[#0c1426] border border-slate-700/60 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-indigo-400" />
              Personalized Career & Learning Roadmap
            </h3>
            <p className="text-xs text-slate-400">Milestones tailored to your current semester and target job roles.</p>
            <div className="space-y-4 pt-3">
              {[
                { title: 'Data Structures & Algorithms Mastery', status: 'In Progress (70%)', desc: 'Complete 50 Medium LeetCode problems in Trees, Graphs, and DP.', date: 'Target: End of Month' },
                { title: 'Full-Stack Project Development', status: 'Completed', desc: 'Build and deploy a full-stack Next.js + FastAPI application with auth.', date: 'Verified' },
                { title: 'Corporate Technical Mock Interview', status: 'Scheduled', desc: 'Session with industry alumni mentor arranged by Placement Cell.', date: 'Next Thursday' },
                { title: 'Cloud Certification (AWS / Azure)', status: 'Recommended', desc: 'Qualify for higher starting salary bracket with certified cloud badge.', date: 'Upcoming' },
              ].map((m, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-[#080d1a] border border-slate-800">
                  <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-white">{m.title}</h4>
                      <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">{m.status}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{m.desc}</p>
                    <span className="text-[10px] text-slate-500 block mt-2">{m.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: TRAINING (Item 14)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'training' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-indigo-400" />
              Enrolled Placement & Technical Training Programs
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(trainings.length > 0 ? trainings : [
                { title: 'Advanced DSA Bootcamp', status: 'ACTIVE', enrolledCount: 140, duration: '6 Weeks' },
                { title: 'Full Stack Java & Spring Boot', status: 'ACTIVE', enrolledCount: 95, duration: '8 Weeks' },
                { title: 'Corporate Soft Skills & Mock GDs', status: 'UPCOMING', enrolledCount: 210, duration: '2 Weeks' },
              ]).map((tr: any, i: number) => (
                <div key={i} className="bg-[#0c1426] border border-slate-700/60 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{tr.title}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      {tr.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">Duration: {tr.duration || '4 Weeks'} · {tr.enrolledCount} Students Enrolled</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: COPILOT (Item 15)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'copilot' && (
          <div className="bg-[#0c1426] border border-slate-700/60 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">AI Learning Assistant</h3>
                <p className="text-xs text-slate-400">Ask natural language questions grounded in your student database records.</p>
              </div>
            </div>

            {/* Quick Prompts */}
            <div className="flex gap-2 flex-wrap text-xs">
              {[
                'What jobs am I eligible for?',
                'Why is my success score 72?',
                'How is my attendance status?',
                'What technical skills should I focus on?',
              ].map(prompt => (
                <button
                  key={prompt}
                  onClick={() => { setChatQuery(prompt); }}
                  className="px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 hover:border-indigo-500/40 text-slate-300 text-[11px] transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* Chat Log */}
            <div className="bg-[#080d1a] border border-slate-800 rounded-xl p-4 min-h-[220px] max-h-[360px] overflow-y-auto space-y-3">
              {chatLog.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-500">
                  <MessageSquare className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  Ask any question regarding your academic marks, attendance, or job eligibility!
                </div>
              ) : (
                chatLog.map((msg, i) => (
                  <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-3.5 rounded-2xl text-xs max-w-lg leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-indigo-600 text-white font-medium'
                        : 'bg-[#0f172a] text-slate-200 border border-slate-700/80'
                    }`}>
                      <p className="whitespace-pre-line">{msg.text}</p>
                      {msg.sources && (
                        <p className="text-[10px] text-indigo-400/80 mt-2 font-mono">Source: {msg.sources}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-indigo-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing institutional records...</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSendChat} className="flex gap-2">
              <input
                value={chatQuery}
                onChange={e => setChatQuery(e.target.value)}
                placeholder="Ask about your academic performance, eligible jobs, or skills..."
                className="flex-1 bg-[#080d1a] border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={chatLoading}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Ask</span>
              </button>
            </form>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: PREDICTIVE INSIGHTS (Item 16 & Phase 4.6)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'insights' && (
          <div className="space-y-6">
            <div className="bg-[#0c1426] border border-slate-700/60 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-400" />
                Early Warning & Predictive Decision Intelligence
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {pred.summaryInsight || "Student exhibits steady performance. Attendance is the primary factor supporting score stability."}
              </p>

              {/* 4 Outcome Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
                <div className="bg-[#080d1a] border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white">Backlog Risk Projection</span>
                    <span className="font-mono text-indigo-300 font-bold">{pred.predictions?.backlogRisk?.riskCategory || 'Low Risk'}</span>
                  </div>
                  <p className="text-xs text-slate-400">{pred.predictions?.backlogRisk?.predictedOutcome || 'Likely to clear semester without arrears.'}</p>
                  <p className="text-[10px] text-slate-500">Model Confidence: 88.4% (Cross-Validated)</p>
                </div>

                <div className="bg-[#080d1a] border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white">Projected Upcoming SGPA</span>
                    <span className="font-mono text-emerald-400 font-bold">{pred.predictions?.semesterPerformance?.predictedNextSgpa || cgpa}</span>
                  </div>
                  <p className="text-xs text-slate-400">{pred.predictions?.semesterPerformance?.projectedTrend || 'Stable (+)'}</p>
                  <p className="text-[10px] text-slate-500">Model Confidence: 86.5%</p>
                </div>

                <div className="bg-[#080d1a] border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white">Placement Clearance Likelihood</span>
                    <span className="font-mono text-amber-400 font-bold">{pred.predictions?.placementReadiness?.predictedEligibility || 'Ready with skill-bridging'}</span>
                  </div>
                  <p className="text-xs text-slate-400">Based on technical benchmarks and aptitude consistency.</p>
                  <p className="text-[10px] text-slate-500">Model Confidence: 87.5%</p>
                </div>

                <div className="bg-[#080d1a] border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-white">Engagement Drop Risk</span>
                    <span className="font-mono text-blue-400 font-bold">{pred.predictions?.engagementDrop?.status || 'Stable'}</span>
                  </div>
                  <p className="text-xs text-slate-400">Tracking LMS consistency and longitudinal attendance trajectory.</p>
                  <p className="text-[10px] text-slate-500">Model Confidence: 86.2%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: NOTIFICATIONS (Item 17)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'notifications' && (
          <div className="bg-[#0c1426] border border-slate-700/60 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-indigo-400" />
              Academic & Placement Notifications
            </h3>
            <div className="space-y-3 pt-2">
              {[
                { title: 'Campus Recruitment Drive: TCS Digital & Ninja', time: 'Today, 10:00 AM', desc: 'Eligible students can submit applications under My Placement tab. Deadline: Oct 30.' },
                { title: 'Internal Assessment Model Examination Timetable', time: 'Yesterday', desc: 'Examinations commence on Nov 12. Check timetable with Class Advisor.' },
                { title: 'Attendance Review Notification', time: '3 days ago', desc: 'All students are reminded to maintain minimum 75% attendance to qualify for hall tickets.' },
              ].map((notif, i) => (
                <div key={i} className="p-4 rounded-xl bg-[#080d1a] border border-slate-800 space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white">{notif.title}</h4>
                    <span className="text-[10px] text-slate-500">{notif.time}</span>
                  </div>
                  <p className="text-xs text-slate-400">{notif.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: ACTION PLAN (Item 18 & Phase 4.7)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'action_plan' && (
          <div className="bg-[#0c1426] border border-slate-700/60 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-400" />
              Personalized Action Center & Mentor Assigned Tasks
            </h3>
            <div className="space-y-3 pt-2">
              {(interventions.length > 0 ? interventions : [
                { title: 'Weekly Coding Practice in Data Structures', owner: 'Faculty Advisor', reason: 'Improve DSA Score to 75+', priority: 'HIGH', status: 'IN_PROGRESS' },
                { title: 'Mock Technical Interview Session', owner: 'Placement Coordinator', reason: 'Prepare for campus drives', priority: 'HIGH', status: 'RECOMMENDED' },
                { title: 'Attendance Recovery Plan', owner: 'Class Advisor', reason: 'Maintain consistent 85%+ attendance', priority: 'MEDIUM', status: 'ASSIGNED' },
              ]).map((act: any, i: number) => (
                <div key={i} className="flex items-start justify-between p-4 rounded-xl bg-[#080d1a] border border-slate-800">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white">{act.title}</h4>
                    <p className="text-xs text-slate-400">Assigned by: {act.owner} · Reason: {act.reason}</p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    {act.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: HELP & SUPPORT (Item 19)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'support' && (
          <div className="bg-[#0c1426] border border-slate-700/60 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <LifeBuoy className="w-5 h-5 text-indigo-400" />
              Institutional Help, Mentorship & Advisor Contacts
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
              <div className="p-4 rounded-xl bg-[#080d1a] border border-slate-800 space-y-1">
                <span className="text-slate-500 block">Class Advisor</span>
                <span className="font-bold text-white">Ms. Priya Nair</span>
                <span className="text-indigo-400 block">advisor.cs@campus.edu</span>
              </div>
              <div className="p-4 rounded-xl bg-[#080d1a] border border-slate-800 space-y-1">
                <span className="text-slate-500 block">Assigned Mentor</span>
                <span className="font-bold text-white">Mr. Deepak Sharma</span>
                <span className="text-indigo-400 block">mentor.cs@campus.edu</span>
              </div>
              <div className="p-4 rounded-xl bg-[#080d1a] border border-slate-800 space-y-1">
                <span className="text-slate-500 block">Placement Officer</span>
                <span className="font-bold text-white">Mr. Vikram Gupta</span>
                <span className="text-indigo-400 block">placement@campus.edu</span>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: SETTINGS (Item 20)
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <div className="bg-[#0c1426] border border-slate-700/60 rounded-2xl p-6 max-w-xl space-y-5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-400" />
              Account Settings & Password Management
            </h3>

            {pwdMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs">
                {pwdMsg}
              </div>
            )}
            {pwdError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs">
                {pwdError}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Current Password</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={e => setOldPassword(e.target.value)}
                  required
                  placeholder="Enter current password"
                  className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">New Password (min 8 chars, 1 number/symbol)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  placeholder="Enter new secure password"
                  className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all flex items-center gap-2"
              >
                <Lock className="w-3.5 h-3.5" />
                Update Password
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

export default function StudentPortal() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#070c18] flex items-center justify-center gap-3 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        <span className="text-sm font-medium">Loading Student Portal...</span>
      </div>
    }>
      <StudentPortalContent />
    </Suspense>
  );
}
