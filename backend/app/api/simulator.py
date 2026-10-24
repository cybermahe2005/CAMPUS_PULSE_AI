"""
Simulator API — What-If scenario engine powered by the canonical Risk Engine.
Allows authorized users to simulate alternative futures without modifying stored records.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from app.core.security import get_current_user
from app.schemas.auth import TokenData, UserRole
from app.core.database import get_db
from app.core.risk_engine import evaluate_student_state

router = APIRouter()


class SimulatorRequest(BaseModel):
    attendancePct: Optional[float] = Field(None, ge=0.0, le=100.0, description="Simulated Attendance Percentage")
    codingScore: Optional[float] = Field(None, ge=0.0, le=100.0, description="Simulated Coding Assessment Score")
    mockInterviewScore: Optional[float] = Field(None, ge=0.0, le=100.0, description="Simulated Mock Interview Score")
    aptitudeScore: Optional[float] = Field(None, ge=0.0, le=100.0, description="Simulated Aptitude Score")
    lmsConsistency: Optional[float] = Field(None, ge=0.0, le=100.0, description="Simulated LMS Interaction %")
    dsaScore: Optional[float] = Field(None, ge=0.0, le=100.0, description="Simulated Data Structures Score")
    backlogCount: Optional[int] = Field(None, ge=0, le=20, description="Simulated Active Backlogs")
    cgpa: Optional[float] = Field(None, ge=0.0, le=10.0, description="Simulated CGPA")


@router.post("/{student_id}")
async def simulate(
    student_id: str,
    req: SimulatorRequest,
    current_user: TokenData = Depends(get_current_user),
):
    # IDOR check: Student can only simulate their own profile
    if current_user.role == UserRole.STUDENT and student_id != current_user.userId:
        raise HTTPException(status_code=403, detail="Students can only simulate their own profile")

    db = await get_db()
    student = await db.students.find_one({"studentId": student_id}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")

    # Evaluate baseline state using canonical risk engine
    baseline = evaluate_student_state(student)

    # Build scenario clone — NEVER mutates database document
    scenario_student = dict(student)
    applied_changes = req.model_dump(exclude_none=True)

    for k, v in applied_changes.items():
        if k == "dsaScore":
            scenario_student.setdefault("skills", {})["dsa"] = v
        elif k == "backlogCount":
            scenario_student["backlogCount"] = v
            scenario_student["currentArrears"] = v
        else:
            scenario_student[k] = v

    # Dynamic momentum determination for scenario
    # If simulated improvements in attendance or skills exceed baseline significantly:
    net_improvement = (
        (scenario_student.get("attendancePct", 75) - student.get("attendancePct", 75)) +
        (scenario_student.get("codingScore", 50) - student.get("codingScore", 50)) +
        ((student.get("backlogCount", 0) - scenario_student.get("backlogCount", 0)) * 15)
    )
    if net_improvement >= 15.0:
        scenario_student["momentum"] = "POSITIVE"
    elif net_improvement <= -15.0:
        scenario_student["momentum"] = "NEGATIVE"

    # Evaluate scenario state
    scenario = evaluate_student_state(scenario_student)

    # Calculate exact deltas
    delta = {
        "successIndex": round(scenario["successIndex"] - baseline["successIndex"], 1),
        "academicReadiness": round(scenario["academicReadiness"] - baseline["academicReadiness"], 1),
        "placementReadiness": round(scenario["placementReadiness"] - baseline["placementReadiness"], 1),
        "engagementHealth": round(scenario["engagementHealth"] - baseline["engagementHealth"], 1),
        "riskProbability": round(scenario["riskProbability"] - baseline["riskProbability"], 3),
        "backlogDelta": scenario["backlogCount"] - baseline["backlogCount"],
    }

    tier_changed = scenario["riskLevel"] != baseline["riskLevel"]

    return {
        "studentId": student_id,
        "studentName": student.get("name"),
        "department": student.get("department"),
        "current": baseline,
        "scenario": scenario,
        "scenarioInputs": applied_changes,
        "delta": delta,
        "tierChanged": tier_changed,
        "disclaimer": "Scenario projections are model estimates derived from the institutional canonical risk engine. Real database records remain unaltered.",
    }
