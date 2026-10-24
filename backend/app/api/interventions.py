"""Interventions API — Full lifecycle management, actionable recommendation engine, and outcome tracking."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid

from app.core.security import get_current_user, require_faculty_up, require_any
from app.schemas.auth import TokenData, UserRole
from app.core.database import get_db

router = APIRouter()


class CreateInterventionRequest(BaseModel):
    studentId: str
    title: str
    targetProblem: str
    triggerCondition: Optional[str] = None
    recommendedAction: str
    assignedOwner: Optional[str] = None
    ownerRole: Optional[str] = "FACULTY"
    priority: str = Field(default="MEDIUM", description="HIGH, MEDIUM, LOW, CRITICAL")
    deadlineDays: int = Field(default=30)
    notes: Optional[str] = None


class AssignInterventionRequest(BaseModel):
    interventionId: str
    assignedOwner: str
    ownerRole: str = "CLASS_ADVISOR"
    deadline: Optional[str] = None
    priority: Optional[str] = "HIGH"
    notes: Optional[str] = None


class UpdateStatusRequest(BaseModel):
    status: str = Field(..., description="RECOMMENDED, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED, OUTCOME_PENDING")
    notes: Optional[str] = None


class OutcomeRequest(BaseModel):
    afterMetrics: Dict[str, Any]
    observedImpact: Optional[str] = None
    status: str = "COMPLETED"


@router.get("", summary="List priority interventions for staff")
async def list_interventions(
    dept: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    perPage: int = Query(30, le=100),
    current_user: TokenData = Depends(require_any),
):
    db = await get_db()
    flt: Dict[str, Any] = {}

    if dept:
        flt["department"] = dept
    elif current_user.role == UserRole.HOD and current_user.department:
        flt["department"] = current_user.department

    if status:
        flt["status"] = status
    if priority:
        flt["priority"] = priority

    # If interventions collection has records, query from it; also merge students priority queue
    total_custom = await db.interventions.count_documents(flt)
    custom_items = await db.interventions.find(flt, {"_id": 0}).sort("createdAt", -1).skip((page - 1) * perPage).limit(perPage).to_list(perPage)

    # Priority queue students with at_risk/critical
    student_flt = {}
    if dept: student_flt["department"] = dept
    elif current_user.role == UserRole.HOD and current_user.department: student_flt["department"] = current_user.department
    student_flt["riskLevel"] = {"$in": ["at_risk", "critical"]}

    students = await db.students.find(student_flt, {
        "studentId": 1, "name": 1, "department": 1, "riskLevel": 1, "riskProbability": 1,
        "successIndex": 1, "momentum": 1, "recoveryPotential": 1, "recoveryLabel": 1,
        "attendancePct": 1, "cgpa": 1, "backlogCount": 1, "recommendedInterventions": 1, "shapDrivers": 1, "_id": 0
    }).sort("riskProbability", -1).limit(50).to_list(50)

    return {
        "interventions": custom_items,
        "totalInterventions": total_custom,
        "priorityStudents": students,
        "totalPriorityStudents": len(students),
        "page": page,
        "perPage": perPage,
    }


@router.get("/my", summary="Get authenticated student's action plan & assigned interventions")
async def get_my_interventions(current_user: TokenData = Depends(get_current_user)):
    db = await get_db()
    student = await db.students.find_one({"studentId": current_user.userId}, {"_id": 0})
    if not student:
        # Fallback empty response
        return {"actionItems": [], "interventions": [], "summary": "No active interventions assigned"}

    # Fetch personalized recommendations from student document
    recs = student.get("recommendedInterventions") or []
    # Fetch active database interventions
    custom = await db.interventions.find({"studentId": current_user.userId}, {"_id": 0}).to_list(20)

    # Synthesize actionable learning activities
    actions = []
    for r in recs:
        actions.append({
            "id": r.get("interventionId") or f"ACT-{uuid.uuid4().hex[:6]}",
            "title": r.get("name") or "Academic Support Plan",
            "type": r.get("targetProblem") or "Skill Development",
            "owner": r.get("ownerRole") or "Faculty Advisor",
            "reason": r.get("reason") or "Identified by predictive analytics",
            "expectedImpact": r.get("expectedImpact") or "Performance Improvement",
            "status": "RECOMMENDED",
            "duration": f"{r.get('durationDays', 30)} days",
            "priority": "HIGH" if r.get("priorityScore", 0) > 0.7 else "MEDIUM",
        })

    for c in custom:
        actions.append({
            "id": c.get("interventionId"),
            "title": c.get("title"),
            "type": c.get("targetProblem"),
            "owner": c.get("assignedOwner") or c.get("ownerRole"),
            "reason": c.get("recommendedAction"),
            "status": c.get("status", "ASSIGNED"),
            "priority": c.get("priority", "HIGH"),
            "deadline": c.get("deadline"),
            "notes": c.get("notes"),
        })

    return {
        "studentId": current_user.userId,
        "studentName": student.get("name"),
        "totalActions": len(actions),
        "actionItems": actions,
    }


@router.post("/create", summary="Create a new intervention recommendation")
async def create_intervention(
    req: CreateInterventionRequest,
    current_user: TokenData = Depends(require_faculty_up),
):
    db = await get_db()
    student = await db.students.find_one({"studentId": req.studentId})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    now = datetime.now(timezone.utc)
    deadline = (now + timedelta(days=req.deadlineDays)).isoformat()
    int_id = f"INT-{uuid.uuid4().hex[:8].upper()}"

    doc = {
        "interventionId": int_id,
        "studentId": req.studentId,
        "studentName": student.get("name"),
        "department": student.get("department"),
        "title": req.title,
        "targetProblem": req.targetProblem,
        "triggerCondition": req.triggerCondition or "Manual Faculty Recommendation",
        "recommendedAction": req.recommendedAction,
        "assignedOwner": req.assignedOwner or current_user.name,
        "ownerRole": req.ownerRole,
        "priority": req.priority.upper(),
        "status": "ASSIGNED" if req.assignedOwner else "RECOMMENDED",
        "deadline": deadline,
        "notes": req.notes,
        "createdBy": current_user.name,
        "createdById": current_user.userId,
        "createdAt": now.isoformat(),
        "updatedAt": now.isoformat(),
    }

    await db.interventions.insert_one(doc)
    doc.pop("_id", None)

    return {"ok": True, "message": "Intervention created successfully", "intervention": doc}


@router.post("/assign", summary="Assign an intervention to a mentor or faculty advisor")
async def assign_intervention(
    req: AssignInterventionRequest,
    current_user: TokenData = Depends(require_faculty_up),
):
    db = await get_db()
    now_iso = datetime.now(timezone.utc).isoformat()

    res = await db.interventions.update_one(
        {"interventionId": req.interventionId},
        {
            "$set": {
                "assignedOwner": req.assignedOwner,
                "ownerRole": req.ownerRole,
                "priority": req.priority,
                "status": "ASSIGNED",
                "assignedAt": now_iso,
                "deadline": req.deadline or (datetime.now(timezone.utc) + timedelta(days=21)).isoformat(),
                "assignedBy": current_user.name,
                "updatedAt": now_iso,
            }
        }
    )

    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Intervention not found")

    return {"ok": True, "message": f"Assigned to {req.assignedOwner}"}


@router.post("/{intervention_id}/status", summary="Update status of an intervention")
async def update_intervention_status(
    intervention_id: str,
    req: UpdateStatusRequest,
    current_user: TokenData = Depends(require_faculty_up),
):
    db = await get_db()
    now_iso = datetime.now(timezone.utc).isoformat()

    valid_statuses = ["RECOMMENDED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "OUTCOME_PENDING"]
    if req.status.upper() not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Choose from: {valid_statuses}")

    res = await db.interventions.update_one(
        {"interventionId": intervention_id},
        {
            "$set": {
                "status": req.status.upper(),
                "statusNotes": req.notes,
                "statusUpdatedBy": current_user.name,
                "updatedAt": now_iso,
            }
        }
    )

    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Intervention not found")

    return {"ok": True, "message": f"Status updated to {req.status.upper()}"}


@router.post("/{intervention_id}/outcome", summary="Record measured before/after outcome")
async def record_outcome(
    intervention_id: str,
    req: OutcomeRequest,
    current_user: TokenData = Depends(require_faculty_up),
):
    db = await get_db()
    now_iso = datetime.now(timezone.utc).isoformat()

    res = await db.interventions.update_one(
        {"interventionId": intervention_id},
        {
            "$set": {
                "afterMetrics": req.afterMetrics,
                "observedImpact": req.observedImpact,
                "status": req.status.upper(),
                "completedAt": now_iso,
                "completedBy": current_user.name,
                "updatedAt": now_iso,
            }
        }
    )

    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Intervention not found")

    return {"ok": True, "message": "Outcome recorded successfully"}


@router.get("/summary", summary="Aggregate metrics for intervention governance")
async def get_intervention_summary(current_user: TokenData = Depends(require_any)):
    db = await get_db()
    total = await db.interventions.count_documents({})
    in_progress = await db.interventions.count_documents({"status": "IN_PROGRESS"})
    completed = await db.interventions.count_documents({"status": "COMPLETED"})
    assigned = await db.interventions.count_documents({"status": "ASSIGNED"})
    recommended = await db.interventions.count_documents({"status": "RECOMMENDED"})

    resolution_rate = round((completed / max(1, total)) * 100, 1) if total > 0 else 0.0

    return {
        "total": total,
        "inProgress": in_progress,
        "completed": completed,
        "assigned": assigned,
        "recommended": recommended,
        "resolutionRate": resolution_rate,
    }


@router.get("/optimizer", summary="Intervention Resource Optimizer — workload balance and assignment recommendations")
async def get_intervention_optimizer(current_user: TokenData = Depends(require_any)):
    db = await get_db()
    
    # 1. Active unassigned / recommended high-priority students
    unassigned_interventions = await db.interventions.find(
        {"status": "RECOMMENDED", "priority": {"$in": ["HIGH", "CRITICAL"]}},
        {"_id": 0}
    ).limit(20).to_list(20)

    # If no custom tickets are pending, pull from active high/critical risk students needing mentor assignment
    if not unassigned_interventions:
        priority_students = await db.students.find(
            {"riskLevel": {"$in": ["critical", "at_risk"]}},
            {"studentId": 1, "name": 1, "department": 1, "riskLevel": 1, "riskProbability": 1, "recommendedInterventions": 1, "_id": 0}
        ).sort("riskProbability", -1).limit(10).to_list(10)

        for st in priority_students:
            recs = st.get("recommendedInterventions") or []
            target_prob = recs[0].get("targetProblem", "Academic & Attendance Support") if recs else "Comprehensive Academic Review"
            intv_id = recs[0].get("interventionId", f"SYS-{st['studentId']}") if recs else f"SYS-{st['studentId']}"
            unassigned_interventions.append({
                "interventionId": intv_id,
                "studentId": st.get("studentId"),
                "studentName": st.get("name"),
                "department": st.get("department"),
                "priority": "CRITICAL" if st.get("riskLevel") == "critical" else "HIGH",
                "targetProblem": target_prob,
            })

    # 2. Mentor / Faculty workload analysis
    staff_members = await db.users.find(
        {"role": {"$in": ["FACULTY", "MENTOR", "CLASS_ADVISOR"]}},
        {"userId": 1, "name": 1, "role": 1, "department": 1, "menteeIds": 1, "_id": 0}
    ).to_list(50)

    workload_pipeline = [
        {"$match": {"status": {"$in": ["ASSIGNED", "IN_PROGRESS"]}}},
        {"$group": {"_id": "$assignedOwner", "activeCount": {"$sum": 1}}}
    ]
    workload_counts = {w["_id"]: w["activeCount"] for w in await db.interventions.aggregate(workload_pipeline).to_list(50) if w["_id"]}

    staff_workloads = []
    MAX_CAPACITY = 8
    available_mentors = []

    for s in staff_members:
        name = s.get("name", s.get("userId"))
        active_cnt = workload_counts.get(name, 0)
        mentee_cnt = len(s.get("menteeIds", []))
        total_load = active_cnt + (mentee_cnt // 3)
        utilization_pct = round(min(100.0, (total_load / MAX_CAPACITY) * 100.0), 1)
        is_overloaded = total_load >= MAX_CAPACITY

        staff_stat = {
            "userId": s.get("userId"),
            "name": name,
            "role": s.get("role"),
            "department": s.get("department"),
            "activeInterventions": active_cnt,
            "assignedMentees": mentee_cnt,
            "totalLoad": total_load,
            "utilizationPct": utilization_pct,
            "status": "OVERLOADED" if is_overloaded else "OPTIMAL" if utilization_pct >= 50 else "AVAILABLE",
        }
        staff_workloads.append(staff_stat)
        if not is_overloaded:
            available_mentors.append(staff_stat)

    # Sort available mentors by lowest utilization
    available_mentors.sort(key=lambda x: x["utilizationPct"])

    # Generate explainable recommendations matching departmental scope where possible
    recommendations = []
    for intv in unassigned_interventions:
        # Match mentor by department if available
        target_dept = intv.get("department")
        dept_mentors = [m for m in available_mentors if m.get("department") == target_dept] if target_dept else []
        rec_mentor = dept_mentors[0] if dept_mentors else (available_mentors[0] if available_mentors else None)

        recommendations.append({
            "interventionId": intv.get("interventionId"),
            "studentId": intv.get("studentId"),
            "studentName": intv.get("studentName"),
            "department": intv.get("department"),
            "priority": intv.get("priority"),
            "targetProblem": intv.get("targetProblem"),
            "recommendedAssignee": rec_mentor.get("name") if rec_mentor else "Department Head Review Needed",
            "assigneeRole": rec_mentor.get("role") if rec_mentor else "HOD",
            "rationale": (
                f"Assigned to {rec_mentor.get('name')} ({rec_mentor.get('department')}) based on lowest workload "
                f"({rec_mentor.get('utilizationPct')}% capacity) and matching departmental alignment."
                if rec_mentor else "All mentors at maximum capacity (8+ tasks). Leadership reallocation required."
            ),
        })

    return {
        "totalPendingAssignments": len(unassigned_interventions),
        "totalStaffAnalyzed": len(staff_workloads),
        "overloadedStaffCount": sum(1 for s in staff_workloads if s["status"] == "OVERLOADED"),
        "staffWorkloads": staff_workloads,
        "optimalRecommendations": recommendations,
        "disclaimer": "Resource optimization recommendations require human supervisor review before task finalization.",
    }

