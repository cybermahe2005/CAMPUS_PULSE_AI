'use client';
import AppLayout from '@/components/layout/AppLayout';
import { useEffect, useState, useCallback } from 'react';
import {
  createExam, getExams, submitExamMarks, publishExam, getAttendanceRoster
} from '@/lib/api';
import {
  BookOpen, PlusCircle, CheckCircle2, AlertCircle, FileSpreadsheet,
  UploadCloud, Send, Eye, ShieldCheck, X
} from 'lucide-react';

const DEPTS = ['Computer Science and Engineering', 'Electronics and Communication', 'Mechanical Engineering', 'Information Technology', 'Civil Engineering', 'MBA'];
const EXAM_TYPES = [
  { value: 'INTERNAL_ASSESSMENT_1', label: 'Internal Assessment 1 (IA-1)' },
  { value: 'INTERNAL_ASSESSMENT_2', label: 'Internal Assessment 2 (IA-2)' },
  { value: 'MID_TERM', label: 'Mid-Term Examination' },
  { value: 'END_SEMESTER', label: 'End Semester University Exam' },
  { value: 'ASSIGNMENT', label: 'Continuous Evaluation / Assignment' },
];

export default function AssessmentsPage() {
  const [activeTab, setActiveTab] = useState<'exams' | 'marks' | 'create'>('exams');
  const [exams, setExams] = useState<any[]>([]);
  const [department, setDepartment] = useState('Computer Science and Engineering');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create Exam Form
  const [examName, setExamName] = useState('Mid-Term Exam 1');
  const [examType, setExamType] = useState('MID_TERM');
  const [semester, setSemester] = useState(4);
  const [section, setSection] = useState('A');
  const [subject, setSubject] = useState('CS401 - Data Structures');
  const [maxMarks, setMaxMarks] = useState(50);
  const [passingMarks, setPassingMarks] = useState(20);
  const [examDate, setExamDate] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setExamDate(new Date().toISOString().split('T')[0]);
  }, []);

  // Marks Entry State
  const [selectedExam, setSelectedExam] = useState<any | null>(null);
  const [marksRoster, setMarksRoster] = useState<any[]>([]);
  const [marksMap, setMarksMap] = useState<Record<string, number>>({});
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [savingMarks, setSavingMarks] = useState(false);

  const loadExams = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getExams({ department });
      setExams(res.exams || []);
      if (!selectedExam && res.exams?.length > 0) {
        setSelectedExam(res.exams[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [department, selectedExam]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  const loadExamRoster = useCallback(async (exam: any) => {
    if (!exam) return;
    setLoadingRoster(true);
    try {
      const res = await getAttendanceRoster(exam.department, exam.semester, exam.section === 'All' ? undefined : exam.section);
      setMarksRoster(res.students || []);
      const initMap: Record<string, number> = {};
      (res.students || []).forEach((s: any) => {
        initMap[s.studentId] = Math.round(exam.maxMarks * 0.75);
      });
      setMarksMap(initMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRoster(false);
    }
  }, []);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setStatusMsg(null);
    try {
      const res = await createExam({
        examName,
        examType,
        academicYear: '2026-2027',
        semester: Number(semester),
        department,
        section,
        subject,
        maxMarks: Number(maxMarks),
        passingMarks: Number(passingMarks),
        examDate,
      });
      setStatusMsg({ type: 'success', text: res.message || 'Assessment created successfully!' });
      setActiveTab('exams');
      loadExams();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to create assessment' });
    } finally {
      setCreating(false);
    }
  };

  const handleSelectExamForMarks = (exam: any) => {
    setSelectedExam(exam);
    setActiveTab('marks');
    loadExamRoster(exam);
  };

  const handleSubmitMarks = async () => {
    if (!selectedExam || marksRoster.length === 0) return;
    setSavingMarks(true);
    setStatusMsg(null);
    try {
      const marksList = marksRoster.map(s => ({
        studentId: s.studentId,
        obtainedMarks: Number(marksMap[s.studentId] ?? 0),
      }));

      const res = await submitExamMarks({
        examId: selectedExam.examId,
        marks: marksList,
      });

      setStatusMsg({ type: 'success', text: res.message || 'Marks saved successfully!' });
      loadExams();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to save marks' });
    } finally {
      setSavingMarks(false);
    }
  };

  const handlePublish = async (examId: string) => {
    try {
      const res = await publishExam(examId);
      setStatusMsg({ type: 'success', text: res.message || 'Exam results published to students!' });
      loadExams();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to publish results' });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-5 max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-400" /> Exam, Internal Marks & Continuous Assessment
            </h1>
            <p className="text-sm text-slate-400">
              Assessment creation, marks entry with boundary enforcement, publication workflows, and grade reporting
            </p>
          </div>
          <button
            onClick={() => setActiveTab('create')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold shadow-lg shadow-indigo-600/30 transition-all self-start sm:self-auto"
          >
            <PlusCircle className="w-4 h-4" /> Create New Assessment
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab('exams')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'exams' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" /> Assessments Roster & Publication Status
          </button>
          <button
            onClick={() => setActiveTab('marks')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'marks' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" /> Marks Entry Matrix ({selectedExam?.examName || 'Select Assessment'})
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'create' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <PlusCircle className="w-4 h-4" /> Assessment Setup
          </button>
        </div>

        {statusMsg && (
          <div className={`p-4 rounded-xl text-xs font-medium border flex items-center justify-between ${
            statusMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            <span>{statusMsg.text}</span>
            <button onClick={() => setStatusMsg(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* TAB 1: EXAMS ROSTER & PUBLICATION */}
        {activeTab === 'exams' && (
          <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400 font-medium">Department Filter:</span>
                <select
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  className="bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                >
                  {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <span className="text-xs text-slate-500">{exams.length} assessments configured</span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Assessment Details</th>
                  <th className="px-4 py-3 text-left">Subject / Course</th>
                  <th className="px-4 py-3 text-left">Max / Pass</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {exams.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">No assessments found for this department.</td>
                  </tr>
                ) : (
                  exams.map(e => (
                    <tr key={e.examId} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-slate-200">{e.examName}</p>
                        <p className="text-[10px] text-slate-500 uppercase font-mono">{e.examType} · Sem {e.semester}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300 font-medium">{e.subject}</td>
                      <td className="px-4 py-3 text-xs text-slate-300">{e.maxMarks} / <span className="text-amber-400">{e.passingMarks}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-400">{e.examDate}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          e.isPublished
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}>
                          {e.isPublished ? 'PUBLISHED' : 'DRAFT'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSelectExamForMarks(e)}
                            className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
                          >
                            Enter Marks
                          </button>
                          {!e.isPublished && (
                            <button
                              onClick={() => handlePublish(e.examId)}
                              className="px-2.5 py-1 text-xs rounded-lg bg-indigo-600/30 border border-indigo-500/50 text-indigo-300 hover:text-white flex items-center gap-1 font-semibold"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" /> Publish
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: MARKS ENTRY MATRIX */}
        {activeTab === 'marks' && (
          <div className="space-y-4">
            {selectedExam ? (
              <>
                <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedExam.examName}</h3>
                    <p className="text-xs text-slate-400">
                      Subject: {selectedExam.subject} · Maximum Marks: <strong className="text-white">{selectedExam.maxMarks}</strong> · Passing: <strong className="text-amber-400">{selectedExam.passingMarks}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSubmitMarks}
                      disabled={savingMarks || marksRoster.length === 0}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs text-white font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" /> {savingMarks ? 'Saving Marks...' : 'Save & Validate Marks'}
                    </button>
                  </div>
                </div>

                <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] text-slate-500 uppercase tracking-wider">
                        <th className="px-4 py-3 text-left">Roll Number</th>
                        <th className="px-4 py-3 text-left">Student Name</th>
                        <th className="px-4 py-3 text-left">Department</th>
                        <th className="px-4 py-3 text-left">Obtained Marks (Max: {selectedExam.maxMarks})</th>
                        <th className="px-4 py-3 text-right">Result Preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingRoster ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i} className="border-b border-slate-800/40">
                            <td colSpan={5} className="px-4 py-3"><div className="skeleton h-4 rounded" /></td>
                          </tr>
                        ))
                      ) : marksRoster.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">No students found for this assessment roster.</td>
                        </tr>
                      ) : (
                        marksRoster.map(s => {
                          const val = marksMap[s.studentId] ?? 0;
                          const isOverMax = val > selectedExam.maxMarks;
                          const isPass = val >= selectedExam.passingMarks;
                          return (
                            <tr key={s.studentId} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                              <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{s.studentId}</td>
                              <td className="px-4 py-2.5 font-medium text-slate-200">{s.name}</td>
                              <td className="px-4 py-2.5 text-xs text-slate-400">{s.department}</td>
                              <td className="px-4 py-2.5">
                                <input
                                  type="number"
                                  min="0"
                                  max={selectedExam.maxMarks}
                                  value={val}
                                  onChange={e => setMarksMap(prev => ({ ...prev, [s.studentId]: Number(e.target.value) }))}
                                  className={`w-24 bg-[#080d1a] border rounded-lg px-2.5 py-1 text-xs text-white ${
                                    isOverMax ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-700'
                                  }`}
                                />
                                {isOverMax && <span className="text-[10px] text-rose-400 ml-2">Exceeds Max!</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isPass ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                }`}>
                                  {isPass ? 'PASSED' : 'NEEDS REMEDIAL'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs bg-[#0d1526] border border-slate-700 rounded-2xl">
                Please select an assessment from the roster tab first.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CREATE ASSESSMENT */}
        {activeTab === 'create' && (
          <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl p-6 max-w-2xl">
            <h2 className="text-base font-bold text-white mb-1">Configure New Examination or Assessment</h2>
            <p className="text-xs text-slate-400 mb-5">Set up continuous assessments, internal exams, or assignments</p>

            <form onSubmit={handleCreateExam} className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-slate-300 block mb-1">Assessment Name *</label>
                <input
                  required
                  value={examName}
                  onChange={e => setExamName(e.target.value)}
                  placeholder="e.g. Mid-Term Assessment 1"
                  className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Assessment Category *</label>
                  <select
                    value={examType}
                    onChange={e => setExamType(e.target.value)}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Department *</label>
                  <select
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Semester</label>
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={semester}
                    onChange={e => setSemester(Number(e.target.value))}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Maximum Marks</label>
                  <input
                    type="number"
                    min="10"
                    max="200"
                    value={maxMarks}
                    onChange={e => setMaxMarks(Number(e.target.value))}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Passing Marks</label>
                  <input
                    type="number"
                    min="0"
                    max={maxMarks}
                    value={passingMarks}
                    onChange={e => setPassingMarks(Number(e.target.value))}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Subject / Course Code *</label>
                  <input
                    required
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. CS401 - Data Structures"
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-slate-300 block mb-1">Assessment Date *</label>
                  <input
                    type="date"
                    required
                    value={examDate}
                    onChange={e => setExamDate(e.target.value)}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('exams')}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold shadow-lg shadow-indigo-600/30"
                >
                  {creating ? 'Saving...' : 'Create Assessment in Draft Status'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
