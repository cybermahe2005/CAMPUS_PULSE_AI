'use client';
import AppLayout from '@/components/layout/AppLayout';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getDashboard } from '@/lib/api';
import { riskColor, riskBadge, momentumIcon, momentumColor, fmt } from '@/lib/utils';
import Link from 'next/link';
import {
  Users, AlertTriangle, TrendingDown, TrendingUp, Target,
  Briefcase, Activity, RefreshCw, ArrowRight, ChevronRight, Zap,
  UploadCloud, Shield, CheckCircle, Clock, Building2, UserCheck
} from 'lucide-react';
import * as echarts from 'echarts';

// ── Stat Card ────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string|number; sub?: string; color: string;
}) {
  return (
    <div className={`bg-[#0d1526] border rounded-2xl p-4 space-y-1.5 hover:border-opacity-70 transition-all ${color}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
        <Icon className="w-4 h-4 opacity-70" />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

// ── Risk Donut Chart ──────────────────────────────────────────
function RiskDonut({ data }: { data: Record<string,number> }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, 'dark');
    chart.setOption({
      backgroundColor:'transparent',
      tooltip:{ trigger:'item', formatter:'{b}: {c} ({d}%)' },
      legend:{ orient:'vertical', right:0, top:'center', textStyle:{ color:'#94a3b8', fontSize:11 } },
      series:[{
        type:'pie', radius:['55%','80%'], center:['38%','50%'],
        avoidLabelOverlap:false, label:{ show:false },
        data:[
          { name:'Healthy',  value:data.healthy??0,  itemStyle:{ color:'#10b981' } },
          { name:'Watch',    value:data.watch??0,    itemStyle:{ color:'#f59e0b' } },
          { name:'At Risk',  value:data.at_risk??0,  itemStyle:{ color:'#f97316' } },
          { name:'Critical', value:data.critical??0, itemStyle:{ color:'#ef4444' } },
        ],
      }],
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);
    return () => { chart.dispose(); ro.disconnect(); };
  }, [data]);
  return <div ref={el} className="h-56 w-full" />;
}

// ── Dept Bar Chart ────────────────────────────────────────────
function DeptBar({ depts }: { depts: any[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current || !depts.length) return;
    const chart = echarts.init(el.current, 'dark');
    chart.setOption({
      backgroundColor:'transparent',
      tooltip:{ trigger:'axis' },
      grid:{ left:110, right:20, top:10, bottom:10, containLabel:false },
      xAxis:{ type:'value', axisLabel:{ color:'#64748b', fontSize:10 }, splitLine:{ lineStyle:{ color:'#1e293b' } } },
      yAxis:{ type:'category', data:depts.map((d:any)=>d.department), axisLabel:{ color:'#94a3b8', fontSize:11 } },
      series:[
        { name:'Critical', type:'bar', stack:'a', data:depts.map((d:any)=>d.critical??0), itemStyle:{ color:'#ef4444' }, barMaxWidth:18 },
        { name:'At Risk',  type:'bar', stack:'a', data:depts.map((d:any)=>d.risk??0), itemStyle:{ color:'#f97316' } },
        { name:'Avg SSI',  type:'line', yAxisIndex:0, data:depts.map((d:any)=>d.avgSuccess?.toFixed(1)??0),
          lineStyle:{ color:'#6366f1' }, itemStyle:{ color:'#6366f1' }, symbol:'circle', symbolSize:6 },
      ],
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);
    return () => { chart.dispose(); ro.disconnect(); };
  }, [depts]);
  return <div ref={el} className="h-52 w-full" />;
}

// ── Priority Row ──────────────────────────────────────────────
function PriorityRow({ s }: { s: any }) {
  const drv = s.shapDrivers?.[0]?.feature ?? 'Attendance / Backlog';
  return (
    <Link href={`/students/${s.studentId}`}
      className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-800/50 border border-transparent hover:border-slate-700/50 transition-all group">
      <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
        {s.name?.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-200 truncate">{s.name}</span>
          <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-full border ${s.riskLevel==='critical'?'bg-red-500/10 text-red-400 border-red-500/30':'bg-orange-500/10 text-orange-400 border-orange-500/30'}`}>
            {riskBadge(s.riskLevel)}
          </span>
        </div>
        <p className="text-[10px] text-slate-500">{s.department} · Driver: {drv}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-bold text-white">{fmt(s.successIndex)}</p>
        <p className="text-[9px] text-slate-500">SSI</p>
      </div>
      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]  = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(await getDashboard()); }
    catch { setError('Failed to load dashboard data.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const isLeadership = ['ADMIN', 'JOINT_SECRETARY', 'PRINCIPAL'].includes(user?.role || '');
  const isHOD = user?.role === 'HOD';
  const isPlacement = ['PLACEMENT_COORDINATOR', 'PLACEMENT_OFFICER'].includes(user?.role || '');

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        {/* Role-Specific Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#0a1224] border border-slate-800 rounded-3xl p-5 shadow-xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                {user?.role === 'JOINT_SECRETARY' ? 'INSTITUTION LEADERSHIP VIEW' :
                 user?.role === 'PRINCIPAL' ? 'ACADEMIC OVERSIGHT VIEW' :
                 user?.role === 'HOD' ? `DEPARTMENT VIEW · ${user?.department || 'CS'}` :
                 user?.role === 'PLACEMENT_COORDINATOR' ? 'PLACEMENT & JOBS COMMAND' :
                 'CAMPUS MISSION CONTROL'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-white">
              {isHOD ? `${user?.department} Decision Intelligence` :
               isPlacement ? 'Placement & Recruitment Intelligence' :
               'Institution Mission Control'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {isLeadership ? 'Real-time monitoring across all campus departments, risk velocity, and academic outcomes' :
               isHOD ? `Departmental risk distribution, faculty follow-ups, and backlog trends for ${user?.department}` :
               'Decision-first view of campus student success intelligence'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {isLeadership && (
              <Link
                href="/students/import"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-all shadow-lg shadow-indigo-500/20"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Bulk CSV Import</span>
              </Link>
            )}
            <button onClick={load} disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:border-indigo-500/50 transition-all disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading?'animate-spin':''}`} />Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-xs text-red-400">{error}</div>
        )}

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {loading ? Array.from({length:6}).map((_,i) => <div key={i} className="skeleton h-24 rounded-2xl" />) : <>
            <StatCard icon={Users} label="Total Students" value={data?.total??0} sub={`Avg SSI: ${fmt(data?.avgSuccessIndex)}`} color="border-slate-700/60 text-slate-300" />
            <StatCard icon={AlertTriangle} label="At Risk" value={(data?.atRisk??0)+(data?.critical??0)} sub={`${data?.critical??0} critical tier`} color="border-red-500/30 text-red-400" />
            <StatCard icon={TrendingDown} label="Deteriorating" value={data?.deteriorating??0} sub="Negative momentum" color="border-orange-500/30 text-orange-400" />
            <StatCard icon={TrendingUp} label="Improving" value={data?.improving??0} sub="Positive momentum" color="border-emerald-500/30 text-emerald-400" />
            <StatCard icon={Briefcase} label="Placement Ready" value={`${fmt(data?.avgPlacementReadiness,0)}%`} sub={`${data?.placementMetrics?.publishedJobs || 0} active jobs`} color="border-blue-500/30 text-blue-400" />
            <StatCard icon={Activity} label="Avg Attendance" value={`${fmt(data?.avgAttendance,0)}%`} sub={data?.avgAttendance >= 75 ? 'Healthy campus' : 'Needs attention'} color="border-indigo-500/30 text-indigo-400" />
          </>}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Risk distribution */}
          <div className="lg:col-span-2 bg-[#0d1526] border border-slate-700/60 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-1">Risk Tier Distribution</h3>
            <p className="text-xs text-slate-500 mb-3">Campus-wide breakdown by urgency</p>
            {loading ? <div className="skeleton h-56 rounded-xl" /> :
              <RiskDonut data={{ healthy:data?.healthy, watch:data?.watch, at_risk:data?.atRisk, critical:data?.critical }} />}
          </div>
          {/* Dept comparison */}
          <div className="lg:col-span-3 bg-[#0d1526] border border-slate-700/60 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-1">Department Comparison</h3>
            <p className="text-xs text-slate-500 mb-3">At-Risk count vs. average Success Score</p>
            {loading ? <div className="skeleton h-52 rounded-xl" /> :
              <DeptBar depts={data?.deptStats ?? []} />}
          </div>
        </div>

        {/* Priority queue + segments */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Priority */}
          <div className="lg:col-span-3 bg-[#0d1526] border border-slate-700/60 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Priority Intervention Queue</h3>
                <p className="text-xs text-slate-500">Sorted by risk probability × recovery potential</p>
              </div>
              <Link href="/interventions" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold">
                Open Center <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-1">
              {loading ? Array.from({length:5}).map((_,i) => <div key={i} className="skeleton h-14 rounded-xl" />) :
                (data?.priorityQueue ?? []).slice(0,8).map((s:any) => <PriorityRow key={s.studentId} s={s} />)}
            </div>
          </div>

          {/* Segment stats */}
          <div className="lg:col-span-2 bg-[#0d1526] border border-slate-700/60 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-1">Student Segments</h3>
            <p className="text-xs text-slate-500 mb-4">Action-oriented classification</p>
            {loading ? <div className="skeleton h-48 rounded-xl" /> :
              <div className="space-y-2.5">
                {Object.entries(data?.segmentStats ?? {}).map(([seg, info]: [string, any]) => {
                  const labels: Record<string,string> = {
                    future_leader:'Future Leader', academic_star:'Academic Star',
                    hidden_talent:'Hidden Talent', silent_decliner:'Silent Decliner',
                    critical_support:'Critical Support', recoverable_risk:'Recoverable Risk',
                  };
                  const colors: Record<string,string> = {
                    future_leader:'bg-emerald-500', academic_star:'bg-blue-500',
                    hidden_talent:'bg-violet-500', silent_decliner:'bg-amber-500',
                    critical_support:'bg-red-500', recoverable_risk:'bg-orange-500',
                  };
                  return (
                    <div key={seg}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300">{labels[seg]??seg}</span>
                        <span className="text-slate-400">{info.count} ({info.pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full">
                        <div className={`h-full rounded-full ${colors[seg]??'bg-slate-500'}`} style={{width:`${info.pct}%`}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            }
            <Link href="/students" className="mt-4 flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-semibold">
              <Zap className="w-3.5 h-3.5" />Explore all students in Explorer
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
