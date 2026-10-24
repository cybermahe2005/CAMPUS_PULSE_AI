'use client';
import AppLayout from '@/components/layout/AppLayout';
import { useState, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { previewCSV, commitCSV, getTemplateUrl, getCSVHistory } from '@/lib/api';
import {
  UploadCloud, FileSpreadsheet, Download, CheckCircle, AlertTriangle,
  XCircle, ArrowRight, RefreshCw, Shield, Users, Lock, ChevronRight,
  Database, Info, AlertCircle, Loader2
} from 'lucide-react';
import Link from 'next/link';

export default function BulkStudentImportPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [commitResult, setCommitResult] = useState<any | null>(null);
  const [error, setError] = useState<string>('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [defaultPassword, setDefaultPassword] = useState('Student@123');
  const [dragOver, setDragOver] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'errors' | 'duplicates'>('all');

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a valid UTF-8 CSV file (.csv)');
      return;
    }
    setFile(selectedFile);
    setError('');
    setCommitResult(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('importType', 'students');
      const res = await previewCSV(formData);
      setPreviewData(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to parse CSV file. Ensure valid columns and encoding.');
      setPreviewData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleCommit = async () => {
    if (!previewData || !previewData.allRows) return;
    setCommitting(true);
    setError('');
    try {
      const res = await commitCSV(previewData.allRows, skipDuplicates, defaultPassword);
      setCommitResult(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to commit student batch. Review error log.');
    } finally {
      setCommitting(false);
    }
  };

  const downloadErrorReport = () => {
    if (!previewData?.errors?.length) return;
    const csvContent = "data:text/csv;charset=utf-8," +
      ["Row,Field,Student_Roll,Student_Name,Error_Message"]
        .concat(previewData.errors.map((e: any) => `${e.row},"${e.field}","${e.roll || ''}","${e.name || ''}","${e.message}"`))
        .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `import_validation_errors_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const rowsToShow = (previewData?.preview || []).filter((r: any) => {
    if (filterTab === 'valid') return !r.hasErrors && !r.isDuplicate;
    if (filterTab === 'errors') return r.hasErrors;
    if (filterTab === 'duplicates') return r.isDuplicate;
    return true;
  });

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                PHASE 8 · INSTITUTION ONBOARDING
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
              <UploadCloud className="w-6 h-6 text-indigo-400" />
              Bulk Student Creation & Account Provisioning
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Import an entire batch (100–1,000+ students) via CSV. Automatically validates records, creates student profiles, and provisions secure login credentials.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={getTemplateUrl('students')}
              download="campus_pulse_bulk_students_template.csv"
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-indigo-500/50 text-xs font-semibold text-slate-200 transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              Student CSV Template
            </a>
            <a
              href={getTemplateUrl('academic')}
              download="campus_pulse_academic_updates_template.csv"
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:border-emerald-500/50 text-xs font-semibold text-slate-200 transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              Academic Updates Template
            </a>
          </div>
        </div>

        {/* Security / Default Password Disclosure Banner */}
        <div className="bg-[#0b1329] border border-indigo-500/30 rounded-2xl p-4 flex items-start gap-3 shadow-lg shadow-indigo-500/5">
          <Shield className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-white">Security & Default Password Policy</p>
            <p className="text-slate-400 leading-relaxed">
              Imported students receive the configured temporary credential (<code className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-indigo-300 font-bold">{defaultPassword}</code>) with their unique roll number as their username.
              The system automatically flags their account with <span className="text-amber-400 font-semibold">mustChangePassword = True</span>, enforcing an immediate personal password change upon initial login.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Upload Dropzone */}
        {!previewData && (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                : 'border-slate-700/80 bg-[#0d1526]/80 hover:border-indigo-500/50 hover:bg-[#0d1526]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFileChange(e.target.files[0])}
            />
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mx-auto mb-4 text-indigo-400 shadow-xl shadow-indigo-500/10">
              {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : <UploadCloud className="w-8 h-8" />}
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              {loading ? 'Validating and Parsing CSV...' : 'Click to Upload or Drag & Drop Batch CSV'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
              Supports standard institutional batch formats (.csv, UTF-8 encoded). Upload 100 to 1,000+ student records with one click.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300">
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
              <span>Recommended: student_name, roll_number, email, department, cgpa, attendance</span>
            </div>
          </div>
        )}

        {/* Validation & Preview Panel */}
        {previewData && (
          <div className="space-y-5">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#0d1526] border border-slate-800 rounded-2xl p-4">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Rows</span>
                <p className="text-2xl font-bold text-white mt-1">{previewData.totalRows}</p>
              </div>
              <div className="bg-[#0d1526] border border-emerald-500/30 rounded-2xl p-4">
                <span className="text-[10px] text-emerald-400 uppercase font-semibold">Valid Records</span>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{previewData.validCount}</p>
              </div>
              <div className="bg-[#0d1526] border border-amber-500/30 rounded-2xl p-4">
                <span className="text-[10px] text-amber-400 uppercase font-semibold">Existing Duplicates</span>
                <p className="text-2xl font-bold text-amber-400 mt-1">{previewData.duplicateCount}</p>
              </div>
              <div className="bg-[#0d1526] border border-red-500/30 rounded-2xl p-4">
                <span className="text-[10px] text-red-400 uppercase font-semibold">Syntax / Field Errors</span>
                <p className="text-2xl font-bold text-red-400 mt-1">{previewData.errorCount}</p>
              </div>
            </div>

            {/* Error alerts / Download error report */}
            {previewData.errorCount > 0 && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold text-white">Validation Warnings Found ({previewData.errorCount})</p>
                    <p className="text-slate-400">Review the rows with issues before committing, or download a CSV report.</p>
                  </div>
                </div>
                <button
                  onClick={downloadErrorReport}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-2 transition-all flex-shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  Download Error CSV
                </button>
              </div>
            )}

            {/* Preview Controls & Filter Tabs */}
            <div className="bg-[#0d1526] border border-slate-800 rounded-2xl p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">Previewing: {previewData.filename}</span>
                  <button
                    onClick={() => { setPreviewData(null); setFile(null); }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 ml-2"
                  >
                    Change File
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {(['all', 'valid', 'errors', 'duplicates'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setFilterTab(tab)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                        filterTab === tab
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab} ({tab === 'all' ? previewData.preview.length :
                               tab === 'valid' ? previewData.validCount :
                               tab === 'errors' ? previewData.errorCount :
                               previewData.duplicateCount})
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#070c18] text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-3">Status</th>
                      <th className="p-3">Roll No</th>
                      <th className="p-3">Student Name</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">CGPA</th>
                      <th className="p-3">Attendance</th>
                      <th className="p-3">Arrears</th>
                      <th className="p-3">Placement Readiness</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {rowsToShow.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3">
                          {row.hasErrors ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">
                              <XCircle className="w-3 h-3" /> Error
                            </span>
                          ) : row.isDuplicate ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                              <AlertTriangle className="w-3 h-3" /> Duplicate
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                              <CheckCircle className="w-3 h-3" /> Valid
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-white">{row.roll || '—'}</td>
                        <td className="p-3 font-medium text-slate-200">{row.name || '—'}</td>
                        <td className="p-3 text-slate-400">{row.department || 'General'}</td>
                        <td className="p-3 font-semibold text-indigo-300">{row.cgpa}</td>
                        <td className="p-3 text-slate-300">{row.attendance}%</td>
                        <td className="p-3 text-slate-300">{row.currentArrears} curr / {row.historicalArrears} hist</td>
                        <td className="p-3 font-semibold text-emerald-400">{row.placementReadiness}/100</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Commit Options & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-slate-800">
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={skipDuplicates}
                      onChange={e => setSkipDuplicates(e.target.checked)}
                      className="rounded accent-indigo-500"
                    />
                    <span>Skip already existing roll numbers (prevent overwriting)</span>
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setPreviewData(null); setFile(null); }}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCommit}
                    disabled={committing || previewData.validCount === 0}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-xs font-bold text-white transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center gap-2"
                  >
                    {committing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Confirm & Provision {previewData.validCount} Accounts
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Commit Success Result Banner */}
        {commitResult && (
          <div className="bg-[#0b192e] border border-emerald-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{commitResult.message}</h3>
                <p className="text-xs text-slate-400">Batch created at {new Date().toLocaleTimeString()}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-[#070e1c] p-4 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500 block">Created Profiles</span>
                <span className="text-lg font-bold text-white">{commitResult.insertedStudents}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Linked Login Accounts</span>
                <span className="text-lg font-bold text-emerald-400">{commitResult.createdAccounts}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Skipped Duplicates</span>
                <span className="text-lg font-bold text-amber-400">{commitResult.skippedDuplicates}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Default Password</span>
                <span className="text-xs font-mono font-bold text-indigo-300">{commitResult.defaultPassword}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Link
                href="/students"
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all flex items-center gap-2"
              >
                <span>View Students in Explorer</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => { setPreviewData(null); setCommitResult(null); }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all"
              >
                Import Another Batch
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
