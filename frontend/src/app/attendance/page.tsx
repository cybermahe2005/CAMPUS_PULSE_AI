'use client';
import AppLayout from '@/components/layout/AppLayout';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  getAttendanceRoster, markAttendanceSession, getAttendanceSessions,
  correctAttendance, getAttendanceAnalytics, getTimetablePeriodStatus,
  getAttendanceAssignments, createAttendanceAssignment, deactivateAttendanceAssignment,
  getODRequests, reviewODRequest, submitODRequest, getMyAttendance
} from '@/lib/api';
import {
  Calendar, Clock, CheckCircle2, XCircle, AlertCircle, RefreshCw,
  Download, UserCheck, ShieldAlert, Edit3, X, Users, Check,
  FileText, Send, UserX, AlertTriangle, ShieldCheck, Award, Eye
} from 'lucide-react';

const DEPTS = [
  'Computer Science and Engineering',
  'Electronics and Communication',
  'Mechanical Engineering',
  'Information Technology',
  'Civil Engineering',
  'MBA'
];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

const PERIOD_SCHEDULE: Record<number, { start: string; end: string }> = {
  1: { start: '09:00', end: '09:50' },
  2: { start: '09:50', end: '10:40' },
  3: { start: '10:55', end: '11:45' },
  4: { start: '11:45', end: '12:35' },
  5: { start: '13:25', end: '14:15' },
  6: { start: '14:15', end: '15:05' },
  7: { start: '15:15', end: '16:00' },
  8: { start: '16:00', end: '16:45' },
};

export default function AttendancePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'mark' | 'assignments' | 'od_queue' | 'analytics'>('mark');

  // Form State for Session
  const [department, setDepartment] = useState('Computer Science and Engineering');
  const [semester, setSemester] = useState(4);
  const [section, setSection] = useState('A');
  const [subject, setSubject] = useState('CS401 - Data Structures');
  const [period, setPeriod] = useState(1);
  const [date, setDate] = useState('');
  const [allowTestingWindow, setAllowTestingWindow] = useState(true);

  // Timetable Status State
  const [periodStatus, setPeriodStatus] = useState<any>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Roster & Attendance Map
  const [roster, setRoster] = useState<any[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({});
  const [absenceDetails, setAbsenceDetails] = useState<Record<string, { reason: string; leaveCategory: string }>>({});
  const [odDetails, setOdDetails] = useState<Record<string, { purpose: string; eventName: string; destination: string; proofDocument: string }>>({});

  const [loadingRoster, setLoadingRoster] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Absence Modal
  const [absenceModalStudent, setAbsenceModalStudent] = useState<any | null>(null);
  const [tempAbsenceReason, setTempAbsenceReason] = useState('');
  const [tempLeaveCategory, setTempLeaveCategory] = useState('Medical');

  // OD Modal
  const [odModalStudent, setOdModalStudent] = useState<any | null>(null);
  const [tempOdPurpose, setTempOdPurpose] = useState('Academic Symposium');
  const [tempOdEvent, setTempOdEvent] = useState('');
  const [tempOdDestination, setTempOdDestination] = useState('');
  const [tempOdProof, setTempOdProof] = useState('');

  // Assignments State (Tab 2)
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    batch: '2023-2027',
    year: 2,
    semester: 4,
    section: 'A',
    classAdvisorId: 'FAC001',
    subjectFacultyId: 'FAC001',
    subjectCode: 'CS401',
    subjectName: 'Data Structures',
    period: 1,
    substituteFacultyId: '',
  });

  // OD Requests Queue State (Tab 3)
  const [odRequests, setOdRequests] = useState<any[]>([]);
  const [loadingOD, setLoadingOD] = useState(false);
  const [odFilterStatus, setOdFilterStatus] = useState<string>('ALL');
  const [reviewRemarks, setReviewRemarks] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // Sessions & Analytics State (Tab 4)
  const [sessions, setSessions] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Correction Modal State
  const [correctModal, setCorrectModal] = useState<any | null>(null);
  const [correctStudentId, setCorrectStudentId] = useState('');
  const [correctNewStatus, setCorrectNewStatus] = useState('PRESENT');
  const [correctReason, setCorrectReason] = useState('');
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // Student Self-Attendance (for student role)
  const [studentSelfData, setStudentSelfData] = useState<any | null>(null);

  useEffect(() => {
    setDate(new Date().toISOString().split('T')[0]);
    if (user?.department) {
      setDepartment(user.department);
    }
  }, [user]);

  // Timetable status checker
  const checkTimetableStatus = useCallback(async () => {
    try {
      setCheckingStatus(true);
      const res = await getTimetablePeriodStatus({
        period,
        date: date || new Date().toISOString().split('T')[0],
        department,
        semester,
        section,
        subject,
      });
      setPeriodStatus(res);
    } catch (err) {
      console.error('Failed to get timetable status', err);
    } finally {
      setCheckingStatus(false);
    }
  }, [period, date, department, semester, section, subject]);

  useEffect(() => {
    checkTimetableStatus();
    const interval = setInterval(checkTimetableStatus, 30000);
    return () => clearInterval(interval);
  }, [checkTimetableStatus]);

  // Load Roster
  const loadRoster = useCallback(async () => {
    setLoadingRoster(true);
    setStatusMsg(null);
    try {
      const res = await getAttendanceRoster(department, semester, section);
      setRoster(res.students || []);
      const initialMap: Record<string, string> = {};
      (res.students || []).forEach((s: any) => {
        initialMap[s.studentId] = 'PRESENT';
      });
      setAttendanceMap(initialMap);
    } catch (err: any) {
      console.error(err);
      setStatusMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to load roster' });
    } finally {
      setLoadingRoster(false);
    }
  }, [department, semester, section]);

  // Load Assignments
  const loadAssignments = useCallback(async () => {
    setLoadingAssignments(true);
    try {
      const res = await getAttendanceAssignments({ department });
      setAssignments(res.assignments || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAssignments(false);
    }
  }, [department]);

  // Load OD Requests
  const loadODRequests = useCallback(async () => {
    setLoadingOD(true);
    try {
      const params: any = {};
      if (odFilterStatus !== 'ALL') params.status = odFilterStatus;
      if (user?.role === 'HOD' || user?.role === 'FACULTY') {
        params.department = department;
      }
      const res = await getODRequests(params);
      setOdRequests(res.requests || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingOD(false);
    }
  }, [odFilterStatus, department, user]);

  // Load Analytics & Sessions
  const loadAnalyticsAndSessions = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const [sessRes, analRes] = await Promise.all([
        getAttendanceSessions({ department }),
        getAttendanceAnalytics(department),
      ]);
      setSessions(sessRes.sessions || []);
      setAnalytics(analRes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [department]);

  // Load Student Self data if student
  useEffect(() => {
    if (user?.role === 'STUDENT') {
      getMyAttendance()
        .then(res => setStudentSelfData(res))
        .catch(err => console.error(err));
    }
  }, [user]);

  // Dispatch Tab Loads
  useEffect(() => {
    if (activeTab === 'mark') {
      loadRoster();
    } else if (activeTab === 'assignments') {
      loadAssignments();
    } else if (activeTab === 'od_queue') {
      loadODRequests();
    } else if (activeTab === 'analytics') {
      loadAnalyticsAndSessions();
    }
  }, [activeTab, loadRoster, loadAssignments, loadODRequests, loadAnalyticsAndSessions]);

  // Status Change Handler
  const handleSetStatus = (student: any, status: string) => {
    if (status === 'ABSENT') {
      setAbsenceModalStudent(student);
      setTempAbsenceReason(absenceDetails[student.studentId]?.reason || '');
      setTempLeaveCategory(absenceDetails[student.studentId]?.leaveCategory || 'Medical');
    } else if (status === 'OD') {
      setOdModalStudent(student);
      setTempOdPurpose(odDetails[student.studentId]?.purpose || 'Academic Symposium');
      setTempOdEvent(odDetails[student.studentId]?.eventName || '');
      setTempOdDestination(odDetails[student.studentId]?.destination || '');
      setTempOdProof(odDetails[student.studentId]?.proofDocument || '');
    } else {
      setAttendanceMap(prev => ({ ...prev, [student.studentId]: status }));
    }
  };

  const handleSaveAbsenceDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!absenceModalStudent) return;
    if (!tempAbsenceReason.trim()) {
      alert('Mandatory: An absence reason must be recorded.');
      return;
    }
    setAbsenceDetails(prev => ({
      ...prev,
      [absenceModalStudent.studentId]: {
        reason: tempAbsenceReason.trim(),
        leaveCategory: tempLeaveCategory,
      },
    }));
    setAttendanceMap(prev => ({ ...prev, [absenceModalStudent.studentId]: 'ABSENT' }));
    setAbsenceModalStudent(null);
  };

  const handleSaveODDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!odModalStudent) return;
    if (!tempOdEvent.trim()) {
      alert('Mandatory: Event name must be specified for On-Duty leave.');
      return;
    }
    setOdDetails(prev => ({
      ...prev,
      [odModalStudent.studentId]: {
        purpose: tempOdPurpose,
        eventName: tempOdEvent.trim(),
        destination: tempOdDestination.trim(),
        proofDocument: tempOdProof.trim(),
      },
    }));
    setAttendanceMap(prev => ({ ...prev, [odModalStudent.studentId]: 'OD' }));
    setOdModalStudent(null);
  };

  const handleSetAll = (status: string) => {
    const updated: Record<string, string> = {};
    roster.forEach(s => { updated[s.studentId] = status; });
    setAttendanceMap(updated);
  };

  // Submit Session
  const handleSaveSession = async () => {
    if (roster.length === 0) return;

    // Check if user is read-only (Principal, Joint Secretary)
    if (user?.role === 'PRINCIPAL' || user?.role === 'JOINT_SECRETARY') {
      setStatusMsg({
        type: 'error',
        text: 'Access Denied: Principal and Joint Secretary possess institution-wide read-only analytical access and cannot submit attendance sessions.',
      });
      return;
    }

    // Validation: ABSENT records must have reason
    const absentWithoutReason = roster.filter(
      s => attendanceMap[s.studentId] === 'ABSENT' && !absenceDetails[s.studentId]?.reason
    );
    if (absentWithoutReason.length > 0) {
      setStatusMsg({
        type: 'error',
        text: `Validation Failed: ${absentWithoutReason.length} absent student(s) lack a mandatory absence reason. Please click ABSENT to input justification.`,
      });
      return;
    }

    // Validation: OD records must have event
    const odWithoutEvent = roster.filter(
      s => attendanceMap[s.studentId] === 'OD' && !odDetails[s.studentId]?.eventName
    );
    if (odWithoutEvent.length > 0) {
      setStatusMsg({
        type: 'error',
        text: `Validation Failed: ${odWithoutEvent.length} student(s) marked On-Duty lack event details.`,
      });
      return;
    }

    setSavingSession(true);
    setStatusMsg(null);
    try {
      const records = roster.map(s => {
        const st = attendanceMap[s.studentId] || 'PRESENT';
        return {
          studentId: s.studentId,
          status: st,
          absenceReason: st === 'ABSENT' ? absenceDetails[s.studentId]?.reason : undefined,
          leaveCategory: st === 'ABSENT' ? absenceDetails[s.studentId]?.leaveCategory : undefined,
          odPurpose: st === 'OD' ? odDetails[s.studentId]?.purpose : undefined,
          eventName: st === 'OD' ? odDetails[s.studentId]?.eventName : undefined,
          destination: st === 'OD' ? odDetails[s.studentId]?.destination : undefined,
          proofDocument: st === 'OD' ? odDetails[s.studentId]?.proofDocument : undefined,
        };
      });

      const res = await markAttendanceSession({
        date,
        period: Number(period),
        department,
        semester: Number(semester),
        section,
        subject,
        subjectCode: subject.split(' ')[0] || 'CS401',
        records,
        allowTestingWindow,
      });

      setStatusMsg({ type: 'success', text: res.message || 'Attendance session successfully recorded and finalized!' });
      checkTimetableStatus();
    } catch (err: any) {
      console.error(err);
      setStatusMsg({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to submit attendance session.',
      });
    } finally {
      setSavingSession(false);
    }
  };

  // Tab 2: Create Assignment
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const sched = PERIOD_SCHEDULE[Number(newAssignment.period)] || { start: '09:00', end: '09:50' };
      await createAttendanceAssignment({
        department,
        batch: newAssignment.batch,
        year: Number(newAssignment.year),
        semester: Number(newAssignment.semester),
        section: newAssignment.section,
        classAdvisorId: newAssignment.classAdvisorId,
        subjectFacultyId: newAssignment.subjectFacultyId,
        subjectCode: newAssignment.subjectCode,
        subjectName: newAssignment.subjectName,
        period: Number(newAssignment.period),
        startTime: sched.start,
        endTime: sched.end,
        substituteFacultyId: newAssignment.substituteFacultyId || undefined,
      });
      alert('Faculty & Class Advisor assignment successfully created!');
      loadAssignments();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create assignment');
    }
  };

  const handleDeactivateAssignment = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this faculty assignment?')) return;
    try {
      await deactivateAttendanceAssignment(id);
      loadAssignments();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to deactivate assignment');
    }
  };

  // Tab 3: OD Review
  const handleReviewOD = async (odId: string, status: 'APPROVED' | 'REJECTED') => {
    setReviewingId(odId);
    try {
      const remarks = reviewRemarks[odId] || (status === 'APPROVED' ? 'Approved by HOD' : 'Rejected by HOD');
      await reviewODRequest(odId, { status, remarks });
      loadODRequests();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to review OD request');
    } finally {
      setReviewingId(null);
    }
  };

  // Tab 4: Auditable Correction Submit
  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctModal) return;
    setSubmittingCorrection(true);
    try {
      await correctAttendance({
        sessionId: correctModal.sessionId,
        studentId: correctStudentId,
        newStatus: correctNewStatus,
        reason: correctReason,
      });
      setCorrectModal(null);
      loadAnalyticsAndSessions();
      alert('Attendance record corrected and immutably logged with justification audit.');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Correction failed');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  const presentCount = Object.values(attendanceMap).filter(v => v === 'PRESENT').length;
  const absentCount = Object.values(attendanceMap).filter(v => v === 'ABSENT').length;
  const odCount = Object.values(attendanceMap).filter(v => v === 'OD').length;

  const exportUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/exports/attendance?department=${encodeURIComponent(department)}`;

  const isReadOnlyRole = user?.role === 'PRINCIPAL' || user?.role === 'JOINT_SECRETARY';
  const isStudent = user?.role === 'STUDENT';

  return (
    <AppLayout>
      <div className="space-y-5 max-w-[1400px]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" /> Secure Role-Based Attendance Management System
            </h1>
            <p className="text-sm text-slate-400">
              Period-wise server-authoritative timetable access, HOD teaching assignment control, OD workflow & immutable audit logging
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isReadOnlyRole && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 font-medium">
                <Eye className="w-3.5 h-3.5" /> Read-Only Executive Analytics
              </span>
            )}
            <a
              href={exportUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 font-medium transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Export Attendance CSV
            </a>
          </div>
        </div>

        {/* Student Self-Service Banner if logged in as student */}
        {isStudent && studentSelfData && (
          <div className="bg-gradient-to-r from-indigo-950/60 to-purple-950/60 border border-indigo-700/50 rounded-2xl p-5 shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-indigo-400 font-semibold">Student Personal Attendance Status</p>
                <h2 className="text-lg font-bold text-white mt-1">{studentSelfData.name} ({studentSelfData.studentId})</h2>
                <p className="text-xs text-slate-300 mt-0.5">{studentSelfData.department} · Semester {studentSelfData.semester} · Section {studentSelfData.section}</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 uppercase">Overall Attendance</p>
                  <p className={`text-2xl font-black ${studentSelfData.attendancePct < 75 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {studentSelfData.attendancePct}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 uppercase">Classes Attended</p>
                  <p className="text-xl font-bold text-white">{studentSelfData.attendedClasses} / {studentSelfData.totalClasses}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-slate-400 uppercase">OD Approved</p>
                  <p className="text-xl font-bold text-sky-400">{studentSelfData.odApprovedCount || 0}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4 Navigation Tabs */}
        <div className="flex border-b border-slate-800 overflow-x-auto">
          <button
            onClick={() => setActiveTab('mark')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'mark' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-4 h-4" /> 1. Period Attendance Marking
          </button>
          <button
            onClick={() => setActiveTab('assignments')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'assignments' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" /> 2. HOD Faculty & Class Advisor Assignments
          </button>
          <button
            onClick={() => setActiveTab('od_queue')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'od_queue' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Award className="w-4 h-4" /> 3. On-Duty (OD) Approval Queue
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
              activeTab === 'analytics' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" /> 4. Sessions, Analytics & Correction Audit
          </button>
        </div>

        {statusMsg && (
          <div className={`p-4 rounded-xl text-xs font-medium border flex items-center justify-between ${
            statusMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
            statusMsg.type === 'warning' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' :
            'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            <span>{statusMsg.text}</span>
            <button onClick={() => setStatusMsg(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: PERIOD ATTENDANCE MARKING */}
        {/* ========================================================================= */}
        {activeTab === 'mark' && (
          <div className="space-y-4">
            {/* Live Timetable Window Status Bar */}
            <div className="bg-[#0b1324] border border-slate-700/80 rounded-2xl p-4 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  periodStatus?.windowState === 'OPEN' ? 'bg-emerald-500/20 text-emerald-400' :
                  periodStatus?.windowState === 'UPCOMING' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-rose-500/20 text-rose-400'
                }`}>
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Timetable Period Window:</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      periodStatus?.windowState === 'OPEN' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                      periodStatus?.windowState === 'UPCOMING' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                      'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}>
                      {periodStatus?.windowState || 'EVALUATING'}
                    </span>
                    <span className="text-xs text-slate-300 font-mono">
                      (Scheduled: {periodStatus?.periodStartTime || PERIOD_SCHEDULE[period]?.start} - {periodStatus?.periodEndTime || PERIOD_SCHEDULE[period]?.end} IST)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Server-authoritative time: <span className="font-mono text-slate-200">{periodStatus?.currentTimeIst || 'Live IST'}</span> ·{' '}
                    {periodStatus?.windowState === 'OPEN' ? (
                      <span className="text-emerald-400 font-semibold">Session Open · Closes in {Math.max(0, Math.floor((periodStatus?.remainingSeconds || 0) / 60))}m</span>
                    ) : periodStatus?.windowState === 'UPCOMING' ? (
                      <span className="text-amber-400">Opens at scheduled start time</span>
                    ) : (
                      <span className="text-rose-400">Window closed · Modifying closed period requires authorized Audited Correction</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Dev/Testing Mode Toggle for Faculty Verification */}
              <div className="flex items-center gap-2 bg-[#080d1a] px-3 py-1.5 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  id="testingWindowToggle"
                  checked={allowTestingWindow}
                  onChange={e => setAllowTestingWindow(e.target.checked)}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                />
                <label htmlFor="testingWindowToggle" className="text-[11px] text-slate-300 cursor-pointer select-none">
                  Faculty Testing Window Mode
                </label>
              </div>
            </div>

            {/* Teaching Assignment & Session Parameters */}
            <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Teaching Assignment & Period Setup</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Period (1 to 8)</label>
                  <select
                    value={period}
                    onChange={e => setPeriod(Number(e.target.value))}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {PERIODS.map(p => (
                      <option key={p} value={p}>
                        Period {p} ({PERIOD_SCHEDULE[p]?.start} - {PERIOD_SCHEDULE[p]?.end})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="text-[11px] text-slate-400 block mb-1">Department</label>
                  <select
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Semester</label>
                  <select
                    value={semester}
                    onChange={e => setSemester(Number(e.target.value))}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Section</label>
                  <select
                    value={section}
                    onChange={e => setSection(e.target.value)}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="A">Section A</option>
                    <option value="B">Section B</option>
                  </select>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <div className="flex-1 min-w-[280px]">
                  <label className="text-[11px] text-slate-400 block mb-1">Assigned Subject Code & Name</label>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. CS401 - Data Structures"
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <button
                  onClick={loadRoster}
                  disabled={loadingRoster}
                  className="mt-4 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200 hover:border-slate-600 font-medium flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingRoster ? 'animate-spin' : ''}`} /> Refresh Class Roster
                </button>
              </div>
            </div>

            {/* Live Stats & Bulk Marking Action Bar */}
            <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-slate-400 font-medium">Session Live Stats:</span>
                <span className="text-emerald-400 font-bold">{presentCount} Present</span>
                <span className="text-rose-400 font-bold">{absentCount} Absent</span>
                <span className="text-sky-400 font-bold">{odCount} On-Duty (OD)</span>
                <span className="text-slate-400">Total: {roster.length} Students</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSetAll('PRESENT')}
                  className="px-2.5 py-1 text-[11px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg hover:bg-emerald-500/20"
                >
                  Mark All Present
                </button>
                <button
                  onClick={() => handleSetAll('ABSENT')}
                  className="px-2.5 py-1 text-[11px] bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg hover:bg-rose-500/20"
                >
                  Mark All Absent
                </button>
                <button
                  onClick={handleSaveSession}
                  disabled={savingSession || roster.length === 0 || isReadOnlyRole}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs text-white font-bold shadow-lg shadow-indigo-600/30 transition-all ml-2 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {savingSession ? 'Submitting...' : 'Finalize & Submit Session'}
                </button>
              </div>
            </div>

            {/* Student Roster Table with Field-Level Parent Privacy */}
            <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl overflow-hidden shadow-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-500 uppercase tracking-wider bg-[#080d1a]/50">
                    <th className="px-4 py-3 text-left">Roll Number</th>
                    <th className="px-4 py-3 text-left">Student Name</th>
                    <th className="px-4 py-3 text-left">Section</th>
                    <th className="px-4 py-3 text-left">Attendance Rate</th>
                    <th className="px-4 py-3 text-left">Parent Contact</th>
                    <th className="px-4 py-3 text-center">Period Attendance Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRoster ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-slate-800/40">
                        <td colSpan={6} className="px-4 py-3"><div className="skeleton h-4 rounded" /></td>
                      </tr>
                    ))
                  ) : roster.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">No students found in this department/semester.</td>
                    </tr>
                  ) : (
                    roster.map(s => {
                      const curStatus = attendanceMap[s.studentId] || 'PRESENT';
                      const abs = absenceDetails[s.studentId];
                      const od = odDetails[s.studentId];

                      return (
                        <tr key={s.studentId} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{s.studentId}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-200">
                            {s.name}
                            {curStatus === 'ABSENT' && abs && (
                              <div className="text-[10px] text-rose-400 mt-0.5 truncate max-w-xs">
                                Reason: {abs.reason} ({abs.leaveCategory})
                              </div>
                            )}
                            {curStatus === 'OD' && od && (
                              <div className="text-[10px] text-sky-400 mt-0.5 truncate max-w-xs">
                                Event: {od.eventName} ({od.purpose})
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-400">{s.section || section}</td>
                          <td className="px-4 py-2.5 text-xs">
                            <span className={s.attendancePct < 75 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                              {s.attendancePct}%
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono">
                            {s.parentContact ? (
                              <span className="text-slate-300">{s.parentContact}</span>
                            ) : (
                              <span className="text-slate-500 italic">Protected (Field-Level Privacy)</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="inline-flex rounded-lg border border-slate-700 p-0.5 bg-[#080d1a]">
                              {['PRESENT', 'ABSENT', 'OD'].map(st => (
                                <button
                                  key={st}
                                  onClick={() => handleSetStatus(s, st)}
                                  className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all ${
                                    curStatus === st
                                      ? st === 'PRESENT' ? 'bg-emerald-600 text-white' :
                                        st === 'ABSENT' ? 'bg-rose-600 text-white' :
                                        'bg-sky-600 text-white'
                                      : 'text-slate-400 hover:text-white'
                                  }`}
                                >
                                  {st === 'OD' ? 'ON DUTY' : st}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: HOD FACULTY & CLASS ADVISOR ASSIGNMENTS */}
        {/* ========================================================================= */}
        {activeTab === 'assignments' && (
          <div className="space-y-6">
            {/* Create Assignment Form */}
            <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl p-5 shadow-lg">
              <h2 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" /> HOD Teaching & Class Advisor Assignment Control
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Assign Class Advisors and Subject Faculty to department classes and timetable periods. Cross-department assignments are prohibited.
              </p>

              <form onSubmit={handleCreateAssignment} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Department (HOD Scoped)</label>
                    <select
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                      disabled={user?.role === 'HOD'}
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Batch</label>
                    <input
                      required
                      value={newAssignment.batch}
                      onChange={e => setNewAssignment(prev => ({ ...prev, batch: e.target.value }))}
                      placeholder="2023-2027"
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Semester</label>
                    <select
                      value={newAssignment.semester}
                      onChange={e => setNewAssignment(prev => ({ ...prev, semester: Number(e.target.value) }))}
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Section</label>
                    <select
                      value={newAssignment.section}
                      onChange={e => setNewAssignment(prev => ({ ...prev, section: e.target.value }))}
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="A">Section A</option>
                      <option value="B">Section B</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Class Advisor Faculty ID *</label>
                    <input
                      required
                      value={newAssignment.classAdvisorId}
                      onChange={e => setNewAssignment(prev => ({ ...prev, classAdvisorId: e.target.value }))}
                      placeholder="e.g. FAC001"
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Subject Faculty ID *</label>
                    <input
                      required
                      value={newAssignment.subjectFacultyId}
                      onChange={e => setNewAssignment(prev => ({ ...prev, subjectFacultyId: e.target.value }))}
                      placeholder="e.g. FAC001"
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Subject Code *</label>
                    <input
                      required
                      value={newAssignment.subjectCode}
                      onChange={e => setNewAssignment(prev => ({ ...prev, subjectCode: e.target.value }))}
                      placeholder="e.g. CS401"
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Subject Name *</label>
                    <input
                      required
                      value={newAssignment.subjectName}
                      onChange={e => setNewAssignment(prev => ({ ...prev, subjectName: e.target.value }))}
                      placeholder="Data Structures"
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Timetable Period (1-8)</label>
                    <select
                      value={newAssignment.period}
                      onChange={e => setNewAssignment(prev => ({ ...prev, period: Number(e.target.value) }))}
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      {PERIODS.map(p => (
                        <option key={p} value={p}>
                          Period {p} ({PERIOD_SCHEDULE[p]?.start} - {PERIOD_SCHEDULE[p]?.end})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Substitute Faculty ID (Optional)</label>
                    <input
                      value={newAssignment.substituteFacultyId}
                      onChange={e => setNewAssignment(prev => ({ ...prev, substituteFacultyId: e.target.value }))}
                      placeholder="e.g. FAC003"
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={isReadOnlyRole}
                      className="w-full px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs text-white font-semibold shadow-lg shadow-indigo-600/30 transition-all"
                    >
                      Register Teaching Assignment
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Assignments List */}
            <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl overflow-hidden shadow-lg">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <p className="text-xs font-semibold text-white">Active Class Advisor & Faculty Assignments ({assignments.length})</p>
                <button onClick={loadAssignments} className="text-xs text-indigo-400 hover:underline flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-500 uppercase tracking-wider bg-[#080d1a]/50">
                    <th className="px-4 py-3 text-left">Assignment ID</th>
                    <th className="px-4 py-3 text-left">Class & Section</th>
                    <th className="px-4 py-3 text-left">Period & Window</th>
                    <th className="px-4 py-3 text-left">Subject</th>
                    <th className="px-4 py-3 text-left">Class Advisor</th>
                    <th className="px-4 py-3 text-left">Subject Faculty</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingAssignments ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-slate-800/40">
                        <td colSpan={8} className="px-4 py-3"><div className="skeleton h-4 rounded" /></td>
                      </tr>
                    ))
                  ) : assignments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">No active faculty assignments found.</td>
                    </tr>
                  ) : (
                    assignments.map(a => (
                      <tr key={a.assignmentId} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                        <td className="px-4 py-3 font-mono text-xs text-indigo-300">{a.assignmentId}</td>
                        <td className="px-4 py-3 text-xs text-slate-200">
                          Sem {a.semester} · Sec {a.section}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300">
                          Period {a.period} ({a.startTime} - {a.endTime})
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-200 font-medium">
                          {a.subjectCode} - {a.subjectName}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-300 font-mono">{a.classAdvisorId}</td>
                        <td className="px-4 py-3 text-xs text-slate-300 font-mono">
                          {a.subjectFacultyId}
                          {a.substituteFacultyId && <span className="text-[10px] text-amber-400 block">(Sub: {a.substituteFacultyId})</span>}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            a.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
                          }`}>
                            {a.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {a.isActive && (
                            <button
                              onClick={() => handleDeactivateAssignment(a.assignmentId)}
                              disabled={isReadOnlyRole}
                              className="px-2.5 py-1 text-xs rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
                            >
                              Deactivate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: ON DUTY (OD) APPROVAL QUEUE */}
        {/* ========================================================================= */}
        {activeTab === 'od_queue' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0d1526] border border-slate-700/60 rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Filter Status:</span>
                {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(st => (
                  <button
                    key={st}
                    onClick={() => setOdFilterStatus(st)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                      odFilterStatus === st
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <button
                onClick={loadODRequests}
                className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-300 hover:text-white flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Queue
              </button>
            </div>

            <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl overflow-hidden shadow-lg">
              <div className="p-4 border-b border-slate-800">
                <p className="text-xs font-semibold text-white">Pending & Processed On-Duty Leave Applications ({odRequests.length})</p>
              </div>
              <div className="divide-y divide-slate-800/60">
                {loadingOD ? (
                  <div className="p-8 text-center text-slate-500 text-xs">Loading OD requests...</div>
                ) : odRequests.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">No OD requests found for this filter.</div>
                ) : (
                  odRequests.map(od => (
                    <div key={od.odId} className="p-5 hover:bg-slate-800/10 transition-colors">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-indigo-300">{od.odId}</span>
                            <span className="text-xs font-bold text-white">{od.studentName} ({od.studentId})</span>
                            <span className="text-xs text-slate-400">· {od.department} (Sem {od.semester} - {od.section})</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              od.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                              od.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                              'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}>
                              {od.status}
                            </span>
                          </div>

                          <p className="text-xs text-slate-200 font-semibold">
                            Event: {od.eventName} <span className="text-slate-400 font-normal">({od.purpose})</span>
                            {od.destination && <span className="text-slate-400 font-normal"> · Destination: {od.destination}</span>}
                          </p>

                          <p className="text-xs text-slate-400">
                            Requested Dates: <span className="text-slate-300">{(od.dates || []).join(', ')}</span> · Periods: <span className="text-slate-300">{(od.periods || []).join(', ')}</span>
                          </p>

                          {od.proofDocument && (
                            <p className="text-[11px] text-sky-400">
                              Proof Doc: {od.proofDocument}
                            </p>
                          )}

                          {od.reviewRemarks && (
                            <p className="text-[11px] text-slate-400 italic">
                              HOD Remarks: &ldquo;{od.reviewRemarks}&rdquo; (Reviewed by {od.reviewedBy})
                            </p>
                          )}
                        </div>

                        {/* HOD Review Controls */}
                        {od.status === 'PENDING' && (
                          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                            <input
                              type="text"
                              placeholder="Optional remarks..."
                              value={reviewRemarks[od.odId] || ''}
                              onChange={e => setReviewRemarks({ ...reviewRemarks, [od.odId]: e.target.value })}
                              className="bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 w-48"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleReviewOD(od.odId, 'APPROVED')}
                                disabled={reviewingId === od.odId || isReadOnlyRole}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs text-white font-semibold flex items-center gap-1 shadow-md shadow-emerald-600/20"
                              >
                                <Check className="w-3.5 h-3.5" /> Approve OD
                              </button>
                              <button
                                onClick={() => handleReviewOD(od.odId, 'REJECTED')}
                                disabled={reviewingId === od.odId || isReadOnlyRole}
                                className="px-3 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-500 disabled:opacity-50 text-xs text-white font-semibold flex items-center gap-1"
                              >
                                <X className="w-3.5 h-3.5" /> Reject
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: SESSIONS, ANALYTICS & AUDIT CORRECTION */}
        {/* ========================================================================= */}
        {activeTab === 'analytics' && (
          <div className="space-y-5">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="bg-[#0d1526] border border-slate-700/60 rounded-xl p-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Average Attendance</p>
                <p className="text-xl font-bold text-white mt-1">{analytics?.summary?.averageAttendance ?? 82.0}%</p>
              </div>
              <div className="bg-[#0d1526] border border-slate-700/60 rounded-xl p-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Students &lt;75% Attendance</p>
                <p className="text-xl font-bold text-amber-400 mt-1">{analytics?.summary?.studentsBelowThreshold ?? 0}</p>
              </div>
              <div className="bg-[#0d1526] border border-slate-700/60 rounded-xl p-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Critical Attendance (&lt;65%)</p>
                <p className="text-xl font-bold text-rose-400 mt-1">{analytics?.summary?.studentsCriticalBelow65 ?? 0}</p>
              </div>
              <div className="bg-[#0d1526] border border-slate-700/60 rounded-xl p-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">Total Recorded Sessions</p>
                <p className="text-xl font-bold text-indigo-400 mt-1">{sessions.length}</p>
              </div>
            </div>

            {/* Threshold Alert Radar */}
            <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl overflow-hidden shadow-lg">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <p className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-400" /> Students Under Mandatory Threshold (&lt;75%)
                </p>
                <span className="text-xs text-slate-400">{analytics?.thresholdAlerts?.length || 0} students at risk</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-500 uppercase tracking-wider bg-[#080d1a]/50">
                    <th className="px-4 py-3 text-left">Roll Number</th>
                    <th className="px-4 py-3 text-left">Student Name</th>
                    <th className="px-4 py-3 text-left">Department</th>
                    <th className="px-4 py-3 text-left">Attendance Rate</th>
                    <th className="px-4 py-3 text-left">CGPA</th>
                    <th className="px-4 py-3 text-left">Parent Contact</th>
                    <th className="px-4 py-3 text-left">Risk Level</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.thresholdAlerts || []).slice(0, 15).map((s: any) => (
                    <tr key={s.studentId} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">{s.studentId}</td>
                      <td className="px-4 py-3 font-medium text-slate-200">{s.name}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">{s.department}</td>
                      <td className="px-4 py-3 text-xs font-bold text-rose-400">{s.attendancePct}%</td>
                      <td className="px-4 py-3 text-xs text-slate-300">{s.cgpa}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-300">
                        {s.parentContact || 'Protected'}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold uppercase text-rose-300">{s.riskLevel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Historical Sessions Table with Audited Correction */}
            <div className="bg-[#0d1526] border border-slate-700/60 rounded-2xl overflow-hidden shadow-lg">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <p className="text-xs font-semibold text-white">Recorded Attendance Sessions & Audit Controls ({sessions.length})</p>
                <button onClick={loadAnalyticsAndSessions} className="text-xs text-indigo-400 hover:underline">Refresh</button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-500 uppercase tracking-wider bg-[#080d1a]/50">
                    <th className="px-4 py-3 text-left">Session ID</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Period</th>
                    <th className="px-4 py-3 text-left">Subject</th>
                    <th className="px-4 py-3 text-left">Faculty</th>
                    <th className="px-4 py-3 text-left">Rate</th>
                    <th className="px-4 py-3 text-right">Audit Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">No recorded attendance sessions found.</td>
                    </tr>
                  ) : (
                    sessions.map(s => (
                      <tr key={s.sessionId} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                        <td className="px-4 py-3 font-mono text-xs text-indigo-300">{s.sessionId}</td>
                        <td className="px-4 py-3 text-xs text-slate-300">{s.date}</td>
                        <td className="px-4 py-3 text-xs text-slate-300">Period {s.period}</td>
                        <td className="px-4 py-3 text-xs text-slate-200 font-medium">{s.subject}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{s.facultyName}</td>
                        <td className="px-4 py-3 text-xs font-bold text-white">
                          {s.attendanceRate}% ({s.presentCount}/{s.totalStudents})
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => { setCorrectModal(s); setCorrectStudentId(''); setCorrectReason(''); }}
                            disabled={isReadOnlyRole}
                            className="px-2.5 py-1 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1 ml-auto"
                          >
                            <Edit3 className="w-3 h-3" /> Audited Correction
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: ABSENCE DETAIL (MANDATORY REASON + PARENT PHONE) */}
        {/* ========================================================================= */}
        {absenceModalStudent && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0d1526] border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
              <button onClick={() => setAbsenceModalStudent(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2 mb-1">
                <UserX className="w-4 h-4 text-rose-400" /> Mandatory Absence Justification
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Recording absence for <strong className="text-white">{absenceModalStudent.name}</strong> ({absenceModalStudent.studentId}).
              </p>

              {/* Authorized Parent Contact Display */}
              <div className="mb-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700/80">
                <span className="text-[11px] text-slate-400 block">Registered Parent / Guardian Contact:</span>
                <span className="text-xs font-mono font-bold text-white">
                  {absenceModalStudent.parentContact || 'Protected (Field-Level Privacy)'}
                </span>
              </div>

              <form onSubmit={handleSaveAbsenceDetails} className="space-y-4">
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">Leave Category *</label>
                  <select
                    value={tempLeaveCategory}
                    onChange={e => setTempLeaveCategory(e.target.value)}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="Medical">Medical / Health Issue</option>
                    <option value="Personal">Personal / Domestic Reason</option>
                    <option value="Family Emergency">Family Emergency</option>
                    <option value="Unexcused">Unexcused Absence</option>
                    <option value="Other">Other Verified Reason</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">Mandatory Absence Reason / Remarks *</label>
                  <textarea
                    required
                    rows={3}
                    value={tempAbsenceReason}
                    onChange={e => setTempAbsenceReason(e.target.value)}
                    placeholder="Specify reason (e.g. Inpatient hospital admission, parent contacted via phone)."
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAbsenceModalStudent(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs text-white font-semibold"
                  >
                    Confirm Absence
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: ON-DUTY (OD) APPLICATION DETAILS */}
        {/* ========================================================================= */}
        {odModalStudent && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0d1526] border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
              <button onClick={() => setOdModalStudent(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-sm font-bold text-sky-300 flex items-center gap-2 mb-1">
                <Award className="w-4 h-4 text-sky-400" /> On-Duty (OD) Leave Application Details
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Applying OD for <strong className="text-white">{odModalStudent.name}</strong> ({odModalStudent.studentId}).
              </p>

              <form onSubmit={handleSaveODDetails} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">OD Purpose *</label>
                    <select
                      value={tempOdPurpose}
                      onChange={e => setTempOdPurpose(e.target.value)}
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="Academic Symposium">Academic Symposium</option>
                      <option value="Hackathon / Coding Contest">Hackathon / Coding Contest</option>
                      <option value="Inter-College Sports">Inter-College Sports</option>
                      <option value="Cultural Event">Cultural Event</option>
                      <option value="Industrial Visit">Industrial Visit</option>
                      <option value="Placement / Internship">Placement / Internship</option>
                      <option value="Other">Other Academic Activity</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">Event / Competition Name *</label>
                    <input
                      required
                      value={tempOdEvent}
                      onChange={e => setTempOdEvent(e.target.value)}
                      placeholder="e.g. Smart India Hackathon 2026"
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">Destination / Host Institute</label>
                    <input
                      value={tempOdDestination}
                      onChange={e => setTempOdDestination(e.target.value)}
                      placeholder="e.g. IIT Madras, Chennai"
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-300 block mb-1">Proof Doc / Certificate Reference</label>
                    <input
                      value={tempOdProof}
                      onChange={e => setTempOdProof(e.target.value)}
                      placeholder="e.g. invitation_letter.pdf"
                      className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setOdModalStudent(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs text-white font-semibold"
                  >
                    Confirm On-Duty (OD)
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MODAL: AUDITABLE CORRECTION */}
        {/* ========================================================================= */}
        {correctModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0d1526] border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
              <button onClick={() => setCorrectModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" /> Audited Attendance Correction
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Session: <span className="font-mono text-indigo-300">{correctModal.sessionId}</span> · {correctModal.subject} ({correctModal.date})
              </p>

              <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300">
                Notice: All corrections are immutably logged with your User ID, IST timestamp, original status, and mandatory justification.
              </div>

              <form onSubmit={handleCorrectionSubmit} className="space-y-4">
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">Student ID / Roll Number *</label>
                  <input
                    required
                    value={correctStudentId}
                    onChange={e => setCorrectStudentId(e.target.value)}
                    placeholder="e.g. CS24001"
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">New Attendance Status *</label>
                  <select
                    value={correctNewStatus}
                    onChange={e => setCorrectNewStatus(e.target.value)}
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="PRESENT">PRESENT</option>
                    <option value="ABSENT">ABSENT</option>
                    <option value="OD">ON DUTY (OD)</option>
                    <option value="LATE">LATE</option>
                    <option value="EXCUSED">EXCUSED</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-300 block mb-1">Auditable Justification Reason (min 5 chars) *</label>
                  <textarea
                    required
                    rows={3}
                    value={correctReason}
                    onChange={e => setCorrectReason(e.target.value)}
                    placeholder="e.g. Student submitted valid OD certificate signed by HOD on 2026-10-24."
                    className="w-full bg-[#080d1a] border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCorrectModal(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingCorrection}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-semibold"
                  >
                    {submittingCorrection ? 'Logging Audit...' : 'Apply Correction & Log Audit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
