"""
Canonical Risk & Success Calculation Engine for Campus Pulse AI.
Provides single-source-of-truth, mathematically monotonic formulas used consistently
across backend APIs, simulator, student dashboard, and executive views.
"""
from typing import Dict, Any, Tuple

def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    """Clamp float value between lo and hi bounds."""
    try:
        val = float(v)
    except (TypeError, ValueError):
        val = lo
    return max(lo, min(hi, val))


def calculate_academic_readiness(cgpa: float, backlog_count: int = 0) -> float:
    """
    Academic Readiness Index (0 - 100):
    Normalized CGPA (10-point scale * 10) penalized monotonically by active backlogs.
    """
    cgpa_norm = clamp(cgpa, 0.0, 10.0) * 10.0
    backlog_penalty = max(0, int(backlog_count)) * 12.0
    return round(clamp(cgpa_norm - backlog_penalty, 0.0, 100.0), 1)


def calculate_placement_readiness(
    coding_score: float = 50.0,
    aptitude_score: float = 50.0,
    mock_interview_score: float = 50.0,
    dsa_score: float = 50.0
) -> float:
    """
    Placement Readiness Score (0 - 100):
    Weighted evaluation across technical coding, aptitude, mock interviews, and DSA benchmarks.
    """
    c = clamp(coding_score)
    a = clamp(aptitude_score)
    m = clamp(mock_interview_score)
    d = clamp(dsa_score)
    score = (c * 0.35) + (a * 0.25) + (m * 0.20) + (d * 0.20)
    return round(clamp(score, 0.0, 100.0), 1)


def calculate_engagement_health(
    attendance_pct: float = 75.0,
    lms_consistency: float = 70.0,
    certification_count: int = 1,
    event_count: int = 3
) -> float:
    """
    Engagement Health Index (0 - 100):
    Longitudinal attendance consistency, LMS interaction, and verified curricular activities.
    """
    att = clamp(attendance_pct)
    lms = clamp(lms_consistency)
    activity_bonus = min(15.0, (int(certification_count) * 4.0) + (int(event_count) * 1.5))
    score = (att * 0.55) + (lms * 0.30) + activity_bonus
    return round(clamp(score, 0.0, 100.0), 1)


def calculate_student_success_index(
    academic_readiness: float,
    placement_readiness: float,
    engagement_health: float,
    backlog_count: int = 0,
    momentum_direction: str = "STABLE"
) -> float:
    """
    Canonical Student Success Index (SSI) (0 - 100):
    Weighted synthesis of core pillars with active backlog impact and momentum direction.
    """
    acad = clamp(academic_readiness)
    place = clamp(placement_readiness)
    eng = clamp(engagement_health)
    
    # Momentum adjustment (-5 to +5)
    mom_adj = 5.0 if momentum_direction == "POSITIVE" else -5.0 if momentum_direction == "NEGATIVE" else 0.0
    
    base_ssi = (acad * 0.40) + (place * 0.30) + (eng * 0.30) + mom_adj
    return round(clamp(base_ssi, 0.0, 100.0), 1)


def calculate_risk_tier(
    ssi: float,
    attendance_pct: float,
    backlog_count: int
) -> Tuple[float, str, str]:
    """
    Canonical Risk Classification Policy:
    Ensures strict mathematical monotonicity — higher SSI and attendance monotonically
    lower risk probability and transition through consistent risk tiers.
    
    Returns:
        (risk_probability [0.0 - 1.0], risk_level_key, risk_label)
    """
    ssi_val = clamp(ssi)
    att_val = clamp(attendance_pct)
    backlogs = max(0, int(backlog_count))
    
    # Risk probability is inversely proportional to SSI with attendance floor penalty
    base_risk = (100.0 - ssi_val) / 100.0
    if att_val < 75.0:
        base_risk += (75.0 - att_val) * 0.005
    if backlogs > 0:
        base_risk += backlogs * 0.08
        
    risk_prob = round(clamp(base_risk, 0.02, 0.98), 3)
    
    # Strict Monotonic Tier Thresholds
    if backlogs >= 2 or risk_prob >= 0.65 or att_val < 60.0 or ssi_val < 45.0:
        tier_key = "critical"
        label = "Critical Risk"
    elif backlogs == 1 or risk_prob >= 0.40 or att_val < 75.0 or ssi_val < 65.0:
        tier_key = "at_risk"
        label = "High Risk (At-Risk)"
    elif risk_prob >= 0.22 or ssi_val < 78.0 or att_val < 82.0:
        tier_key = "watch"
        label = "Moderate Risk (Watch)"
    else:
        tier_key = "healthy"
        label = "Low Risk (Healthy)"
        
    return risk_prob, tier_key, label


def evaluate_student_state(student_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Evaluates complete student state deterministically using canonical formulas.
    Used by simulator, bulk import, student APIs, and dashboard summaries.
    """
    cgpa = float(student_data.get("cgpa", 7.0))
    backlogs = int(student_data.get("backlogCount", student_data.get("currentArrears", 0)))
    att = float(student_data.get("attendancePct", student_data.get("attendancePercentage", 80.0)))
    coding = float(student_data.get("codingScore", 50.0))
    aptitude = float(student_data.get("aptitudeScore", 50.0))
    mock = float(student_data.get("mockInterviewScore", 50.0))
    dsa = float(student_data.get("skills", {}).get("dsa", student_data.get("dsaScore", coding)))
    lms = float(student_data.get("lmsConsistency", 70.0))
    certs = int(student_data.get("certificationCount", 1))
    events = int(student_data.get("eventCount", 3))
    momentum = str(student_data.get("momentum", "STABLE")).upper()

    acad_r = calculate_academic_readiness(cgpa, backlogs)
    place_r = calculate_placement_readiness(coding, aptitude, mock, dsa)
    eng_h = calculate_engagement_health(att, lms, certs, events)
    ssi = calculate_student_success_index(acad_r, place_r, eng_h, backlogs, momentum)
    risk_prob, risk_tier, risk_label = calculate_risk_tier(ssi, att, backlogs)

    return {
        "successIndex": ssi,
        "academicReadiness": acad_r,
        "placementReadiness": place_r,
        "engagementHealth": eng_h,
        "riskProbability": risk_prob,
        "riskLevel": risk_tier,
        "riskLabel": risk_label,
        "backlogCount": backlogs,
        "attendancePct": att,
        "cgpa": cgpa,
        "momentum": momentum,
    }
