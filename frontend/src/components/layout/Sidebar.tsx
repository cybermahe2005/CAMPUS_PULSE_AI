'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import {
  Brain, LayoutDashboard, Users, AlertTriangle, Zap, Target,
  Briefcase, MessageSquare, Database, LogOut, ChevronRight, Activity,
  GraduationCap, Building2, BookOpen, BarChart3, Home, Star, UploadCloud,
  FileText, CheckSquare, Award, Compass, Bell, LifeBuoy, Settings,
  FolderCheck, ShieldAlert
} from 'lucide-react';

// ── Staff Navigation ──────────────────────────────────────────────────────────
const STAFF_NAV = [
  { href: '/dashboard',           label: 'Mission Control',     icon: LayoutDashboard },
  { href: '/students',            label: 'Student Explorer',    icon: Users },
  { href: '/students/import',     label: 'Bulk CSV Import',     icon: UploadCloud,    badge: 'NEW' },
  { href: '/attendance',          label: 'Attendance Marking',  icon: Activity,       badge: 'LIVE' },
  { href: '/assessments',         label: 'Exams & Marks Entry', icon: BookOpen,       badge: 'LIVE' },
  { href: '/risk',                label: 'Risk Intelligence',   icon: AlertTriangle },
  { href: '/simulator',           label: 'What-If Simulator',   icon: Zap },
  { href: '/interventions',       label: 'Interventions Center',icon: Target },
  // Placement sub-group
  { href: '/placement',           label: 'Placement Hub',       icon: Briefcase },
  { href: '/placement/jobs',      label: 'Job Opportunities',   icon: Building2,      indent: true },
  { href: '/placement/training',  label: 'Training Programs',   icon: GraduationCap,  indent: true },
  { href: '/placement/analytics', label: 'Placement Analytics', icon: BarChart3,      indent: true },
  // Tools
  { href: '/copilot',             label: 'AI Analytics Copilot',icon: MessageSquare },
  { href: '/data-quality',        label: 'Data Quality Audit',  icon: Database },
];

// ── Complete 21-Item Student Navigation ───────────────────────────────────────
const STUDENT_NAV_GROUPS = [
  {
    group: 'ACADEMIC & PERFORMANCE',
    items: [
      { href: '/student',                   tab: 'overview',     label: '1. My Dashboard',          icon: Home },
      { href: '/student?tab=profile',       tab: 'profile',      label: '2. My Profile',            icon: Users },
      { href: '/student?tab=academic',      tab: 'academic',     label: '3. Academic Performance',  icon: BarChart3 },
      { href: '/student?tab=attendance',    tab: 'attendance',   label: '4. Attendance Tracking',   icon: Activity },
      { href: '/student?tab=results',       tab: 'results',      label: '5. Semester Results',      icon: FileText },
      { href: '/student?tab=arrears',       tab: 'arrears',      label: '6. Arrears Overview',      icon: AlertTriangle },
      { href: '/student?tab=skills',        tab: 'skills',       label: '7. Skills & Certifications',icon: Award },
      { href: '/student?tab=roadmap',       tab: 'roadmap',      label: '8. Career Roadmap',        icon: Compass },
    ],
  },
  {
    group: 'CAREER & PLACEMENT',
    items: [
      { href: '/student/placement',         tab: 'placement_hub',label: '9. Placement Dashboard',   icon: Briefcase },
      { href: '/student/placement?view=eligible', tab: 'eligible',label: '10. Eligible Jobs',       icon: CheckSquare },
      { href: '/student/placement?view=recommended', tab: 'rec', label: '11. Recommended Jobs',     icon: Star },
      { href: '/student/placement?view=saved', tab: 'saved',     label: '12. Saved Jobs',           icon: Building2 },
      { href: '/student/placement?view=applications', tab: 'apps',label: '13. My Applications',     icon: FolderCheck },
      { href: '/student?tab=training',      tab: 'training',     label: '14. Learning & Training',  icon: GraduationCap },
    ],
  },
  {
    group: 'INTELLIGENCE & SUPPORT',
    items: [
      { href: '/student?tab=copilot',       tab: 'copilot',      label: '15. AI Learning Assistant',icon: MessageSquare },
      { href: '/student?tab=insights',      tab: 'insights',     label: '16. Student Success Insights',icon: Brain },
      { href: '/student?tab=notifications', tab: 'notifications',label: '17. Notifications',        icon: Bell },
      { href: '/student?tab=action_plan',   tab: 'action_plan',  label: '18. My Action Plan',       icon: Target },
      { href: '/student?tab=support',       tab: 'support',      label: '19. Help & Support',       icon: LifeBuoy },
      { href: '/student?tab=settings',      tab: 'settings',     label: '20. Settings & Security',  icon: Settings },
    ],
  },
];

const ROLE_BADGE: Record<string, string> = {
  ADMIN:                 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  JOINT_SECRETARY:       'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  PRINCIPAL:             'bg-blue-500/20 text-blue-300 border-blue-500/30',
  HOD:                   'bg-sky-500/20 text-sky-300 border-sky-500/30',
  FACULTY:               'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  CLASS_ADVISOR:         'bg-teal-500/20 text-teal-300 border-teal-500/30',
  MENTOR:                'bg-purple-500/20 text-purple-300 border-purple-500/30',
  PLACEMENT_COORDINATOR: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  PLACEMENT_OFFICER:     'bg-amber-500/20 text-amber-300 border-amber-500/30',
  CLASS_REPRESENTATIVE:  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  STUDENT:               'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN:                 'Administrator',
  JOINT_SECRETARY:       'Joint Secretary',
  PRINCIPAL:             'Principal',
  HOD:                   'HOD',
  FACULTY:               'Faculty',
  CLASS_ADVISOR:         'Class Advisor',
  MENTOR:                'Faculty Mentor',
  PLACEMENT_COORDINATOR: 'Placement Coordinator',
  PLACEMENT_OFFICER:     'Placement Officer',
  CLASS_REPRESENTATIVE:  'Class Representative',
  STUDENT:               'Student',
};

export default function Sidebar() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const currentTab   = searchParams.get('tab') || 'overview';
  const currentView  = searchParams.get('view') || '';
  const { user, logout } = useAuth();
  const router       = useRouter();

  const isStudent = user?.role === 'STUDENT';
  const handleLogout = () => { logout(); router.replace('/login'); };

  return (
    <aside className="w-64 flex-shrink-0 bg-[#070c18]/95 border-r border-slate-800/80 flex flex-col h-screen sticky top-0 z-20 backdrop-blur-md">
      {/* Brand Header */}
      <div className="px-4 py-4 border-b border-slate-800/80">
        <Link href={isStudent ? '/student' : '/dashboard'} className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600/40 via-violet-600/30 to-blue-600/20 border border-indigo-500/40 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/15">
            <Brain className="w-5 h-5 text-indigo-400 group-hover:scale-105 transition-transform" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white tracking-tight">Campus Pulse</span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">AI</span>
            </div>
            <p className="text-[9px] text-slate-400 font-medium tracking-wider uppercase mt-0.5">Decision Intelligence</p>
          </div>
        </Link>
      </div>

      {/* Campus System Status */}
      <div className="px-4 py-2 border-b border-slate-800/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span className="text-[11px] text-slate-400 font-medium">Atlas Live Sync</span>
        </div>
        <span className="text-[10px] font-mono text-indigo-400/80 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">v2.0 R2</span>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4 text-xs font-medium scrollbar-thin">
        {isStudent ? (
          // ── 21-Item Student Navigation ──
          STUDENT_NAV_GROUPS.map((grp) => (
            <div key={grp.group} className="space-y-1">
              <p className="px-2 text-[10px] font-semibold text-slate-400 tracking-wider uppercase">{grp.group}</p>
              {grp.items.map(({ href, tab, label, icon: Icon }) => {
                let active = false;
                if (href.startsWith('/student/placement')) {
                  if (tab === 'eligible' && currentView === 'eligible') active = true;
                  else if (tab === 'rec' && currentView === 'recommended') active = true;
                  else if (tab === 'saved' && currentView === 'saved') active = true;
                  else if (tab === 'apps' && currentView === 'applications') active = true;
                  else if (tab === 'placement_hub' && pathname === '/student/placement' && !currentView) active = true;
                } else {
                  active = pathname === '/student' && currentTab === tab;
                }

                return (
                  <Link
                    key={label}
                    href={href}
                    className={cn(
                      'flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all',
                      active
                        ? 'bg-indigo-600/25 text-white border border-indigo-500/40 font-semibold shadow-sm shadow-indigo-500/10'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    )}
                  >
                    <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-indigo-400' : 'text-slate-400')} />
                    <span className="truncate">{label}</span>
                    {active && <ChevronRight className="w-3 h-3 ml-auto text-indigo-400/80" />}
                  </Link>
                );
              })}
            </div>
          ))
        ) : (
          // ── Staff Navigation ──
          <div className="space-y-1">
            {STAFF_NAV.map(({ href, label, icon: Icon, indent, badge }: any) => {
              const active = pathname === href || (!indent && href !== '/' && pathname.startsWith(href + '/'));
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all',
                    indent ? 'ml-3 py-1.5 text-[11px]' : 'text-xs',
                    active
                      ? 'bg-indigo-600/25 text-white border border-indigo-500/40 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  )}
                >
                  <Icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-indigo-400' : 'text-slate-500')} />
                  <span className="truncate">{label}</span>
                  {badge && (
                    <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {badge}
                    </span>
                  )}
                  {active && !badge && <ChevronRight className="w-3 h-3 ml-auto text-indigo-400/60" />}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* User Section & Logout (Item 21) */}
      {user && (
        <div className="px-3 py-3 border-t border-slate-800/80 space-y-2 bg-[#090f1e]/80">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-8 h-8 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-200 truncate">{user.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn('text-[9px] font-semibold px-1.5 py-0.2 rounded-full border', ROLE_BADGE[user.role] ?? ROLE_BADGE.STUDENT)}>
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
                {user.department && (
                  <span className="text-[9px] text-slate-500 truncate">{user.department}</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            id="sidebar-logout-btn"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all group"
          >
            <LogOut className="w-3.5 h-3.5 group-hover:text-red-400 transition-colors" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </aside>
  );
}
