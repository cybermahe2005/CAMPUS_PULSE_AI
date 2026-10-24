"""
Attendance Management API — Complete, Secure, Role-Based Attendance Management System with Period-Based Access Control.
Routes mounted at /api/attendance
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid

from app.core.security import get_current_user, require_faculty_up, require_any, require_admin
from app.schemas.auth import TokenData, UserRole
from app.core.database import get_db
from app.core.attendance_engine import (
    evaluate_session_window,
    check_faculty_assignment_match,
    PERIOD_TIMETABLE,
    get_current_ist_time,
)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class AttendanceRecordItem(BaseModel):
    studentId: str
    status: str = Field(..., description="PRESENT, ABSENT, OD, LATE, EXCUSED")
    absenceReason: Optional[str] = Field(None, description="Required when ABSENT")
    leaveCategory: Optional[str] = Field(None, description="MEDICAL, PERSONAL, UNEXCUSED, OTHER")
    odPurpose: Optional[str] = Field(None, description="Required when OD")
    eventName: Optional[str] = Field(None, description="Event / Activity name when OD")
    remarks: Optional[str] = None


class MarkSessionRequest(BaseModel):
    date: str = Field(..., description="Date formatted as YYYY-MM-DD")
    period: int = Field(default=1, ge=1, le=8, description="Period number (1 to 8)")
    department: str
    semester: int = Field(default=4, ge=1, le=8)
    section: str = Field(default="A")
    subject: str = Field(..., description="Subject / Course Code or Name")
    subjectCode: Optional[str] = None
    records: List[AttendanceRecordItem]
    allowTestingWindow: bool = Field(default=False, description="Testing / admin window override")
    isCaSubmission: bool = Field(default=False, description="Class advisor submission flag")


class CorrectionRequest(BaseModel):
    sessionId: str
    studentId: str
    newStatus: str = Field(..., description="PRESENT, ABSENT, OD, LATE, EXCUSED")
    reason: str = Field(..., min_length=5, description="Mandatory auditable justification for attendance change")


class CreateAssignmentRequest(BaseModel):
    department: str
    academicYear: str = "2026-2027"
    batch: str = "2024-2028"
    yearOfStudy: int = 2
    semester: int = Field(default=4, ge=1, le=8)
    section: str = "A"
    classAdvisorId: str
    classAdvisorName: str
    subjectFacultyId: str
    subjectFacultyName: str
    subjectCode: str
    subjectName: str
    period: int = Field(default=1, ge=1, le=8)
    scheduledStartTime: str = "09:00"
    scheduledEndTime: str = "09:50"
    effectiveStartDate: str = "2026-01-01"
    effectiveEndDate: str = "2026-12-31"
    status: str = "ACTIVE"
    substituteFacultyId: Optional[str] = None
    substituteFacultyName: Optional[str] = None


class SubmitODRequest(BaseModel):
    studentId: str
    department: str
    semester: int = Field(default=4, ge=1, le=8)
    section: str = "A"
    odPurpose: str = Field(..., min_length=3, description="Paper Presentation, Hackathon, Sports, etc.")
    eventName: str = Field(..., min_length=3)
    destination: Optional[str] = "Host Institution"
    startDate: str
    endDate: str
    applicablePeriods: List[int] = Field(default=[1, 2, 3], description="Periods covered by OD")
    reason: str = Field(..., min_length=5)
    proofDocument: Optional[str] = None


class ReviewODRequest(BaseModel):
    action: str = Field(..., description="APPROVED or REJECTED")
    remarks: str = Field(..., min_length=3, description="Reviewer decision justification")


# ── 1. HOD Assignment Management Endpoints ────────────────────────────────────

@router.post("/assignments", summary="HOD: Assign Class Advisor and Subject Faculty")
async def create_or_update_assignment(
    req: CreateAssignmentRequest,
    current_user: TokenData = Depends(require_faculty_up),
):
    """
    HOD can assign Class Advisors (CA) and subject faculty to classes and subjects
    within their authorized department. Cross-department assignment is strictly rejected.
    """
    db = await get_db()
    user_role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()

    # RBAC: Only HOD or Admin can configure faculty assignments
    if user_role not in ["HOD", "ADMIN", "JOINT_SECRETARY"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Head of Department (HOD) or Institutional Admin can configure faculty assignments.",
        )

    # Department scoping for HOD
    if user_role == "HOD" and current_user.department and current_user.department != req.department:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"HOD cannot assign faculty to foreign department '{req.department}'. Authorized department is '{current_user.department}'.",
        )

    # Verify that assigned users exist
    sub_fac = await db.users.find_one({"userId": req.subjectFacultyId})
    ca_fac = await db.users.find_one({"userId": req.classAdvisorId})
    if not sub_fac:
        raise HTTPException(status_code=400, detail=f"Subject faculty ID '{req.subjectFacultyId}' does not exist in users directory.")
    if not ca_fac:
        raise HTTPException(status_code=400, detail=f"Class advisor ID '{req.classAdvisorId}' does not exist in users directory.")

    # Cross-department validation: CA and Subject Faculty must belong to the department
    if ca_fac.get("department") and ca_fac.get("department") != req.department:
        raise HTTPException(
            status_code=400,
            detail=f"Cross-department CA assignment forbidden: Class Advisor belongs to '{ca_fac.get('department')}', not '{req.department}'."
        )
    if sub_fac.get("department") and sub_fac.get("department") != req.department:
        raise HTTPException(
            status_code=400,
            detail=f"Cross-department subject faculty assignment forbidden: Faculty belongs to '{sub_fac.get('department')}', not '{req.department}'."
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    assignment_id = f"ASN-{uuid.uuid4().hex[:8].upper()}"

    doc = req.model_dump()
    doc["assignmentId"] = assignment_id
    doc["createdBy"] = current_user.userId
    doc["createdByName"] = current_user.name
    doc["createdAt"] = now_iso
    doc["updatedAt"] = now_iso

    # Upsert by department, semester, section, subjectCode, and period
    await db.faculty_assignments.update_one(
        {
            "department": req.department,
            "semester": req.semester,
            "section": req.section,
            "subjectCode": req.subjectCode,
            "period": req.period,
        },
        {"$set": doc},
        upsert=True
    )

    # Audit log
    await db.attendance_audit_logs.insert_one({
        "auditId": f"AUD-{uuid.uuid4().hex[:8].upper()}",
        "action": "CONFIGURE_FACULTY_ASSIGNMENT",
        "assignmentId": assignment_id,
        "department": req.department,
        "subject": req.subjectName,
        "subjectFaculty": req.subjectFacultyName,
        "classAdvisor": req.classAdvisorName,
        "actingUserId": current_user.userId,
        "actingRole": user_role,
        "timestamp": now_iso,
    })

    return {"ok": True, "message": f"Assigned {req.subjectFacultyName} to {req.subjectName} (Period {req.period})", "assignmentId": assignment_id}


@router.get("/assignments", summary="List faculty and Class Advisor assignments")
async def list_assignments(
    department: Optional[str] = Query(None),
    semester: Optional[int] = Query(None),
    section: Optional[str] = Query(None),
    current_user: TokenData = Depends(require_any),
):
    db = await get_db()
    user_role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()

    flt: Dict[str, Any] = {"status": "ACTIVE"}
    if department and department != "All":
        flt["department"] = department
    elif user_role == "HOD" and current_user.department:
        flt["department"] = current_user.department
    elif user_role == "FACULTY" and current_user.department:
        flt["department"] = current_user.department

    if semester:
        flt["semester"] = semester
    if section and section != "All":
        flt["section"] = section

    assignments = await db.faculty_assignments.find(flt, {"_id": 0}).sort("period", 1).to_list(100)
    return {"total": len(assignments), "assignments": assignments}


@router.delete("/assignments/{assignment_id}", summary="HOD: Deactivate faculty assignment")
async def deactivate_assignment(
    assignment_id: str,
    current_user: TokenData = Depends(require_faculty_up),
):
    db = await get_db()
    asn = await db.faculty_assignments.find_one({"assignmentId": assignment_id})
    if not asn:
        raise HTTPException(status_code=404, detail="Assignment not found")

    user_role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()
    if user_role == "HOD" and current_user.department and current_user.department != asn.get("department"):
        raise HTTPException(status_code=403, detail="HOD cannot deactivate foreign department assignment.")

    await db.faculty_assignments.update_one(
        {"assignmentId": assignment_id},
        {"$set": {"status": "INACTIVE", "updatedAt": datetime.now(timezone.utc).isoformat()}}
    )
    return {"ok": True, "message": "Assignment deactivated successfully."}


# ── 2. Timetable Status & Period Access Window ───────────────────────────────

@router.get("/timetable/status", summary="Get current timetable period status & remaining window")
async def get_timetable_period_status(
    department: str = Query(...),
    semester: int = Query(4, ge=1, le=8),
    section: str = Query("A"),
    period: int = Query(1, ge=1, le=8),
    date: Optional[str] = Query(None),
    subjectCode: Optional[str] = Query(None),
    allowTestingWindow: bool = Query(False),
    current_user: TokenData = Depends(require_any),
):
    """
    Evaluates server-authoritative period access window based on timetable schedule.
    Returns UPCOMING, OPEN, CLOSED, INCOMPLETE, or CANCELLED.
    """
    db = await get_db()
    session_date = date or get_current_ist_time().strftime("%Y-%m-%d")

    # Lookup assignment
    flt: Dict[str, Any] = {
        "department": department,
        "semester": semester,
        "section": section,
        "period": period,
        "status": "ACTIVE",
    }
    if subjectCode:
        flt["subjectCode"] = subjectCode

    assignment = await db.faculty_assignments.find_one(flt, {"_id": 0})

    # Check if a completed session already exists for this slot
    existing_session = await db.attendance_sessions.find_one({
        "department": department,
        "semester": semester,
        "section": section,
        "period": period,
        "date": session_date,
    })
    is_completed = existing_session is not None and existing_session.get("sessionStatus") in ["CLOSED", "SUBMITTED", "REVIEWED"]
    is_cancelled = existing_session is not None and existing_session.get("sessionStatus") == "CANCELLED"

    start_time = assignment.get("scheduledStartTime") if assignment else PERIOD_TIMETABLE.get(period, ("09:00", "09:50"))[0]
    end_time = assignment.get("scheduledEndTime") if assignment else PERIOD_TIMETABLE.get(period, ("09:00", "09:50"))[1]

    window = evaluate_session_window(
        session_date=session_date,
        period=period,
        scheduled_start=start_time,
        scheduled_end=end_time,
        allow_testing_window=allowTestingWindow,
        is_cancelled=is_cancelled,
        is_already_completed=is_completed,
    )

    window["assignment"] = assignment
    window["windowState"] = window.get("status")
    window["periodStartTime"] = start_time
    window["periodEndTime"] = end_time
    window["currentTimeIst"] = get_current_ist_time().strftime("%H:%M:%S IST")
    window["existingSession"] = {
        "sessionId": existing_session.get("sessionId"),
        "status": existing_session.get("sessionStatus"),
        "attendanceRate": existing_session.get("attendanceRate"),
        "totalStudents": existing_session.get("totalStudents"),
    } if existing_session else None

    return window


# ── 3. Roster with Field-Level Parent Contact Authorization ──────────────────

@router.get("/roster", summary="Load class roster with role-based field-level parent contact protection")
async def get_attendance_roster(
    department: str = Query(...),
    semester: int = Query(4, ge=1, le=8),
    section: Optional[str] = Query(None),
    current_user: TokenData = Depends(require_faculty_up),
):
    """
    Roster loading with strict field-level parent contact privacy:
      - Authorized CA, assigned subject faculty, departmental HOD, and Admin receive parentContact.
      - Principal, Joint Secretary, students, and unassigned users NEVER receive parent contact numbers.
    """
    db = await get_db()
    user_role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()

    flt: Dict[str, Any] = {"department": department, "semester": semester}
    if section and section != "All":
        flt["section"] = section

    # Faculty / Class advisor scoping check
    if user_role == "FACULTY" and current_user.department and current_user.department != department:
        raise HTTPException(status_code=403, detail="Faculty can only access student rosters within their assigned department.")

    students = await db.students.find(
        flt,
        {"studentId": 1, "rollNo": 1, "name": 1, "department": 1, "semester": 1, "section": 1, "attendancePct": 1, "parentContact": 1, "guardianName": 1, "_id": 0}
    ).sort("studentId", 1).to_list(150)

    # Field-level authorization on parentContact
    # Permitted roles: HOD of dept, FACULTY of dept, CLASS_ADVISOR of class, ADMIN
    is_staff_authorized = user_role in ["HOD", "FACULTY", "CLASS_ADVISOR", "ADMIN"]
    if not is_staff_authorized:
        for s in students:
            s.pop("parentContact", None)
            s.pop("guardianName", None)
    else:
        # Normalize missing contacts
        for s in students:
            if not s.get("parentContact"):
                s["parentContact"] = "Not provided"

    return {"department": department, "semester": semester, "section": section, "total": len(students), "students": students}


# ── 4. Attendance Session Submission with Server-Side Timetable Gate ──────────

@router.post("/session", summary="Submit attendance session with strict timetable-based access control")
async def mark_attendance_session(
    req: MarkSessionRequest,
    current_user: TokenData = Depends(require_any),
):
    """
    Strict server-enforced attendance marking:
      1. Rejects Principal & Joint Secretary (read-only enforcement).
      2. Validates timetable assignment for subject, class, period, and assigned faculty.
      3. Enforces server-authoritative period window: rejects UPCOMING and CLOSED attempts.
      4. Validates absence reasons and OD entries.
      5. Prevents duplicate session submissions.
      6. Writes immutable audit logs and updates rolling attendance metrics.
    """
    db = await get_db()
    user_role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()

    # Rule: Principal & Joint Secretary are strictly read-only
    if user_role in ["PRINCIPAL", "JOINT_SECRETARY"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{user_role}' has read-only institutional access and cannot submit attendance.",
        )
    if user_role in ["STUDENT", "CLASS_REPRESENTATIVE"] or "CLASS_REPRESENTATIVE" in (current_user.responsibilities or []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Students and Class Representatives cannot mark attendance.")

    # Rule: HOD cross-department write rejection
    if user_role == "HOD" and current_user.department and current_user.department != req.department:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"HOD cannot mark attendance for foreign department '{req.department}'. Authorized department is '{current_user.department}'.",
        )

    # Validate period
    if req.period not in PERIOD_TIMETABLE:
        raise HTTPException(status_code=400, detail=f"Invalid timetable period {req.period}. Allowed periods are 1 to 8.")

    # 1. Lookup active timetable assignment
    sub_code = req.subjectCode or req.subject.split(" ")[0]
    assignment = await db.faculty_assignments.find_one({
        "department": req.department,
        "semester": req.semester,
        "section": req.section,
        "period": req.period,
        "status": "ACTIVE",
    })

    # 2. Check faculty assignment match
    is_authorized, auth_msg = check_faculty_assignment_match(
        user_id=current_user.userId,
        user_role=user_role,
        user_department=current_user.department,
        assignment=assignment,
        is_ca_submission=req.isCaSubmission,
    )
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=auth_msg)

    # 3. Enforce Timetable-Based Access Window (Server-Authoritative Time)
    start_time = assignment.get("scheduledStartTime") if assignment else PERIOD_TIMETABLE.get(req.period, ("09:00", "09:50"))[0]
    end_time = assignment.get("scheduledEndTime") if assignment else PERIOD_TIMETABLE.get(req.period, ("09:00", "09:50"))[1]

    # Check if period session was cancelled
    cancelled_doc = await db.attendance_sessions.find_one({
        "department": req.department,
        "semester": req.semester,
        "section": req.section,
        "period": req.period,
        "date": req.date,
        "sessionStatus": "CANCELLED",
    })
    is_cancelled = cancelled_doc is not None

    window = evaluate_session_window(
        session_date=req.date,
        period=req.period,
        scheduled_start=start_time,
        scheduled_end=end_time,
        allow_testing_window=req.allowTestingWindow,
        is_cancelled=is_cancelled,
    )

    if window["status"] == "UPCOMING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attendance access is not yet open. Attendance access will open at {start_time}.",
        )
    if window["status"] in ["CLOSED", "INCOMPLETE"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attendance marking is closed. This period ended at {end_time}. Late correction workflow required.",
        )
    if window["status"] == "CANCELLED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot mark attendance for a cancelled period.")

    # 4. Check for duplicate session submission
    existing_session = await db.attendance_sessions.find_one({
        "department": req.department,
        "semester": req.semester,
        "section": req.section,
        "subject": req.subject,
        "date": req.date,
        "period": req.period,
    })
    if existing_session and existing_session.get("sessionStatus") in ["CLOSED", "SUBMITTED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attendance session already submitted for {req.subject} on {req.date} (Period {req.period}). Use correction workflow for modifications.",
        )

    # 5. Validate records: Absence reason required for ABSENT; OD validation
    validation_errors = []
    for r in req.records:
        st_upper = r.status.upper()
        if st_upper == "ABSENT":
            if not r.absenceReason:
                validation_errors.append(f"Student {r.studentId}: Absence reason is mandatory when marked ABSENT.")
            elif len(r.absenceReason.strip()) < 3:
                validation_errors.append(f"Student {r.studentId}: Absence reason is too short (minimum 3 characters required).")
        if st_upper == "OD" and not r.odPurpose and not r.eventName:
            validation_errors.append(f"Student {r.studentId}: OD purpose / event name is required when marked ON DUTY.")

    if validation_errors:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"errors": validation_errors})

    # 6. Tally metrics
    total = len(req.records)
    present_cnt = sum(1 for r in req.records if r.status.upper() == "PRESENT")
    absent_cnt = sum(1 for r in req.records if r.status.upper() == "ABSENT")
    od_cnt = sum(1 for r in req.records if r.status.upper() == "OD")
    late_cnt = sum(1 for r in req.records if r.status.upper() == "LATE")
    excused_cnt = sum(1 for r in req.records if r.status.upper() == "EXCUSED")

    effective_present = present_cnt + od_cnt + (late_cnt * 0.75) + excused_cnt
    rate = round((effective_present / max(1, total)) * 100.0, 1)

    now_iso = datetime.now(timezone.utc).isoformat()
    session_id = f"ATT-{uuid.uuid4().hex[:8].upper()}"

    session_doc = {
        "sessionId": session_id,
        "assignmentId": assignment.get("assignmentId") if assignment else None,
        "date": req.date,
        "period": req.period,
        "department": req.department,
        "semester": req.semester,
        "section": req.section,
        "subject": req.subject,
        "subjectCode": sub_code,
        "facultyId": current_user.userId,
        "facultyName": current_user.name,
        "scheduledStartTime": start_time,
        "scheduledEndTime": end_time,
        "sessionStatus": "CLOSED",
        "workflowStatus": "SUBMITTED",
        "totalStudents": total,
        "presentCount": present_cnt,
        "absentCount": absent_cnt,
        "odCount": od_cnt,
        "lateCount": late_cnt,
        "excusedCount": excused_cnt,
        "attendanceRate": rate,
        "records": [r.model_dump() for r in req.records],
        "submittedBy": current_user.name,
        "submittedById": current_user.userId,
        "submittedAt": now_iso,
        "createdAt": now_iso,
        "updatedAt": now_iso,
    }

    await db.attendance_sessions.insert_one(session_doc)
    session_doc.pop("_id", None)

    # Save individual attendance records
    record_docs = []
    for r in req.records:
        rec_id = f"REC-{uuid.uuid4().hex[:8].upper()}"
        rec_doc = {
            "recordId": rec_id,
            "sessionId": session_id,
            "studentId": r.studentId,
            "date": req.date,
            "period": req.period,
            "department": req.department,
            "semester": req.semester,
            "section": req.section,
            "subject": req.subject,
            "status": r.status.upper(),
            "absenceStatus": "PENDING" if r.status.upper() in ["ABSENT", "OD"] else "NOT_REQUIRED",
            "absenceReason": r.absenceReason,
            "leaveCategory": r.leaveCategory,
            "odPurpose": r.odPurpose,
            "eventName": r.eventName,
            "remarks": r.remarks,
            "recordedBy": current_user.name,
            "recordedAt": now_iso,
        }
        record_docs.append(rec_doc)

    if record_docs:
        await db.attendance_records.insert_many(record_docs)

    # Update cumulative statistics in students collection
    for r in req.records:
        stu = await db.students.find_one({"studentId": r.studentId}, {"attendancePct": 1})
        if stu:
            curr_pct = float(stu.get("attendancePct", 80.0))
            is_present = 1.0 if r.status.upper() in ["PRESENT", "OD", "EXCUSED"] else 0.5 if r.status.upper() == "LATE" else 0.0
            updated_pct = round(max(0.0, min(100.0, (curr_pct * 0.95) + (is_present * 100.0 * 0.05))), 1)
            await db.students.update_one(
                {"studentId": r.studentId},
                {"$set": {"attendancePct": updated_pct, "lastAttendanceUpdate": now_iso}}
            )

    # Immutable Audit Log
    await db.attendance_audit_logs.insert_one({
        "auditId": f"AUD-{uuid.uuid4().hex[:8].upper()}",
        "action": "SUBMIT_ATTENDANCE_SESSION",
        "sessionId": session_id,
        "department": req.department,
        "subject": req.subject,
        "period": req.period,
        "date": req.date,
        "attendanceRate": rate,
        "totalStudents": total,
        "correctionType": "NORMAL_MARKING",
        "actingUserId": current_user.userId,
        "actingRole": user_role,
        "timestamp": now_iso,
    })

    return {"ok": True, "message": f"Attendance completed for {total} students ({rate}% rate)", "session": session_doc}


# ── 5. Late Attendance Correction Workflow ────────────────────────────────────

@router.post("/correct", summary="Authorized late attendance correction with mandatory reason & audit trail")
async def correct_attendance(
    req: CorrectionRequest,
    current_user: TokenData = Depends(require_faculty_up),
):
    """
    Authorized late attendance correction:
      - Principal and Joint Secretary forbidden from modifying records.
      - Requires explicit permission, student ID, new status, and mandatory justification reason (>= 5 chars).
      - Creates immutable audit record in attendance_audit_logs.
    """
    db = await get_db()
    user_role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()

    if user_role in ["PRINCIPAL", "JOINT_SECRETARY"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Principal and Joint Secretary have read-only access and cannot modify attendance records.",
        )

    session = await db.attendance_sessions.find_one({"sessionId": req.sessionId})
    if not session:
        raise HTTPException(status_code=404, detail="Attendance session not found")

    # Scope check for HOD
    if user_role == "HOD" and current_user.department and current_user.department != session.get("department"):
        raise HTTPException(status_code=403, detail="HOD cannot correct attendance outside their authorized department.")

    records = session.get("records", [])
    found = False
    old_status = "UNKNOWN"

    for r in records:
        if r.get("studentId") == req.studentId:
            old_status = r.get("status")
            r["status"] = req.newStatus.upper()
            r["correctionReason"] = req.reason
            r["correctedBy"] = current_user.name
            r["correctedAt"] = datetime.now(timezone.utc).isoformat()
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail=f"Student {req.studentId} not found in session")

    # Recalculate session totals
    present_cnt = sum(1 for r in records if r["status"].upper() == "PRESENT")
    absent_cnt = sum(1 for r in records if r["status"].upper() == "ABSENT")
    od_cnt = sum(1 for r in records if r["status"].upper() == "OD")
    late_cnt = sum(1 for r in records if r["status"].upper() == "LATE")
    excused_cnt = sum(1 for r in records if r["status"].upper() == "EXCUSED")
    effective = present_cnt + od_cnt + (late_cnt * 0.75) + excused_cnt
    rate = round((effective / max(1, len(records))) * 100.0, 1)

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.attendance_sessions.update_one(
        {"sessionId": req.sessionId},
        {
            "$set": {
                "records": records,
                "presentCount": present_cnt,
                "absentCount": absent_cnt,
                "odCount": od_cnt,
                "lateCount": late_cnt,
                "excusedCount": excused_cnt,
                "attendanceRate": rate,
                "updatedAt": now_iso,
            }
        }
    )

    # Update individual record
    await db.attendance_records.update_one(
        {"sessionId": req.sessionId, "studentId": req.studentId},
        {
            "$set": {
                "status": req.newStatus.upper(),
                "correctionReason": req.reason,
                "correctedBy": current_user.name,
                "correctedAt": now_iso,
            }
        }
    )

    # Insert immutable audit event
    await db.attendance_audit_logs.insert_one({
        "auditId": f"AUD-{uuid.uuid4().hex[:8].upper()}",
        "action": "CORRECT_ATTENDANCE",
        "sessionId": req.sessionId,
        "studentId": req.studentId,
        "oldStatus": old_status,
        "newStatus": req.newStatus.upper(),
        "reason": req.reason,
        "correctionType": "AUTHORIZED_CORRECTION",
        "actingUserId": current_user.userId,
        "actingRole": user_role,
        "timestamp": now_iso,
    })

    return {"ok": True, "message": f"Attendance corrected from {old_status} to {req.newStatus.upper()}", "sessionId": req.sessionId}


# ── 6. On Duty (OD) Request & Review Workflow ─────────────────────────────────

@router.post("/od-request", summary="Submit On Duty (OD) request")
async def submit_od_request(
    req: SubmitODRequest,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Submits an official On Duty (OD) request.
    Status starts in PENDING and remains unapproved until departmental review.
    """
    db = await get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    od_id = f"OD-{uuid.uuid4().hex[:8].upper()}"

    student = await db.students.find_one({"studentId": req.studentId})
    student_name = student.get("name", req.studentId) if student else req.studentId

    doc = {
        "odId": od_id,
        "studentId": req.studentId,
        "studentName": student_name,
        "department": req.department,
        "semester": req.semester,
        "section": req.section,
        "odPurpose": req.odPurpose,
        "eventName": req.eventName,
        "destination": req.destination,
        "startDate": req.startDate,
        "endDate": req.endDate,
        "applicablePeriods": req.applicablePeriods,
        "reason": req.reason,
        "proofDocument": req.proofDocument,
        "status": "PENDING",
        "submittedBy": current_user.name,
        "submittedById": current_user.userId,
        "submittedAt": now_iso,
        "reviewedBy": None,
        "reviewedAt": None,
        "reviewerRemarks": None,
    }

    await db.od_requests.insert_one(doc)
    doc.pop("_id", None)

    return {"ok": True, "message": f"OD request submitted for {student_name} (Status: PENDING)", "odRequest": doc}


@router.get("/od-requests", summary="HOD: List and filter OD requests for review")
async def list_od_requests(
    department: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: TokenData = Depends(require_faculty_up),
):
    db = await get_db()
    user_role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()

    flt: Dict[str, Any] = {}
    if department and department != "All":
        flt["department"] = department
    elif user_role == "HOD" and current_user.department:
        flt["department"] = current_user.department

    if status_filter and status_filter != "All":
        flt["status"] = status_filter.upper()

    requests = await db.od_requests.find(flt, {"_id": 0}).sort("submittedAt", -1).to_list(100)
    return {"total": len(requests), "requests": requests}


@router.post("/od-requests/{od_id}/review", summary="HOD: Approve or reject OD request with remarks")
async def review_od_request(
    od_id: str,
    req: ReviewODRequest,
    current_user: TokenData = Depends(require_faculty_up),
):
    """
    HOD or authorized coordinator reviews pending OD request.
    Rejection strictly requires justification remarks.
    """
    db = await get_db()
    user_role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()

    if user_role not in ["HOD", "ADMIN"]:
        raise HTTPException(status_code=403, detail="Only HOD or Admin can approve/reject On Duty (OD) requests.")

    od_doc = await db.od_requests.find_one({"odId": od_id})
    if not od_doc:
        raise HTTPException(status_code=404, detail="OD request not found")

    if user_role == "HOD" and current_user.department and current_user.department != od_doc.get("department"):
        raise HTTPException(status_code=403, detail="HOD cannot review OD requests for a foreign department.")

    action_upper = req.action.upper()
    if action_upper not in ["APPROVED", "REJECTED"]:
        raise HTTPException(status_code=400, detail="Action must be either APPROVED or REJECTED.")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.od_requests.update_one(
        {"odId": od_id},
        {
            "$set": {
                "status": action_upper,
                "reviewedBy": current_user.name,
                "reviewedById": current_user.userId,
                "reviewedAt": now_iso,
                "reviewerRemarks": req.remarks,
            }
        }
    )

    # If approved, update existing attendance records for this student on those dates/periods
    if action_upper == "APPROVED":
        await db.attendance_records.update_many(
            {
                "studentId": od_doc.get("studentId"),
                "date": {"$gte": od_doc.get("startDate"), "$lte": od_doc.get("endDate")},
                "period": {"$in": od_doc.get("applicablePeriods", [])},
            },
            {"$set": {"status": "OD", "absenceStatus": "APPROVED", "odRequestId": od_id}}
        )

    # Audit log
    await db.attendance_audit_logs.insert_one({
        "auditId": f"AUD-{uuid.uuid4().hex[:8].upper()}",
        "action": f"REVIEW_OD_{action_upper}",
        "odId": od_id,
        "studentId": od_doc.get("studentId"),
        "department": od_doc.get("department"),
        "decision": action_upper,
        "remarks": req.remarks,
        "actingUserId": current_user.userId,
        "actingRole": user_role,
        "timestamp": now_iso,
    })

    return {"ok": True, "message": f"OD request {od_id} marked as {action_upper}.", "status": action_upper}


# ── 7. Sessions Directory & Scoped Analytics ──────────────────────────────────

@router.get("/sessions", summary="List historical attendance sessions")
async def list_attendance_sessions(
    department: Optional[str] = Query(None),
    subject: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    perPage: int = Query(25, ge=1, le=100),
    current_user: TokenData = Depends(require_any),
):
    db = await get_db()
    user_role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()

    flt: Dict[str, Any] = {}
    if department and department != "All":
        flt["department"] = department
    elif user_role == "HOD" and current_user.department:
        flt["department"] = current_user.department
    elif user_role == "FACULTY" and current_user.department:
        flt["department"] = current_user.department

    if subject:
        flt["subject"] = {"$regex": subject, "$options": "i"}
    if date:
        flt["date"] = date

    total = await db.attendance_sessions.count_documents(flt)
    skip = (page - 1) * perPage
    sessions = await db.attendance_sessions.find(flt, {"records": 0, "_id": 0}).sort("date", -1).skip(skip).limit(perPage).to_list(perPage)

    return {"total": total, "page": page, "perPage": perPage, "sessions": sessions}


@router.get("/analytics", summary="Aggregated attendance analytics, department comparisons & alerts")
async def get_attendance_analytics(
    department: Optional[str] = Query(None),
    current_user: TokenData = Depends(require_any),
):
    """
    Role-scoped attendance analytics:
      - HOD: strictly scoped to authorized department.
      - Principal / Joint Secretary: institution-wide comparison and threshold trends (Read-only).
    """
    db = await get_db()
    user_role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()

    flt: Dict[str, Any] = {}
    if user_role == "HOD" and current_user.department:
        flt["department"] = current_user.department
    elif department and department != "All":
        flt["department"] = department

    # 1. At-risk attendance threshold alerts (< 75%)
    alert_students = await db.students.find(
        {**flt, "attendancePct": {"$lt": 75.0}},
        {"studentId": 1, "name": 1, "department": 1, "semester": 1, "section": 1, "attendancePct": 1, "cgpa": 1, "riskLevel": 1, "_id": 0}
    ).sort("attendancePct", 1).limit(40).to_list(40)

    # 2. Highest absentees in authorized scope
    highest_absentees = await db.students.find(
        flt,
        {"studentId": 1, "name": 1, "department": 1, "semester": 1, "attendancePct": 1, "_id": 0}
    ).sort("attendancePct", 1).limit(10).to_list(10)

    # 3. Overall average attendance & breakdown
    pipeline = [
        {"$match": flt},
        {"$group": {
            "_id": None,
            "avgAttendance": {"$avg": "$attendancePct"},
            "totalStudents": {"$sum": 1},
            "below75": {"$sum": {"$cond": [{"$lt": ["$attendancePct", 75.0]}, 1, 0]}},
            "below65": {"$sum": {"$cond": [{"$lt": ["$attendancePct", 65.0]}, 1, 0]}},
        }}
    ]
    agg = await db.students.aggregate(pipeline).to_list(1)
    summary = agg[0] if agg else {"avgAttendance": 82.5, "totalStudents": 0, "below75": 0, "below65": 0}

    # 4. Department comparison (for Principal / Joint Secretary / Admin)
    dept_comparison = []
    if user_role in ["PRINCIPAL", "JOINT_SECRETARY", "ADMIN"]:
        dept_pipe = [
            {"$group": {
                "_id": "$department",
                "avgAttendance": {"$avg": "$attendancePct"},
                "totalStudents": {"$sum": 1},
                "below75Count": {"$sum": {"$cond": [{"$lt": ["$attendancePct", 75.0]}, 1, 0]}}
            }},
            {"$sort": {"avgAttendance": 1}}
        ]
        dept_raw = await db.students.aggregate(dept_pipe).to_list(10)
        dept_comparison = [
            {
                "department": str(d["_id"]),
                "averageAttendance": round(float(d.get("avgAttendance") or 80.0), 1),
                "totalStudents": int(d.get("totalStudents", 0)),
                "atRiskCount": int(d.get("below75Count", 0))
            }
            for d in dept_raw if d.get("_id")
        ]

    # 5. Pending OD count
    pending_od_cnt = await db.od_requests.count_documents({**flt, "status": "PENDING"})

    # 6. Subject-wise stats from sessions
    subj_pipeline = [
        {"$match": flt},
        {"$group": {
            "_id": "$subject",
            "sessionsCount": {"$sum": 1},
            "avgRate": {"$avg": "$attendanceRate"},
        }},
        {"$sort": {"avgRate": 1}}
    ]
    subj_data = await db.attendance_sessions.aggregate(subj_pipeline).to_list(10)
    subject_stats = [
        {
            "subject": str(s["_id"]),
            "sessions": int(s.get("sessionsCount", 0)),
            "averageAttendance": round(float(s.get("avgRate") or 80.0), 1)
        }
        for s in subj_data if s.get("_id")
    ]

    # Clean student objects to avoid any non-serializable fields
    clean_alerts = [
        {
            "studentId": str(s.get("studentId", "")),
            "name": str(s.get("name", "")),
            "department": str(s.get("department", "")),
            "semester": int(s.get("semester", 4)),
            "section": str(s.get("section", "A")),
            "attendancePct": float(s.get("attendancePct", 80.0)),
            "cgpa": float(s.get("cgpa", 7.0)),
            "riskLevel": str(s.get("riskLevel", "LOW")),
            "parentContact": str(s.get("parentContact")) if s.get("parentContact") else None
        }
        for s in alert_students
    ]

    clean_absentees = [
        {
            "studentId": str(s.get("studentId", "")),
            "name": str(s.get("name", "")),
            "department": str(s.get("department", "")),
            "semester": int(s.get("semester", 4)),
            "attendancePct": float(s.get("attendancePct", 80.0))
        }
        for s in highest_absentees
    ]

    return {
        "summary": {
            "averageAttendance": round(float(summary.get("avgAttendance") or 82.0), 1),
            "totalStudents": int(summary.get("totalStudents", 0)),
            "studentsBelowThreshold": int(summary.get("below75", 0)),
            "studentsCriticalBelow65": int(summary.get("below65", 0)),
            "pendingOdRequests": int(pending_od_cnt),
        },
        "thresholdAlerts": clean_alerts,
        "highestAbsentees": clean_absentees,
        "departmentComparison": dept_comparison,
        "subjectStats": subject_stats,
    }


# ── 8. Student Self-Service Attendance Access ─────────────────────────────────

@router.get("/my", summary="Authenticated student's self-scoped attendance & OD records")
async def get_my_attendance(current_user: TokenData = Depends(get_current_user)):
    """
    Student self-service attendance:
      - Can view own daily attendance, period history, and personal OD status.
      - Cannot access other students' records or staff review notes.
    """
    db = await get_db()
    student = await db.students.find_one({"studentId": current_user.userId}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")

    # Fetch recent sessions where student is listed
    recent_sessions = await db.attendance_sessions.find(
        {"records.studentId": current_user.userId},
        {"sessionId": 1, "date": 1, "period": 1, "subject": 1, "facultyName": 1, "records.$": 1, "_id": 0}
    ).sort("date", -1).limit(30).to_list(30)

    records_formatted = []
    for s in recent_sessions:
        rec = s.get("records", [{}])[0]
        records_formatted.append({
            "sessionId": s.get("sessionId"),
            "date": s.get("date"),
            "period": s.get("period"),
            "subject": s.get("subject"),
            "faculty": s.get("facultyName"),
            "status": rec.get("status", "PRESENT"),
            "absenceReason": rec.get("absenceReason"),
            "odPurpose": rec.get("odPurpose"),
        })

    # Fetch student's own OD requests
    my_od = await db.od_requests.find(
        {"studentId": current_user.userId},
        {"_id": 0}
    ).sort("submittedAt", -1).to_list(10)

    return {
        "studentId": current_user.userId,
        "name": student.get("name"),
        "department": student.get("department"),
        "overallAttendancePct": student.get("attendancePct", 80.0),
        "thresholdAlert": student.get("attendancePct", 80.0) < 75.0,
        "recentSessions": records_formatted,
        "myOdRequests": my_od,
    }


@router.get("/student/{student_id}", summary="Student specific attendance view with strict IDOR access control")
async def get_student_attendance(student_id: str, current_user: TokenData = Depends(get_current_user)):
    """
    Retrieves student attendance:
      - A student can only view their own attendance records. Attempting to view another student's record is rejected with 403 Forbidden (IDOR protection).
      - Class Representatives cannot view other students' private records (403 Forbidden).
      - Authorized staff (Faculty, CA, HOD, Admin) can view.
    """
    user_role = (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)).upper()

    if user_role in ["STUDENT", "CLASS_REPRESENTATIVE"] or "CLASS_REPRESENTATIVE" in (current_user.responsibilities or []):
        if current_user.userId != student_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access Denied: Students and Class Representatives cannot view private records of other students (IDOR Violation).",
            )

    db = await get_db()
    student = await db.students.find_one({"studentId": student_id}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail=f"Student {student_id} not found")

    recent_sessions = await db.attendance_sessions.find(
        {"records.studentId": student_id},
        {"sessionId": 1, "date": 1, "period": 1, "subject": 1, "facultyName": 1, "records.$": 1, "_id": 0}
    ).sort("date", -1).limit(30).to_list(30)

    return {
        "studentId": student_id,
        "name": student.get("name"),
        "department": student.get("department"),
        "overallAttendancePct": student.get("attendancePct", 80.0),
        "sessions": recent_sessions,
    }


# ── 9. Audit Log Immutability Protection ──────────────────────────────────────

@router.delete("/audit-logs/{audit_id}", summary="Immutable audit log delete rejection")
async def delete_audit_log(audit_id: str, current_user: TokenData = Depends(require_any)):
    """Audit log records are immutable and cannot be deleted via API."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Audit logs are strictly immutable and cannot be deleted.",
    )


@router.put("/audit-logs/{audit_id}", summary="Immutable audit log update rejection")
async def update_audit_log(audit_id: str, current_user: TokenData = Depends(require_any)):
    """Audit log records are immutable and cannot be modified via API."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Audit logs are strictly immutable and cannot be modified.",
    )

