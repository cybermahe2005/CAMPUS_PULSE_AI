'use client';
import AppLayout from '@/components/layout/AppLayout';
import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getStudents, runSimulation } from '@/lib/api';
import { riskColor, riskBadge, riskBg, fmt, fmtPct, cn } from '@/lib/utils';
import * as echarts from 'echarts';
import { Zap, Search, RotateCcw, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

function DeltaBadge({ val, unit = '', invert = false }: { val: number; unit?: string; invert?: boolean }) {
  if (val === 0 || isNaN(val)) return <span className="text-slate-500 text-xs font-medium">—</span>;
  const isPositiveImpact = invert ? val < 0 : val > 0;
  return (
    <span className={`text-xs font-semibold ${isPositiveImpact ? 'text-emerald-400' : 'text-rose-400'}`}>
      {val > 0 ? '▲ +' : '▼ '} {Math.abs(val).toFixed(1)}{unit}
    </span>
  );
}

function CompareChart({ current, scenario }: { current: any; scenario: any }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current || !current) return;
    const chart = echarts.init(el.current, 'dark');
    const metrics = ['Success Index', 'Academic', 'Placement', 'Engagement', 'Risk Score %'];
    const curVals = [
      current.successIndex ?? 0,
      current.academicReadiness ?? 0,
      current.placementReadiness ?? 0,
      current.engagementHealth ?? 0,
      (current.riskProbability ?? 0) * 100,
    ].map(v => parseFloat(v.toFixed(1)));

    const scnVals = scenario ? [
      scenario.successIndex ?? 0,
      scenario.academicReadiness ?? 0,
      scenario.placementReadiness ?? 0,
      scenario.engagementHealth ?? 0,
      (scenario.riskProbability ?? 0) * 100,
    ].map(v => parseFloat(v.toFixed(1))) : null;

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['Baseline (Actual)', 'Simulated Scenario'], textStyle: { color: '#94a3b8', fontSize: 11 }, top: 0 },
      grid: { left: 100, right: 30, top: 35, bottom: 10, containLabel: false },
      xAxis: { type: 'value', max: 100, axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b' } } },
      yAxis: { type: 'category', data: metrics, axisLabel: { color: '#94a3b8', fontSize: 11 } },
      series: [
        {
          name: 'Baseline (Actual)',
          type: 'bar',
          data: curVals,
          barMaxWidth: 14,
          itemStyle: { color: '#475569' },
          label: { show: true, position: 'right', color: '#94a3b8', fontSize: 10 }
        },
        ...(scnVals ? [{
          name: 'Simulated Scenario',
          type: 'bar',
          data: scnVals,
          barMaxWidth: 14,
          itemStyle: { color: '#6366f1' },
          label: { show: true, position: 'right', color: '#a5b4fc', fontSize: 10 }
        }] : []),
      ],
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el.current);
    return () => { chart.dispose(); ro.disconnect(); };
  }, [current, scenario]);
  return <div ref={el} className="h-60 w-full" />;
}

function Slider({ label, value, onChange, min = 0, max = 100, step = 1, color = 'text-indigo-400' }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; color?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-slate-300 font-medium">{label}</span>
        <span className={`font-bold ${color}`}>{value.toFixed(step < 1 ? 1 : 0)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(+e.target.value)}
        className="w-full h-1.5 rounded-full accent-indigo-500 cursor-pointer bg-slate-700"
      />
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function SimContent() {
  const searchParams = useSearchParams();
  const preStudent = searchParams.get('student') ?? '';
  const [query, setQuery] = useState('');
  const [suggestions, setSugg] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);

  // Scenario variables
  const [attendance, setAttendance] = useState(75);
  const [backlogs, setBacklogs] = useState(0);
  const [cgpa, setCgpa] = useState(7.5);
  const [coding, setCoding] = useState(50);
  const [mock, setMock] = useState(50);
  const [aptitude, setAptitude] = useState(55);
  const [lms, setLms] = useState(65);

  const selectStudent = (s: any) => {
    setSelected(s);
    setResult(null);
    setSugg([]);
    setQuery('');
    setAttendance(Math.round(s.attendancePct ?? 75));
    setBacklogs(s.backlogCount ?? s.currentArrears ?? 0);
    setCgpa(s.cgpa ?? 7.0);
    setCoding(Math.round(s.codingScore ?? 50));
    setMock(Math.round(s.mockInterviewScore ?? 50));
    setAptitude(Math.round(s.aptitudeScore ?? 55));
    setLms(Math.round(s.lmsConsistency ?? 65));
  };

  const loadPreStudent = useCallback(async (id: string) => {
    const res = await getStudents({ q: id, perPage: 1 });
    if (res.students?.[0]) selectStudent(res.students[0]);
  }, []);

  useEffect(() => { if (preStudent) loadPreStudent(preStudent); }, [preStudent, loadPreStudent]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setSugg([]); return; }
    const res = await getStudents({ q, perPage: 5 });
    setSugg(res.students || []);
  }, []);

  useEffect(() => { search(query); }, [query, search]);

  const runSim = async () => {
    if (!selected) return;
    setRunning(true);
    try {
      const res = await runSimulation(selected.studentId, {
        attendancePct: attendance,
        backlogCount: backlogs,
        cgpa: cgpa,
        codingScore: coding,
        mockInterviewScore: mock,
        aptitudeScore: aptitude,
        lmsConsistency: lms,
      });
      setResult(res);
    } catch (err: any) {
      console.error('Simulation error:', err);
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    if (!selected) return;
    selectStudent(selected);
  };

  return (
    <div className="space-y-5 max-w-[1240px]">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-indigo-400" />
          What-If Simulator & Decision Intelligence Twin
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Simulate academic improvements, arrears clearance, and skill progression using the canonical institutional risk engine.
        </p>
      </div>

      {/* Student selector */}
      <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl p-5">
        <p className="text-sm font-semibold text-white mb-3">1 · Select Student Profile</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by student name, roll number, or department…"
            className="w-full bg-[#080d1a] border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-[#0d1526] border border-slate-700 rounded-xl overflow-hidden z-20 shadow-xl max-h-60 overflow-y-auto">
              {suggestions.map(s => (
                <button
                  key={s.studentId}
                  onClick={() => selectStudent(s)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300">
                    {s.name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-200 font-medium">{s.name} <span className="text-xs text-slate-500">({s.studentId})</span></p>
                    <p className="text-xs text-slate-500">{s.department} · SSI: {fmt(s.successIndex)} · Backlogs: {s.backlogCount ?? 0}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${riskBg(s.riskLevel)} ${riskColor(s.riskLevel)}`}>
                    {riskBadge(s.riskLevel)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected && (
          <div className={cn('mt-3 flex items-center gap-3 p-3.5 rounded-xl border', riskBg(selected.riskLevel))}>
            <div className="w-10 h-10 rounded-full bg-indigo-600/25 flex items-center justify-center text-base font-bold text-indigo-300">
              {selected.name?.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-200">{selected.name} <span className="text-xs text-slate-400">({selected.studentId})</span></p>
              <p className="text-xs text-slate-400">
                {selected.department} · Baseline CGPA: <strong className="text-slate-200">{selected.cgpa}</strong> · Backlogs: <strong className="text-slate-200">{selected.backlogCount ?? selected.currentArrears ?? 0}</strong> · Attendance: <strong className="text-slate-200">{selected.attendancePct}%</strong>
              </p>
            </div>
            <div className="text-right">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${riskBg(selected.riskLevel)} ${riskColor(selected.riskLevel)}`}>
                {riskBadge(selected.riskLevel)}
              </span>
              <p className="text-[10px] text-slate-500 mt-1">SSI: {fmt(selected.successIndex)}</p>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Sliders Column */}
          <div className="lg:col-span-5 bg-[#0d1526] border border-slate-700/60 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <p className="text-sm font-semibold text-white">2 · Adjust Scenario Parameters</p>
              <span className="text-[10px] text-indigo-400 uppercase tracking-wider font-semibold">Canonical Engine</span>
            </div>

            <Slider
              label="Attendance Percentage (%)"
              value={attendance}
              onChange={setAttendance}
              min={30}
              max={100}
              color={attendance >= 75 ? 'text-emerald-400' : 'text-rose-400'}
            />

            <Slider
              label="Active Arrears / Backlogs"
              value={backlogs}
              onChange={setBacklogs}
              min={0}
              max={10}
              step={1}
              color={backlogs === 0 ? 'text-emerald-400' : 'text-rose-400'}
            />

            <Slider
              label="Expected CGPA"
              value={cgpa}
              onChange={setCgpa}
              min={4.0}
              max={10.0}
              step={0.1}
              color={cgpa >= 7.5 ? 'text-emerald-400' : 'text-amber-400'}
            />

            <Slider
              label="Coding Assessment Benchmark"
              value={coding}
              onChange={setCoding}
              color={coding >= 70 ? 'text-emerald-400' : 'text-amber-400'}
            />

            <Slider
              label="Aptitude Benchmark"
              value={aptitude}
              onChange={setAptitude}
            />

            <Slider
              label="Mock Interview Performance"
              value={mock}
              onChange={setMock}
            />

            <Slider
              label="LMS Engagement & Activity (%)"
              value={lms}
              onChange={setLms}
            />

            <div className="flex gap-2.5 pt-3">
              <button
                onClick={reset}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:border-slate-600 transition-all font-medium"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset to Baseline
              </button>
              <button
                onClick={runSim}
                disabled={running}
                className="flex-[1.5] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-sm text-white font-semibold transition-all shadow-lg shadow-indigo-600/30"
              >
                <Zap className="w-4 h-4" /> {running ? 'Simulating…' : 'Compute Scenario Impact'}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed text-center">
              Simulation is non-destructive. Values are processed by the canonical mathematical engine without overwriting official database records.
            </p>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-white">3 · Multi-Pillar Outcome Comparison</p>
                {result?.tierChanged && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Risk Tier Shift Detected
                  </span>
                )}
              </div>
              <CompareChart
                current={result?.current ?? selected}
                scenario={result?.scenario}
              />
            </div>

            {/* Impact Metric Cards */}
            {result && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#0d1526] border border-slate-700/60 rounded-xl p-3.5 text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">Success Index</p>
                    <p className="text-xs text-slate-400 mt-0.5">Was: {fmt(result.current.successIndex)}</p>
                    <p className="text-lg font-bold text-white my-0.5">{fmt(result.scenario.successIndex)}</p>
                    <DeltaBadge val={result.delta.successIndex} />
                  </div>
                  <div className="bg-[#0d1526] border border-slate-700/60 rounded-xl p-3.5 text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">Placement Readiness</p>
                    <p className="text-xs text-slate-400 mt-0.5">Was: {fmtPct(result.current.placementReadiness)}</p>
                    <p className="text-lg font-bold text-white my-0.5">{fmtPct(result.scenario.placementReadiness)}</p>
                    <DeltaBadge val={result.delta.placementReadiness} />
                  </div>
                  <div className="bg-[#0d1526] border border-slate-700/60 rounded-xl p-3.5 text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">Risk Probability</p>
                    <p className="text-xs text-slate-400 mt-0.5">Was: {fmtPct(result.current.riskProbability * 100)}</p>
                    <p className="text-lg font-bold text-white my-0.5">{fmtPct(result.scenario.riskProbability * 100)}</p>
                    <DeltaBadge val={result.delta.riskProbability * 100} invert={true} />
                  </div>
                </div>

                {/* Transition Banner */}
                <div className={cn(
                  'p-4 rounded-xl border flex items-center justify-between',
                  result.scenario.riskLevel === 'healthy' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
                  result.scenario.riskLevel === 'watch' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
                  result.scenario.riskLevel === 'at_risk' ? 'bg-orange-500/10 border-orange-500/30 text-orange-300' :
                  'bg-rose-500/10 border-rose-500/30 text-rose-300'
                )}>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider">Projected Risk Classification</p>
                    <p className="text-sm font-bold mt-0.5">
                      {result.current.riskLabel} → {result.scenario.riskLabel}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <span className="font-semibold text-white">Backlog Clearance: </span>
                    {result.delta.backlogDelta < 0 ? (
                      <span className="text-emerald-400 font-bold">{Math.abs(result.delta.backlogDelta)} Cleared</span>
                    ) : (
                      <span className="text-slate-400">Unchanged</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SimulatorPage() {
  return (
    <AppLayout>
      <Suspense>
        <SimContent />
      </Suspense>
    </AppLayout>
  );
}
