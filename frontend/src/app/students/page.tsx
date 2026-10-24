'use client';
import AppLayout from '@/components/layout/AppLayout';
import { useEffect, useState, useCallback } from 'react';
import { getStudents, createSingleStudent } from '@/lib/api';
import { riskColor, riskBadge, riskBg, fmt, cn } from '@/lib/utils';
import Link from 'next/link';
import {
  Search, Filter, ArrowUpDown, ExternalLink, PlusCircle, Download,
  UserPlus, FileSpreadsheet, X, CheckCircle2, AlertCircle
} from 'lucide-react';

const DEPTS = ['All', 'Computer Science and Engineering', 'Electronics and Communication', 'Mechanical Engineering', 'Information Technology', 'Civil Engineering', 'MBA'];
const RISKS = ['All', 'healthy', 'watch', 'at_risk', 'critical'];
const MOMENTS = ['All', 'POSITIVE', 'STABLE', 'NEGATIVE'];
const SORT_OPTIONS = [
  { value: 'successIndex', label: 'Success Index' },
  { value: 'riskProbability', label: 'Risk %' },
  { value: 'riskVelocity', label: 'Risk Velocity' },
  { value: 'recoveryPotential', label: 'Recovery Potential' },
  { value: 'cgpa', label: 'CGPA' },
];

function RiskBadge({ level }: { level: string }) {
  return (
    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', riskBg(level), riskColor(level))}>
      {riskBadge(level)}
    </span>
  );
}

export default function StudentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('All');
  const [risk, setRisk] = useState('All');
  const [moment, setMoment] = useState('All');
  const [sortBy, setSortBy] = useState('riskProbability');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  // Add Student Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Single Student Form Fields
  const [formRoll, setFormRoll] = useState('');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDept, setFormDept] = useState('Computer Science and Engineering');
  const [formSem, setFormSem] = useState(4);
  const [formSection, setFormSection] = useState('A');
  const [formCgpa, setFormCgpa] = useState(7.8);
  const [formAtt, setFormAtt] = useState(85.0);
  const [formArrears, setFormArrears] = useState(0);
  const [formSkills, setFormSkills] = useState('Python, SQL, React');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getStudents({
        q: q || undefined,
        department: dept === 'All' ? undefined : dept,
        riskLevel: risk === 'All' ? undefined : risk,
        momentum: moment === 'All' ? undefined : moment,
        sortBy, sortAsc, page, perPage: 25,
      });
      setStudents(res.students);
      setTotal(res.total);
      setPages(res.pages);
    } finally {
      setLoading(false);
    }
  }, [q, dept, risk, moment, sortBy, sortAsc, page]);

  useEffect(() => { setPage(1); }, [q, dept, risk, moment, sortBy, sortAsc]);
  useEffect(() => { load(); }, [load]);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');
    setSubmitting(true);
    try {
      const res = await createSingleStudent({
        rollNumber: formRoll,
        name: formName,
        email: formEmail,
        department: formDept,
        semester: Number(formSem),
        section: formSection,
        cgpa: Number(formCgpa),
        attendancePct: Number(formAtt),
        currentArrears: Number(formArrears),
        historicalArrears: Number(formArrears),
        technicalSkills: formSkills,
        placementReadiness: 65.0,
      });
      setSubmitSuccess(res.message || 'Student created successfully!');
      // Reset form
      setFormRoll('');
      setFormName('');
      setFormEmail('');
      load();
    } catch (err: any) {
      setSubmitError(err.response?.data?.detail || 'Failed to create student. Please verify roll number and email.');
    } finally {
      setSubmitting(false);
    }
  };

  const exportUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/exports/students${dept !== 'All' ? `?department=${encodeURIComponent(dept)}` : ''}`;

  return (
    <AppLayout>
      <div className="space-y-5 max-w-[1400px]">
        {/* Header with Title and Add New Student */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Student Management Explorer</h1>
            <p className="text-sm text-slate-400">{total} active students registered in database</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={exportUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 font-medium transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </a>
            <button
              onClick={() => { setShowAddModal(true); setSubmitError(''); setSubmitSuccess(''); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold shadow-lg shadow-indigo-600/30 transition-all"
            >
              <PlusCircle className="w-4 h-4" /> Add New Student
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by student name, roll number, or department…"
              className="w-full bg-[#080d1a] border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>
          <select
            value={dept}
            onChange={e => setDept(e.target.value)}
            className="bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {DEPTS.map(o => <option key={o} value={o}>Dept: {o}</option>)}
          </select>
          <select
            value={risk}
            onChange={e => setRisk(e.target.value)}
            className="bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {RISKS.map(o => <option key={o} value={o}>Risk: {o}</option>)}
          </select>
          <select
            value={moment}
            onChange={e => setMoment(e.target.value)}
            className="bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {MOMENTS.map(o => <option key={o} value={o}>Momentum: {o}</option>)}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
          </select>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:border-indigo-500/50 transition-all"
          >
            <ArrowUpDown className="w-3 h-3" />{sortAsc ? 'Asc' : 'Desc'}
          </button>
        </div>

        {/* Table */}
        <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Student Profile', 'Department & Sem', 'Success Index', 'Risk Level', 'Placement Readiness', 'Attendance', 'Momentum', 'Recovery Potential', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-slate-800/50">
                      {Array.from({ length: 9 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="skeleton h-4 rounded" /></td>)}
                    </tr>
                  ))
                ) : students.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">No student records match the active criteria.</td>
                  </tr>
                ) : (
                  students.map(s => (
                    <tr key={s.studentId} className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300">
                            {s.name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-200 group-hover:text-white transition-colors">{s.name}</p>
                            <p className="text-xs text-slate-500 font-mono">{s.studentId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {s.department}<br /><span className="text-slate-600">Sem {s.semester}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-white text-sm">{fmt(s.successIndex)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <RiskBadge level={s.riskLevel} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        {fmt(s.placementReadiness)}%
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        <span className={s.attendancePct < 75 ? 'text-rose-400 font-semibold' : ''}>{s.attendancePct}%</span>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">
                        <span className={s.momentum === 'POSITIVE' ? 'text-emerald-400' : s.momentum === 'NEGATIVE' ? 'text-rose-400' : 'text-slate-400'}>
                          {s.momentum}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {s.recoveryLabel ?? 'Medium'} ({fmt(s.recoveryPotential)}%)
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/students/${s.studentId}`}
                          className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Page {page} of {pages} ({total} students)</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        {/* Add Student Modal (Single Registration or Bulk CSV) */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0d1526] border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setShowAddModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              <h2 className="text-lg font-bold text-white mb-1">Add Student to Platform</h2>
              <p className="text-xs text-slate-400 mb-4">Choose registration mode for individual or batch provisioning</p>

              {/* Mode Switcher Tabs */}
              <div className="flex border-b border-slate-800 mb-5">
                <button
                  onClick={() => setAddMode('single')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-all',
                    addMode === 'single' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'
                  )}
                >
                  <UserPlus className="w-4 h-4" /> 1. Single Student Registration
                </button>
                <button
                  onClick={() => setAddMode('bulk')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-all',
                    addMode === 'bulk' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'
                  )}
                >
                  <FileSpreadsheet className="w-4 h-4" /> 2. Bulk Import via CSV
                </button>
              </div>

              {submitError && (
                <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {submitError}
                </div>
              )}
              {submitSuccess && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {submitSuccess}
                </div>
              )}

              {addMode === 'single' ? (
                <form onSubmit={handleSingleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-slate-300 block mb-1">Roll Number / Student ID *</label>
                      <input
                        required
                        value={formRoll}
                        onChange={e => setFormRoll(e.target.value)}
                        placeholder="e.g. CS24099"
                        className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-300 block mb-1">Full Legal Name *</label>
                      <input
                        required
                        value={formName}
                        onChange={e => setFormName(e.target.value)}
                        placeholder="e.g. Aditi Sharma"
                        className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-slate-300 block mb-1">College Email Address *</label>
                      <input
                        required
                        type="email"
                        value={formEmail}
                        onChange={e => setFormEmail(e.target.value)}
                        placeholder="aditi.s@campuspulse.edu"
                        className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-300 block mb-1">Department *</label>
                      <select
                        value={formDept}
                        onChange={e => setFormDept(e.target.value)}
                        className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        {DEPTS.filter(d => d !== 'All').map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-slate-300 block mb-1">Semester (1-8)</label>
                      <input
                        type="number"
                        min="1"
                        max="8"
                        value={formSem}
                        onChange={e => setFormSem(Number(e.target.value))}
                        className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-300 block mb-1">Section</label>
                      <input
                        value={formSection}
                        onChange={e => setFormSection(e.target.value)}
                        placeholder="A"
                        className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-300 block mb-1">Current CGPA (0-10)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="10"
                        value={formCgpa}
                        onChange={e => setFormCgpa(Number(e.target.value))}
                        className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-slate-300 block mb-1">Attendance Percentage (0-100)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={formAtt}
                        onChange={e => setFormAtt(Number(e.target.value))}
                        className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-slate-300 block mb-1">Active Backlogs / Arrears</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={formArrears}
                        onChange={e => setFormArrears(Number(e.target.value))}
                        className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-300 block mb-1">Technical Skills (Comma separated)</label>
                    <input
                      value={formSkills}
                      onChange={e => setFormSkills(e.target.value)}
                      placeholder="e.g. Python, SQL, React, Node.js"
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500"
                    />
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold shadow-lg shadow-indigo-600/30"
                    >
                      {submitting ? 'Creating Student...' : 'Create Student & Provision Account'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4 py-2">
                  <div className="bg-[#080d1a] border border-slate-800 rounded-xl p-5 text-center">
                    <FileSpreadsheet className="w-10 h-10 text-indigo-400 mx-auto mb-2" />
                    <h3 className="text-sm font-bold text-white mb-1">Batch Import Whole Cohorts via CSV</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
                      Upload batches of 100, 500, or more students with pre-import validation, duplicate detection, and linked login credential generation.
                    </p>
                    <Link
                      href="/students/import"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold transition-all shadow-lg shadow-indigo-600/30"
                    >
                      Open Dedicated CSV Import Console →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
