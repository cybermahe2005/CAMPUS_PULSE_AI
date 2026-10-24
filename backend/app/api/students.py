"""Students API — list, detail, single creation, and multi-role RBAC scoping."""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, Dict, Any, List
import math
from pydantic import BaseModel, Field
from datetime import datetime, timezone

from app.core.security import get_current_user, require_any, require_authenticated, require_institution, hash_password
from app.schemas.auth import TokenData, UserRole
from app.core.database import get_db
from app.core.risk_engine import evaluate_student_state

router = APIRouter()


class CreateStudentRequest(BaseModel):
    rollNumber: str = Field(..., description="Unique Roll Number / Student ID")
    name: str = Field(..., description="Full Name")
    email: str = Field(..., description="Institutional Email")
    department: str = Field(..., description="Department")
    degree: str = "B.Tech"
    specialization: Optional[str] = None
    batch: str = "2024-2028"
    semester: int = Field(default=4, ge=1, le=8)
    section: str = "A"
    cgpa: float = Field(default=7.0, ge=0.0, le=10.0)
    attendancePct: float = Field(default=80.0, ge=0.0, le=100.0)
    currentArrears: int = Field(default=0, ge=0)
    historicalArrears: int = Field(default=0, ge=0)
    placementReadiness: float = Field(default=50.0, ge=0.0, le=100.0)
    codingScore: Optional[float] = 50.0
    aptitudeScore: Optional[float] = 50.0
    mockInterviewScore: Optional[float] = 50.0
    lmsConsistency: Optional[float] = 70.0
    technicalSkills: Optional[str] = ""
    softSkills: Optional[str] = ""
    phone: Optional[str] = None
    defaultPassword: Optional[str] = "Student@123"


@router.post("", summary="Create a single student record and linked user account")
async def create_single_student(
    req: CreateStudentRequest,
    current_user: TokenData = Depends(require_institution),
):
    db = await get_db()
    roll = req.rollNumber.strip().upper()
    email = req.email.strip().lower()

    # 1. Uniqueness check in students collection
    existing_student = await db.students.find_one({"$or": [{"studentId": roll}, {"rollNo": roll}]})
    if existing_student:
        raise HTTPException(status_code=400, detail=f"Student with roll number '{roll}' already exists")

    # 2. Uniqueness check in users collection
    existing_user = await db.users.find_one({"$or": [{"userId": roll}, {"email": email}, {"username": roll.lower()}]})
    if existing_user:
        raise HTTPException(status_code=400, detail=f"User account with identifier or email '{email}' already exists")

    # 3. Canonical risk and SSI calculation
    skills_list = [s.strip() for s in (req.technicalSkills or "").split(",") if s.strip()]
    eval_dict = {
        "cgpa": req.cgpa,
        "backlogCount": req.currentArrears,
        "attendancePct": req.attendancePct,
        "codingScore": req.codingScore or 50.0,
        "aptitudeScore": req.aptitudeScore or 50.0,
        "mockInterviewScore": req.mockInterviewScore or 50.0,
        "lmsConsistency": req.lmsConsistency or 70.0,
        "momentum": "STABLE",
    }
    evaluated = evaluate_student_state(eval_dict)
    now_iso = datetime.now(timezone.utc).isoformat()

    student_doc = {
        "studentId": roll,
        "rollNo": roll,
        "name": req.name.strip(),
        "email": email,
        "phone": req.phone or "",
        "department": req.department,
        "degree": req.degree,
        "specialization": req.specialization,
        "batch": req.batch,
        "semester": req.semester,
        "section": req.section,
        "cgpa": req.cgpa,
        "attendancePct": req.attendancePct,
        "currentArrears": req.currentArrears,
        "historicalArrears": req.historicalArrears,
        "backlogCount": req.currentArrears,
        "totalArrearsHistory": req.historicalArrears,
        "codingScore": req.codingScore or 50.0,
        "aptitudeScore": req.aptitudeScore or 50.0,
        "mockInterviewScore": req.mockInterviewScore or 50.0,
        "lmsConsistency": req.lmsConsistency or 70.0,
        "placementReadiness": req.placementReadiness,
        "academicReadiness": evaluated["academicReadiness"],
        "engagementHealth": evaluated["engagementHealth"],
        "successIndex": evaluated["successIndex"],
        "riskLevel": evaluated["riskLevel"],
        "riskProbability": evaluated["riskProbability"],
        "momentum": "STABLE",
        "skills": {s.lower(): 70 for s in skills_list},
        "studentSkills": [{"skillName": s, "proficiencyScore": 70, "source": "MANUAL_CREATION", "verified": False} for s in skills_list],
        "dataSource": "SINGLE_REGISTRATION",
        "dataConfidence": 95.0,
        "createdAt": now_iso,
        "createdBy": current_user.name,
    }
    await db.students.insert_one(student_doc)
    student_doc.pop("_id", None)

    # 4. Create linked user login account
    default_pw = req.defaultPassword or "Student@123"
    user_doc = {
        "userId": roll,
        "username": roll.lower(),
        "name": req.name.strip(),
        "email": email,
        "role": UserRole.STUDENT.value,
        "department": req.department,
        "passwordHash": hash_password(default_pw),
        "mustChangePassword": True,
        "isActive": True,
        "createdAt": now_iso,
        "createdBy": current_user.name,
    }
    await db.users.insert_one(user_doc)

    # 5. Audit log
    await db.audit_logs.insert_one({
        "action": "CREATE_SINGLE_STUDENT",
        "studentId": roll,
        "createdById": current_user.userId,
        "createdByName": current_user.name,
        "timestamp": now_iso,
    })

    return {
        "ok": True,
        "message": f"Student '{req.name}' ({roll}) created successfully with login credentials provisioned",
        "student": student_doc,
        "userCreated": True,
        "defaultPassword": default_pw,
        "mustChangePassword": True,
    }


def scope_filter(user: TokenData) -> dict:
    flt: Dict[str, Any] = {}

    # Mentor scoping
    if (user.role == UserRole.MENTOR or "MENTOR" in user.responsibilities) and user.menteeIds:
        return {"$or": [{"studentId": {"$in": user.menteeIds}}, {"rollNo": {"$in": user.menteeIds}}]}

    # Class advisor scoping
    if (user.role == UserRole.CLASS_ADVISOR or "CLASS_ADVISOR" in user.responsibilities) and user.classIds:
        return {
            "$or": [
                {"section": {"$in": user.classIds}},
                {"classId": {"$in": user.classIds}},
                {"department": user.department} if user.department else {}
            ]
        }

    # HOD & Faculty scoping
    if user.role in (UserRole.HOD, UserRole.FACULTY) and user.department:
        return {"department": user.department}

    # Class representative: restricted to own department/section
    if user.role == UserRole.CLASS_REPRESENTATIVE and user.department:
        return {"department": user.department}

    return flt


@router.get("", summary="List students with role-scoped boundaries")
async def list_students(
    q:          Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    riskLevel:  Optional[str] = Query(None),
    momentum:   Optional[str] = Query(None),
    segment:    Optional[str] = Query(None),
    sortBy:     str           = Query("successIndex"),
    sortAsc:    bool          = Query(False),
    page:       int           = Query(1, ge=1),
    perPage:    int           = Query(30, ge=1, le=100),
    current_user: TokenData   = Depends(require_any),
):
    db = await get_db()
    flt = scope_filter(current_user)

    if department:
        flt["department"] = department
    if riskLevel:
        flt["riskLevel"] = riskLevel
    if momentum:
        flt["momentum"] = momentum
    if segment:
        flt["segment"] = segment
    if q:
        flt["$or"] = [
            {"name":       {"$regex": q, "$options": "i"}},
            {"studentId":  {"$regex": q, "$options": "i"}},
            {"rollNo":     {"$regex": q, "$options": "i"}},
            {"department": {"$regex": q, "$options": "i"}},
        ]

    total = await db.students.count_documents(flt)
    pages = math.ceil(total / perPage) if total > 0 else 1
    skip = (page - 1) * perPage
    sort_d = 1 if sortAsc else -1

    # Class Rep privacy masking: CR does NOT get raw risk probabilities or confidential metrics
    if current_user.role == UserRole.CLASS_REPRESENTATIVE:
        SUMMARY_FIELDS = {
            "studentId": 1, "name": 1, "department": 1, "semester": 1, "rollNo": 1,
            "successIndex": 1, "placementReadiness": 1, "momentum": 1, "_id": 0
        }
    else:
        SUMMARY_FIELDS = {
            "studentId": 1, "name": 1, "email": 1, "department": 1, "semester": 1, "rollNo": 1,
            "cgpa": 1, "attendancePct": 1, "codingScore": 1, "aptitudeScore": 1,
            "mockInterviewScore": 1, "lmsConsistency": 1,
            "successIndex": 1, "academicReadiness": 1, "placementReadiness": 1, "engagementHealth": 1,
            "riskProbability": 1, "riskLevel": 1, "momentum": 1, "riskVelocity": 1,
            "recoveryPotential": 1, "recoveryLabel": 1, "segment": 1, "segmentLabel": 1,
            "dataConfidence": 1, "backlogCount": 1, "_id": 0
        }

    students = await db.students.find(flt, SUMMARY_FIELDS).sort(sortBy, sort_d).skip(skip).limit(perPage).to_list(perPage)

    return {"students": students, "total": total, "page": page, "perPage": perPage, "pages": pages}


@router.get("/{student_id}", summary="Get student record with IDOR verification")
async def get_student(student_id: str, current_user: TokenData = Depends(require_authenticated)):
    db = await get_db()

    # STUDENT role: strictly self-only access
    if current_user.role == UserRole.STUDENT and student_id != current_user.userId:
        raise HTTPException(status_code=403, detail="Students can only view their own profile")

    # CR role: cannot view individual confidential student profile
    if current_user.role == UserRole.CLASS_REPRESENTATIVE and student_id != current_user.userId:
        raise HTTPException(status_code=403, detail="Class representatives are not authorized to view individual student confidential profiles")

    flt = {"studentId": student_id}
    # Check department scoping for HOD
    if current_user.role == UserRole.HOD and current_user.department:
        flt["department"] = current_user.department

    student = await db.students.find_one(flt, {"_id": 0})
    if not student:
        # Check by rollNo
        flt2 = {"rollNo": student_id}
        if current_user.role == UserRole.HOD and current_user.department:
            flt2["department"] = current_user.department
        student = await db.students.find_one(flt2, {"_id": 0})

    if not student:
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")

    return student
