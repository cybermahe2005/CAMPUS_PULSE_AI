"""
Exports & Report Generation API — Formula injection safe CSV generation.
Routes mounted at /api/exports
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from typing import Optional, Dict, Any
import io
import csv
from datetime import datetime, timezone

from app.core.security import get_current_user, require_faculty_up, require_any
from app.schemas.auth import TokenData, UserRole
from app.core.database import get_db

router = APIRouter()


def sanitize_cell(value: Any) -> str:
    """
    Sanitize CSV field to prevent Spreadsheet Formula Injection (CSV Injection).
    Disables leading '=', '+', '-', '@', tab, or carriage return characters.
    """
    if value is None:
        return ""
    s = str(value).strip()
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{s}"
    return s


@router.get("/students", summary="Export filtered student roster as CSV")
async def export_students_csv(
    department: Optional[str] = Query(None),
    riskLevel: Optional[str] = Query(None),
    current_user: TokenData = Depends(require_faculty_up),
):
    db = await get_db()
    flt: Dict[str, Any] = {}
    if department and department != "All":
        flt["department"] = department
    elif current_user.role == UserRole.HOD and current_user.department:
        flt["department"] = current_user.department

    if riskLevel and riskLevel != "All":
        flt["riskLevel"] = riskLevel

    students = await db.students.find(flt, {
        "studentId": 1, "name": 1, "email": 1, "department": 1, "semester": 1,
        "cgpa": 1, "attendancePct": 1, "currentArrears": 1, "successIndex": 1,
        "riskLevel": 1, "placementReadiness": 1, "_id": 0
    }).sort("studentId", 1).to_list(1000)

    output = io.StringIO()
    writer = csv.writer(output)

    headers = [
        "Student ID", "Full Name", "Email", "Department", "Semester",
        "CGPA", "Attendance %", "Current Backlogs", "Success Index (SSI)",
        "Risk Category", "Placement Readiness %"
    ]
    writer.writerow(headers)

    for s in students:
        writer.writerow([
            sanitize_cell(s.get("studentId")),
            sanitize_cell(s.get("name")),
            sanitize_cell(s.get("email")),
            sanitize_cell(s.get("department")),
            sanitize_cell(s.get("semester")),
            sanitize_cell(s.get("cgpa")),
            sanitize_cell(s.get("attendancePct")),
            sanitize_cell(s.get("currentArrears", 0)),
            sanitize_cell(s.get("successIndex")),
            sanitize_cell(s.get("riskLevel")),
            sanitize_cell(s.get("placementReadiness")),
        ])

    filename = f"campus_pulse_students_{datetime.now().strftime('%Y%m%d')}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/attendance", summary="Export attendance sessions report as CSV")
async def export_attendance_csv(
    department: Optional[str] = Query(None),
    current_user: TokenData = Depends(require_faculty_up),
):
    db = await get_db()
    flt: Dict[str, Any] = {}
    if department and department != "All":
        flt["department"] = department

    sessions = await db.attendance_sessions.find(flt, {"_id": 0}).sort("date", -1).limit(500).to_list(500)

    output = io.StringIO()
    writer = csv.writer(output)

    headers = ["Session ID", "Date", "Period", "Subject", "Department", "Semester", "Section", "Faculty", "Total", "Present", "Absent", "Attendance Rate %"]
    writer.writerow(headers)

    for s in sessions:
        writer.writerow([
            sanitize_cell(s.get("sessionId")),
            sanitize_cell(s.get("date")),
            sanitize_cell(s.get("period")),
            sanitize_cell(s.get("subject")),
            sanitize_cell(s.get("department")),
            sanitize_cell(s.get("semester")),
            sanitize_cell(s.get("section")),
            sanitize_cell(s.get("facultyName")),
            sanitize_cell(s.get("totalStudents")),
            sanitize_cell(s.get("presentCount")),
            sanitize_cell(s.get("absentCount")),
            sanitize_cell(s.get("attendanceRate")),
        ])

    filename = f"campus_pulse_attendance_{datetime.now().strftime('%Y%m%d')}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
