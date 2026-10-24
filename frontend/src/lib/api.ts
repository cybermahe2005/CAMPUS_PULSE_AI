import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

let _token: string | null = null;

export function setToken(t: string | null) {
  _token = t;
  if (typeof window !== 'undefined') {
    t ? localStorage.setItem('cpa_token', t) : localStorage.removeItem('cpa_token');
  }
}
export function getToken(): string | null {
  if (_token) return _token;
  if (typeof window !== 'undefined') _token = localStorage.getItem('cpa_token');
  return _token;
}
export function clearToken() { setToken(null); }

const api: AxiosInstance = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use(cfg => {
  const t = getToken();
  if (t) cfg.headers!.Authorization = `Bearer ${t}`;
  return cfg;
});
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      clearToken();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login  = (username: string, password: string) =>
  api.post('/api/auth/login', { username, password }).then(r => r.data);
export const getMe  = () => api.get('/api/auth/me').then(r => r.data);
export const changePassword = (old_password: string, new_password: string) =>
  api.post('/api/auth/change-password', { old_password, new_password }).then(r => r.data);
export const getUsers = () => api.get('/api/auth/users').then(r => r.data);

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboard = () => api.get('/api/dashboard/summary').then(r => r.data);

// ── Students ──────────────────────────────────────────────────────────────────
export const getStudents = (params: Record<string, any> = {}) =>
  api.get('/api/students', { params }).then(r => r.data);
export const getStudent = (id: string) =>
  api.get(`/api/students/${id}`).then(r => r.data);

// ── Simulator ─────────────────────────────────────────────────────────────────
export const runSimulation = (id: string, payload: Record<string, number>) =>
  api.post(`/api/simulator/${id}`, payload).then(r => r.data);

// ── Interventions ─────────────────────────────────────────────────────────────
export const getInterventions  = (params?: Record<string, any>) =>
  api.get('/api/interventions', { params }).then(r => r.data);
export const getMyInterventions = () =>
  api.get('/api/interventions/my').then(r => r.data);
export const createIntervention = (payload: any) =>
  api.post('/api/interventions/create', payload).then(r => r.data);
export const assignIntervention = (payload: any) =>
  api.post('/api/interventions/assign', payload).then(r => r.data);
export const updateInterventionStatus = (id: string, status: string, notes?: string) =>
  api.post(`/api/interventions/${id}/status`, { status, notes }).then(r => r.data);
export const approveIntervention = (studentId: string, interventionId: string, notes?: string) =>
  api.post('/api/interventions/approve', { studentId, interventionId, notes }).then(r => r.data);
export const recordOutcome = (id: string, payload: any) =>
  api.post(`/api/interventions/${id}/outcome`, payload).then(r => r.data);
export const getInterventionSummary = () =>
  api.get('/api/interventions/summary').then(r => r.data);

// ── Predictions & Model Metrics ───────────────────────────────────────────────
export const getPredictions = (id: string) =>
  api.get(`/api/predictions/${id}`).then(r => r.data);
export const getModelMetrics = () =>
  api.get('/api/predictions/meta/models').then(r => r.data);

// ── CSV Import & Academic Updates ─────────────────────────────────────────────
export const previewCSV = (formData: FormData) =>
  api.post('/api/csv-import/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
export const commitCSV = (rows: any[], skipDuplicates = true, defaultPassword = 'Student@123') =>
  api.post('/api/csv-import/commit', { rows, skipDuplicates, defaultPassword }).then(r => r.data);
export const importAcademicUpdates = (formData: FormData) =>
  api.post('/api/csv-import/academic-update', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
export const getCSVHistory = () =>
  api.get('/api/csv-import/history').then(r => r.data);
export const getTemplateUrl = (type: string = 'students') =>
  `${BASE_URL}/api/csv-import/template/${type}`;

// ── Placement (faculty intelligence) ─────────────────────────────────────────
export const getPlacementOverview  = ()  => api.get('/api/placement/overview').then(r => r.data);
export const getPlacementStudents  = (params: Record<string,any> = {}) =>
  api.get('/api/placement/students', { params }).then(r => r.data);
export const getPlacementStudent   = (id: string) =>
  api.get(`/api/placement/students/${id}`).then(r => r.data);
export const getPlacementAnalytics = () => api.get('/api/placement/analytics').then(r => r.data);
export const matchJD = (jd_text: string, department?: string, top_n = 30) =>
  api.post('/api/placement/match-jd', { jd_text, department, top_n }).then(r => r.data);
export const getTrainings   = () => api.get('/api/placement/training').then(r => r.data);
export const createTraining = (payload: any) => api.post('/api/placement/training', payload).then(r => r.data);
export const assignTraining = (trainingId: string, studentIds: string[]) =>
  api.post('/api/placement/training/assign', { trainingId, studentIds }).then(r => r.data);
export const recordPlacementOutcome = (payload: any) =>
  api.post('/api/placement/outcomes', payload).then(r => r.data);
export const getPlacementOutcomes = (department?: string) =>
  api.get('/api/placement/outcomes', { params: department ? { department } : {} }).then(r => r.data);
export const getSkillDemand  = () => api.get('/api/placement/skill-demand').then(r => r.data);

// ── Jobs (faculty-facing CRUD — /api/jobs) ────────────────────────────────────
export const getJobs = (params: Record<string,any> = {}) =>
  api.get('/api/jobs', { params }).then(r => r.data);
export const getJob = (jobId: string) =>
  api.get(`/api/jobs/${jobId}`).then(r => r.data);
export const createJob = (payload: any) =>
  api.post('/api/jobs', payload).then(r => r.data);
export const updateJob = (jobId: string, payload: any) => // PATCH matches backend
  api.patch(`/api/jobs/${jobId}`, payload).then(r => r.data);
export const publishJob = (jobId: string) =>
  api.post(`/api/jobs/${jobId}/publish`).then(r => r.data);
export const closeJob = (jobId: string) =>
  api.post(`/api/jobs/${jobId}/close`).then(r => r.data);
export const deleteJob = (jobId: string) =>
  api.delete(`/api/jobs/${jobId}`).then(r => r.data);
export const previewJobEligibility = (jobId: string) =>
  api.post(`/api/jobs/${jobId}/preview-eligibility`, {}).then(r => r.data);
export const getJobMatches = (jobId: string, params: Record<string,any> = {}) =>
  api.get(`/api/jobs/${jobId}/matches`, { params }).then(r => r.data);
export const getJobApplications = (jobId: string) =>
  api.get(`/api/jobs/${jobId}/applications`).then(r => r.data);
export const updateApplicationStatus = (appId: string, status: string, notes?: string) =>
  api.post(`/api/jobs/applications/${appId}/status`, { status, notes }).then(r => r.data);
export const getStreams = () =>
  api.get('/api/jobs/meta/streams').then(r => r.data);
export const extractJD = (jdText: string) =>
  api.post('/api/jobs/extract-jd', { jdText }).then(r => r.data);
export const recalculateJobMatches = (jobId: string) =>
  api.post(`/api/jobs/${jobId}/recalculate`).then(r => r.data);

// ── Student Placement (self-access — /api/student/placement) ──────────────────
export const getStudentJobs = (view?: string) =>
  api.get('/api/student/placement/jobs', { params: view ? { view } : {} }).then(r => r.data);
export const getStudentJobDetail = (jobId: string) =>
  api.get(`/api/student/placement/jobs/${jobId}`).then(r => r.data);
export const applyToJob = (jobId: string, notes?: string) =>
  api.post(`/api/student/placement/apply/${jobId}`, { notes }).then(r => r.data);
export const getStudentApplications = () =>
  api.get('/api/student/placement/applications').then(r => r.data);
export const updateStudentSkills = (skills: any[]) =>
  api.put('/api/student/placement/skills', { skills }).then(r => r.data);
export const updateStudentInterests = (learningInterests: any[], preferredJobRoles?: string[]) =>
  api.put('/api/student/placement/interests', { learningInterests, preferredJobRoles }).then(r => r.data);
export const getStudentPlacementProfile = () =>
  api.get('/api/student/placement/profile').then(r => r.data);
export const getStudentReadiness = () =>
  api.get('/api/student/placement/readiness').then(r => r.data);

// ── Copilot ───────────────────────────────────────────────────────────────────
export const queryCopilot = (query: string) =>
  api.post('/api/copilot/query', { query }).then(r => r.data);

// ── Data Quality ──────────────────────────────────────────────────────────────
export const getDataQuality = () =>
  api.get('/api/data-quality').then(r => r.data);

// ── Single Student Creation ───────────────────────────────────────────────────
export const createSingleStudent = (data: any) =>
  api.post('/api/students', data).then(r => r.data);

// ── Real Attendance Management ────────────────────────────────────────────────
export const getAttendanceRoster = (department: string, semester: number, section?: string) =>
  api.get('/api/attendance/roster', { params: { department, semester, section } }).then(r => r.data);
export const markAttendanceSession = (data: any) =>
  api.post('/api/attendance/session', data).then(r => r.data);
export const getAttendanceSessions = (params?: any) =>
  api.get('/api/attendance/sessions', { params }).then(r => r.data);
export const correctAttendance = (data: any) =>
  api.post('/api/attendance/correct', data).then(r => r.data);
export const getAttendanceAnalytics = (department?: string) =>
  api.get('/api/attendance/analytics', { params: department ? { department } : {} }).then(r => r.data);
export const getMyAttendance = () =>
  api.get('/api/attendance/my').then(r => r.data);
export const getAttendanceAssignments = (params?: any) =>
  api.get('/api/attendance/assignments', { params }).then(r => r.data);
export const createAttendanceAssignment = (data: any) =>
  api.post('/api/attendance/assignments', data).then(r => r.data);
export const deactivateAttendanceAssignment = (assignmentId: string) =>
  api.delete(`/api/attendance/assignments/${assignmentId}`).then(r => r.data);
export const getTimetablePeriodStatus = (params: any) =>
  api.get('/api/attendance/timetable/status', { params }).then(r => r.data);
export const submitODRequest = (data: any) =>
  api.post('/api/attendance/od-request', data).then(r => r.data);
export const getODRequests = (params?: any) =>
  api.get('/api/attendance/od-requests', { params }).then(r => r.data);
export const reviewODRequest = (odId: string, data: any) =>
  api.post(`/api/attendance/od-requests/${odId}/review`, data).then(r => r.data);

// ── Real Exam & Assessment Management ─────────────────────────────────────────
export const createExam = (data: any) =>
  api.post('/api/assessments/exam', data).then(r => r.data);
export const getExams = (params?: any) =>
  api.get('/api/assessments/exams', { params }).then(r => r.data);
export const submitExamMarks = (data: any) =>
  api.post('/api/assessments/marks', data).then(r => r.data);
export const publishExam = (examId: string) =>
  api.post(`/api/assessments/${examId}/publish`).then(r => r.data);
export const getStudentAssessments = (studentId: string) =>
  api.get(`/api/assessments/student/${studentId}`).then(r => r.data);

// ── Resource Optimizer ────────────────────────────────────────────────────────
export const getInterventionOptimizer = () =>
  api.get('/api/interventions/optimizer').then(r => r.data);

// ── Health ────────────────────────────────────────────────────────────────────
export const healthCheck = () =>
  api.get('/health').then(r => r.data);

export default api;
