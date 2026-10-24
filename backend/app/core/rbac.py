"""RBAC — Permission constants, role hierarchy, and responsibility engine."""
from enum import Enum
from typing import Set, List, Optional


# ══════════════════════════════════════════════════════════════
# 1. BASE ROLES
# ══════════════════════════════════════════════════════════════
class BaseRole(str, Enum):
    ADMIN                  = "ADMIN"
    JOINT_SECRETARY        = "JOINT_SECRETARY"
    PRINCIPAL              = "PRINCIPAL"
    HOD                    = "HOD"
    FACULTY                = "FACULTY"
    CLASS_ADVISOR          = "CLASS_ADVISOR"
    MENTOR                 = "MENTOR"
    PLACEMENT_COORDINATOR  = "PLACEMENT_COORDINATOR"
    PLACEMENT_OFFICER      = "PLACEMENT_OFFICER"
    STUDENT                = "STUDENT"
    CLASS_REPRESENTATIVE   = "CLASS_REPRESENTATIVE"


# ══════════════════════════════════════════════════════════════
# 2. RESPONSIBILITIES (additive, can accompany any base role)
# ══════════════════════════════════════════════════════════════
class Responsibility(str, Enum):
    CLASS_ADVISOR          = "CLASS_ADVISOR"
    MENTOR                 = "MENTOR"
    PLACEMENT_COORDINATOR  = "PLACEMENT_COORDINATOR"
    PLACEMENT_OFFICER      = "PLACEMENT_OFFICER"
    CLASS_REPRESENTATIVE   = "CLASS_REPRESENTATIVE"
    CR                     = "CR"


# ══════════════════════════════════════════════════════════════
# 3. FINE-GRAINED PERMISSIONS
# ══════════════════════════════════════════════════════════════
class Permission(str, Enum):
    # ── Dashboard
    DASHBOARD_VIEW          = "dashboard.view"
    DASHBOARD_ADMIN         = "dashboard.admin"

    # ── Students
    STUDENT_LIST            = "student.list"
    STUDENT_VIEW            = "student.view"
    STUDENT_VIEW_OWN        = "student.view.own"
    STUDENT_VIEW_ASSIGNED   = "student.view.assigned"
    STUDENT_ACADEMIC_MODIFY = "student.academic.modify"
    STUDENT_IMPORT          = "student.import"

    # ── Risk intelligence
    RISK_VIEW               = "risk.view"
    RISK_VIEW_SHAP          = "risk.view.shap"          # hidden from CR/Student
    RISK_SCORES_VIEW        = "risk.scores.view"        # hidden from CR/Student

    # ── Interventions
    INTERVENTION_VIEW       = "intervention.view"
    INTERVENTION_CREATE     = "intervention.create"
    INTERVENTION_UPDATE     = "intervention.update"
    INTERVENTION_APPROVE    = "intervention.approve"

    # ── Simulator
    SIMULATOR_RUN           = "simulator.run"

    # ── Placement
    PLACEMENT_DASHBOARD_VIEW      = "placement.dashboard.view"
    PLACEMENT_STUDENT_VIEW        = "placement.student.view"
    PLACEMENT_STUDENT_OWN         = "placement.student.own"
    PLACEMENT_READINESS_VIEW      = "placement.readiness.view"
    PLACEMENT_RISK_VIEW           = "placement.risk.view"
    PLACEMENT_SKILLS_VIEW         = "placement.skills.view"
    PLACEMENT_SKILL_GAP_VIEW      = "placement.skill_gap.view"
    PLACEMENT_JOBS_VIEW           = "placement.jobs.view"
    PLACEMENT_JOBS_CREATE         = "placement.jobs.create"
    PLACEMENT_MATCHING_RUN        = "placement.matching.run"
    PLACEMENT_TRAINING_VIEW       = "placement.training.view"
    PLACEMENT_TRAINING_CREATE     = "placement.training.create"
    PLACEMENT_INTERVENTION_CREATE = "placement.intervention.create"
    PLACEMENT_OUTCOME_VIEW        = "placement.outcome.view"
    PLACEMENT_OUTCOME_RECORD      = "placement.outcome.record"
    PLACEMENT_ANALYTICS_VIEW      = "placement.analytics.view"
    PLACEMENT_EXPORT              = "placement.export"

    # ── AI Copilot
    COPILOT_USE             = "copilot.use"
    COPILOT_ADMIN           = "copilot.admin"

    # ── Data quality
    DATA_QUALITY_VIEW       = "data_quality.view"

    # ── User management & system admin
    USER_MANAGE             = "user.manage"
    ROLE_MANAGE             = "role.manage"
    AUDIT_VIEW              = "audit.view"
    SYSTEM_CONFIG           = "system.config"

    # ── Reports
    REPORT_VIEW             = "report.view"
    REPORT_EXPORT           = "report.export"


_P = Permission

# ══════════════════════════════════════════════════════════════
# 4. BASE ROLE → PERMISSIONS MAP
# ══════════════════════════════════════════════════════════════
BASE_ROLE_PERMISSIONS: dict[BaseRole, Set[Permission]] = {
    BaseRole.ADMIN: {p for p in Permission},  # ALL permissions

    BaseRole.JOINT_SECRETARY: {
        _P.DASHBOARD_VIEW, _P.DASHBOARD_ADMIN,
        _P.STUDENT_LIST, _P.STUDENT_VIEW, _P.STUDENT_IMPORT,
        _P.RISK_VIEW, _P.RISK_VIEW_SHAP, _P.RISK_SCORES_VIEW,
        _P.INTERVENTION_VIEW, _P.INTERVENTION_APPROVE,
        _P.SIMULATOR_RUN,
        _P.PLACEMENT_DASHBOARD_VIEW, _P.PLACEMENT_STUDENT_VIEW,
        _P.PLACEMENT_READINESS_VIEW, _P.PLACEMENT_RISK_VIEW,
        _P.PLACEMENT_SKILLS_VIEW, _P.PLACEMENT_ANALYTICS_VIEW,
        _P.PLACEMENT_JOBS_VIEW, _P.PLACEMENT_OUTCOME_VIEW,
        _P.COPILOT_USE, _P.COPILOT_ADMIN,
        _P.DATA_QUALITY_VIEW,
        _P.USER_MANAGE, _P.ROLE_MANAGE, _P.AUDIT_VIEW, _P.SYSTEM_CONFIG,
        _P.REPORT_VIEW, _P.REPORT_EXPORT,
    },

    BaseRole.PRINCIPAL: {
        _P.DASHBOARD_VIEW,
        _P.STUDENT_LIST, _P.STUDENT_VIEW,
        _P.RISK_VIEW, _P.RISK_VIEW_SHAP, _P.RISK_SCORES_VIEW,
        _P.INTERVENTION_VIEW, _P.INTERVENTION_APPROVE,
        _P.SIMULATOR_RUN,
        _P.PLACEMENT_DASHBOARD_VIEW, _P.PLACEMENT_STUDENT_VIEW,
        _P.PLACEMENT_READINESS_VIEW, _P.PLACEMENT_RISK_VIEW,
        _P.PLACEMENT_SKILLS_VIEW, _P.PLACEMENT_ANALYTICS_VIEW,
        _P.PLACEMENT_JOBS_VIEW, _P.PLACEMENT_OUTCOME_VIEW,
        _P.COPILOT_USE,
        _P.DATA_QUALITY_VIEW,
        _P.REPORT_VIEW, _P.REPORT_EXPORT,
        _P.AUDIT_VIEW,
    },

    BaseRole.HOD: {
        _P.DASHBOARD_VIEW,
        _P.STUDENT_LIST, _P.STUDENT_VIEW, _P.STUDENT_IMPORT,
        _P.RISK_VIEW, _P.RISK_VIEW_SHAP, _P.RISK_SCORES_VIEW,
        _P.INTERVENTION_VIEW, _P.INTERVENTION_CREATE, _P.INTERVENTION_UPDATE, _P.INTERVENTION_APPROVE,
        _P.SIMULATOR_RUN,
        _P.PLACEMENT_DASHBOARD_VIEW, _P.PLACEMENT_STUDENT_VIEW,
        _P.PLACEMENT_READINESS_VIEW, _P.PLACEMENT_RISK_VIEW,
        _P.PLACEMENT_SKILLS_VIEW, _P.PLACEMENT_ANALYTICS_VIEW,
        _P.PLACEMENT_JOBS_VIEW, _P.PLACEMENT_OUTCOME_VIEW,
        _P.COPILOT_USE,
        _P.DATA_QUALITY_VIEW,
        _P.REPORT_VIEW, _P.REPORT_EXPORT,
    },

    BaseRole.FACULTY: {
        _P.DASHBOARD_VIEW,
        _P.STUDENT_LIST, _P.STUDENT_VIEW,
        _P.RISK_VIEW, _P.RISK_VIEW_SHAP, _P.RISK_SCORES_VIEW,
        _P.INTERVENTION_VIEW, _P.INTERVENTION_CREATE, _P.INTERVENTION_UPDATE,
        _P.SIMULATOR_RUN,
        _P.PLACEMENT_DASHBOARD_VIEW, _P.PLACEMENT_STUDENT_VIEW,
        _P.PLACEMENT_READINESS_VIEW, _P.PLACEMENT_RISK_VIEW,
        _P.PLACEMENT_SKILLS_VIEW, _P.PLACEMENT_SKILL_GAP_VIEW,
        _P.PLACEMENT_JOBS_VIEW,
        _P.COPILOT_USE,
        _P.REPORT_VIEW,
    },

    BaseRole.CLASS_ADVISOR: {
        _P.DASHBOARD_VIEW,
        _P.STUDENT_LIST, _P.STUDENT_VIEW, _P.STUDENT_VIEW_ASSIGNED,
        _P.RISK_VIEW, _P.RISK_VIEW_SHAP, _P.RISK_SCORES_VIEW,
        _P.INTERVENTION_VIEW, _P.INTERVENTION_CREATE, _P.INTERVENTION_UPDATE,
        _P.SIMULATOR_RUN,
        _P.PLACEMENT_DASHBOARD_VIEW, _P.PLACEMENT_STUDENT_VIEW,
        _P.COPILOT_USE,
        _P.REPORT_VIEW,
    },

    BaseRole.MENTOR: {
        _P.DASHBOARD_VIEW,
        _P.STUDENT_LIST, _P.STUDENT_VIEW, _P.STUDENT_VIEW_ASSIGNED,
        _P.RISK_VIEW, _P.RISK_VIEW_SHAP,
        _P.INTERVENTION_VIEW, _P.INTERVENTION_CREATE, _P.INTERVENTION_UPDATE,
        _P.SIMULATOR_RUN,
        _P.COPILOT_USE,
        _P.REPORT_VIEW,
    },

    BaseRole.PLACEMENT_COORDINATOR: {
        _P.PLACEMENT_DASHBOARD_VIEW,
        _P.PLACEMENT_STUDENT_VIEW,
        _P.PLACEMENT_READINESS_VIEW, _P.PLACEMENT_RISK_VIEW,
        _P.PLACEMENT_SKILLS_VIEW, _P.PLACEMENT_SKILL_GAP_VIEW,
        _P.PLACEMENT_JOBS_VIEW, _P.PLACEMENT_JOBS_CREATE,
        _P.PLACEMENT_MATCHING_RUN,
        _P.PLACEMENT_TRAINING_VIEW, _P.PLACEMENT_TRAINING_CREATE,
        _P.PLACEMENT_INTERVENTION_CREATE,
        _P.PLACEMENT_OUTCOME_VIEW, _P.PLACEMENT_OUTCOME_RECORD,
        _P.PLACEMENT_ANALYTICS_VIEW, _P.PLACEMENT_EXPORT,
        _P.COPILOT_USE,
        _P.REPORT_VIEW, _P.REPORT_EXPORT,
    },

    BaseRole.PLACEMENT_OFFICER: {
        _P.PLACEMENT_DASHBOARD_VIEW,
        _P.PLACEMENT_STUDENT_VIEW,
        _P.PLACEMENT_READINESS_VIEW, _P.PLACEMENT_RISK_VIEW,
        _P.PLACEMENT_SKILLS_VIEW, _P.PLACEMENT_SKILL_GAP_VIEW,
        _P.PLACEMENT_JOBS_VIEW, _P.PLACEMENT_JOBS_CREATE,
        _P.PLACEMENT_MATCHING_RUN,
        _P.PLACEMENT_TRAINING_VIEW, _P.PLACEMENT_TRAINING_CREATE,
        _P.PLACEMENT_INTERVENTION_CREATE,
        _P.PLACEMENT_OUTCOME_VIEW, _P.PLACEMENT_OUTCOME_RECORD,
        _P.PLACEMENT_ANALYTICS_VIEW, _P.PLACEMENT_EXPORT,
        _P.COPILOT_USE,
        _P.REPORT_VIEW, _P.REPORT_EXPORT,
    },

    BaseRole.STUDENT: {
        _P.STUDENT_VIEW_OWN,
        _P.PLACEMENT_STUDENT_OWN, _P.PLACEMENT_READINESS_VIEW,
        _P.PLACEMENT_SKILLS_VIEW, _P.PLACEMENT_SKILL_GAP_VIEW,
        _P.PLACEMENT_TRAINING_VIEW,
        _P.SIMULATOR_RUN,
        _P.COPILOT_USE,
    },

    BaseRole.CLASS_REPRESENTATIVE: {
        _P.DASHBOARD_VIEW,
        _P.STUDENT_LIST,            # aggregate metrics without private individual risk scores/marks
        _P.STUDENT_VIEW_OWN,
        _P.PLACEMENT_STUDENT_OWN,
        _P.COPILOT_USE,
    },
}


# ══════════════════════════════════════════════════════════════
# 5. RESPONSIBILITY → ADDITIONAL PERMISSIONS (additive)
# ══════════════════════════════════════════════════════════════
RESPONSIBILITY_PERMISSIONS: dict[Responsibility, Set[Permission]] = {
    Responsibility.CLASS_ADVISOR: {
        _P.STUDENT_VIEW_ASSIGNED,
        _P.INTERVENTION_CREATE, _P.INTERVENTION_VIEW, _P.INTERVENTION_UPDATE,
        _P.RISK_VIEW, _P.RISK_VIEW_SHAP,
        _P.SIMULATOR_RUN,
        _P.REPORT_VIEW,
    },

    Responsibility.MENTOR: {
        _P.STUDENT_VIEW_ASSIGNED,
        _P.INTERVENTION_VIEW, _P.INTERVENTION_CREATE, _P.INTERVENTION_UPDATE,
        _P.SIMULATOR_RUN,
    },

    Responsibility.PLACEMENT_COORDINATOR: {
        _P.PLACEMENT_DASHBOARD_VIEW,
        _P.PLACEMENT_STUDENT_VIEW,
        _P.PLACEMENT_READINESS_VIEW, _P.PLACEMENT_RISK_VIEW,
        _P.PLACEMENT_SKILLS_VIEW, _P.PLACEMENT_SKILL_GAP_VIEW,
        _P.PLACEMENT_JOBS_VIEW, _P.PLACEMENT_JOBS_CREATE,
        _P.PLACEMENT_MATCHING_RUN,
        _P.PLACEMENT_TRAINING_VIEW, _P.PLACEMENT_TRAINING_CREATE,
        _P.PLACEMENT_INTERVENTION_CREATE,
        _P.PLACEMENT_OUTCOME_VIEW, _P.PLACEMENT_OUTCOME_RECORD,
        _P.PLACEMENT_ANALYTICS_VIEW, _P.PLACEMENT_EXPORT,
        _P.REPORT_VIEW, _P.REPORT_EXPORT,
    },

    Responsibility.PLACEMENT_OFFICER: {
        _P.PLACEMENT_DASHBOARD_VIEW,
        _P.PLACEMENT_STUDENT_VIEW,
        _P.PLACEMENT_READINESS_VIEW, _P.PLACEMENT_RISK_VIEW,
        _P.PLACEMENT_SKILLS_VIEW, _P.PLACEMENT_SKILL_GAP_VIEW,
        _P.PLACEMENT_JOBS_VIEW, _P.PLACEMENT_JOBS_CREATE,
        _P.PLACEMENT_MATCHING_RUN,
        _P.PLACEMENT_TRAINING_VIEW, _P.PLACEMENT_TRAINING_CREATE,
        _P.PLACEMENT_INTERVENTION_CREATE,
        _P.PLACEMENT_OUTCOME_VIEW, _P.PLACEMENT_OUTCOME_RECORD,
        _P.PLACEMENT_ANALYTICS_VIEW, _P.PLACEMENT_EXPORT,
        _P.REPORT_VIEW, _P.REPORT_EXPORT,
    },

    Responsibility.CLASS_REPRESENTATIVE: {
        _P.DASHBOARD_VIEW,
        _P.STUDENT_LIST,
    },

    Responsibility.CR: {
        _P.DASHBOARD_VIEW,
        _P.STUDENT_LIST,
    },
}


# ══════════════════════════════════════════════════════════════
# 6. ROLE HIERARCHY
# ══════════════════════════════════════════════════════════════
ROLE_HIERARCHY: dict[BaseRole, int] = {
    BaseRole.ADMIN:                  100,
    BaseRole.JOINT_SECRETARY:        90,
    BaseRole.PRINCIPAL:              80,
    BaseRole.HOD:                    60,
    BaseRole.PLACEMENT_COORDINATOR:  50,
    BaseRole.PLACEMENT_OFFICER:      50,
    BaseRole.FACULTY:                40,
    BaseRole.CLASS_ADVISOR:          40,
    BaseRole.MENTOR:                 40,
    BaseRole.CLASS_REPRESENTATIVE:   15,
    BaseRole.STUDENT:                10,
}


def get_effective_permissions(
    role: str,
    responsibilities: Optional[List[str]] = None,
) -> Set[str]:
    """Return the full set of permission strings for a user."""
    try:
        base = BaseRole(role)
    except ValueError:
        base = BaseRole.STUDENT

    perms: Set[Permission] = set(BASE_ROLE_PERMISSIONS.get(base, set()))

    for resp_str in (responsibilities or []):
        try:
            resp = Responsibility(resp_str)
            perms |= RESPONSIBILITY_PERMISSIONS.get(resp, set())
        except ValueError:
            pass

    return {p.value for p in perms}


def has_permission(
    role: str,
    permission: str,
    responsibilities: Optional[List[str]] = None,
) -> bool:
    return permission in get_effective_permissions(role, responsibilities)


def is_senior_to(role_a: str, role_b: str) -> bool:
    try:
        rank_a = ROLE_HIERARCHY.get(BaseRole(role_a), 0)
        rank_b = ROLE_HIERARCHY.get(BaseRole(role_b), 0)
        return rank_a > rank_b
    except ValueError:
        return False
