"""Dashboard API — Multi-role mission control and decision intelligence."""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List, Dict, Any
from app.core.security import get_current_user, require_any
from app.schemas.auth import TokenData, UserRole
from app.core.database import get_db

router = APIRouter()


@router.get("/summary", summary="Mission control summary with role scoping")
async def dashboard_summary(current_user: TokenData = Depends(require_any)):
    db = await get_db()
    dept_filter = {}

    # Department scoping for HOD
    if current_user.role == UserRole.HOD and current_user.department:
        dept_filter = {"department": current_user.department}
    # Class advisor scoping
    elif (current_user.role == UserRole.CLASS_ADVISOR or "CLASS_ADVISOR" in current_user.responsibilities) and current_user.classIds:
        dept_filter = {"$or": [{"section": {"$in": current_user.classIds}}, {"classId": {"$in": current_user.classIds}}]}
    # Mentor scoping
    elif (current_user.role == UserRole.MENTOR or "MENTOR" in current_user.responsibilities) and current_user.menteeIds:
        dept_filter = {"studentId": {"$in": current_user.menteeIds}}

    total = await db.students.count_documents(dept_filter)
    healthy = await db.students.count_documents({**dept_filter, "riskLevel": "healthy"})
    watch = await db.students.count_documents({**dept_filter, "riskLevel": "watch"})
    at_risk = await db.students.count_documents({**dept_filter, "riskLevel": "at_risk"})
    critical = await db.students.count_documents({**dept_filter, "riskLevel": "critical"})
    det = await db.students.count_documents({**dept_filter, "momentum": "NEGATIVE"})
    improving = await db.students.count_documents({**dept_filter, "momentum": "POSITIVE"})

    # Averages
    pipeline = [
        {"$match": dept_filter},
        {"$group": {
            "_id": None,
            "avgSuccess":    {"$avg": "$successIndex"},
            "avgPlacement":  {"$avg": "$placementReadiness"},
            "avgAttendance": {"$avg": "$attendancePct"},
            "avgCgpa":       {"$avg": "$cgpa"},
            "avgRisk":       {"$avg": "$riskProbability"},
        }}
    ]
    agg = await db.students.aggregate(pipeline).to_list(1)
    avgs = agg[0] if agg else {}

    # Department breakdown (for institution/leadership/all view)
    dept_pipe = [
        {"$match": dept_filter if dept_filter else {}},
        {"$group": {
            "_id": "$department",
            "total":        {"$sum": 1},
            "avgSuccess":   {"$avg": "$successIndex"},
            "avgPlacement": {"$avg": "$placementReadiness"},
            "critical":     {"$sum": {"$cond": [{"$eq": ["$riskLevel", "critical"]}, 1, 0]}},
            "risk":         {"$sum": {"$cond": [{"$eq": ["$riskLevel", "at_risk"]}, 1, 0]}},
        }},
        {"$sort": {"total": -1}}
    ]
    dept_stats = await db.students.aggregate(dept_pipe).to_list(10)
    for d in dept_stats:
        d["department"] = d.pop("_id")

    # Priority queue — at-risk students sorted by urgency
    priority = await db.students.find(
        {**dept_filter, "riskLevel": {"$in": ["at_risk", "critical"]}},
        {"studentId": 1, "name": 1, "department": 1, "semester": 1, "successIndex": 1,
         "riskLevel": 1, "riskProbability": 1, "momentum": 1, "recoveryPotential": 1,
         "recoveryLabel": 1, "riskVelocity": 1, "shapDrivers": 1, "cgpa": 1, "attendancePct": 1, "_id": 0}
    ).sort("riskProbability", -1).limit(15).to_list(15)

    # Segment stats
    seg_pipe = [
        {"$match": dept_filter},
        {"$group": {"_id": "$segment", "count": {"$sum": 1}}}
    ]
    seg_data = await db.students.aggregate(seg_pipe).to_list(10)
    segment_stats = {s["_id"]: {"count": s["count"], "pct": round(s["count"] / max(1, total) * 100, 1)} for s in seg_data if s["_id"]}

    # Placement metrics summary
    total_jobs = await db.job_opportunities.count_documents({})
    published_jobs = await db.job_opportunities.count_documents({"status": {"$in": ["PUBLISHED", "APPLICATION_OPEN"]}})
    total_apps = await db.job_applications.count_documents({})

    # Interventions summary
    total_interventions = await db.interventions.count_documents({})
    active_interventions = await db.interventions.count_documents({"status": {"$in": ["RECOMMENDED", "ASSIGNED", "IN_PROGRESS"]}})
    completed_interventions = await db.interventions.count_documents({"status": "COMPLETED"})

    return {
        "userRole": current_user.role.value,
        "scope": current_user.department or "INSTITUTION",
        "total": total,
        "healthy": healthy,
        "watch": watch,
        "atRisk": at_risk,
        "critical": critical,
        "deteriorating": det,
        "improving": improving,
        "avgSuccessIndex": round(avgs.get("avgSuccess", 0) or 0, 1),
        "avgPlacementReadiness": round(avgs.get("avgPlacement", 0) or 0, 1),
        "avgAttendance": round(avgs.get("avgAttendance", 0) or 0, 1),
        "avgCgpa": round(avgs.get("avgCgpa", 0) or 0, 2),
        "avgRiskProbability": round(avgs.get("avgRisk", 0) or 0, 3),
        "deptStats": dept_stats,
        "priorityQueue": priority,
        "segmentStats": segment_stats,
        "placementMetrics": {
            "totalJobs": total_jobs,
            "publishedJobs": published_jobs,
            "totalApplications": total_apps,
        },
        "interventionMetrics": {
            "total": total_interventions,
            "active": active_interventions,
            "completed": completed_interventions,
            "completionRate": round((completed_interventions / max(1, total_interventions)) * 100, 1) if total_interventions > 0 else 0.0,
        },
    }
