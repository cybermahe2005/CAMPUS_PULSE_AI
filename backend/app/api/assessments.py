"""
Real Exam, Internal Marks, and Assignment Management API.
Routes mounted at /api/assessments
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import uuid
import csv
import io

from app.core.security import get_current_user, require_faculty_up, require_any
from app.schemas.auth import TokenData, UserRole
from app.core.database import get_db

router = APIRouter()


class CreateExamRequest(BaseModel):
    examName: str = Field(..., description="e.g. Mid-Term Assessment 1")
    examType: str = Field(default="INTERNAL_ASSESSMENT_1", description="MID_TERM, INTERNAL_ASSESSMENT_1, INTERNAL_ASSESSMENT_2, END_SEMESTER, ASSIGNMENT")
    academicYear: str = Field(default="2026-2027")
    semester: int = Field(default=4, ge=1, le=8)
    department: str
    section: Optional[str] = "A"
    subject: str = Field(..., description="Subject code / Name e.g. CS401 - Data Structures")
    maxMarks: float = Field(default=100.0, gt=0.0)
    passingMarks: float = Field(default=40.0, ge=0.0)
    examDate: str = Field(..., description="YYYY-MM-DD")
    deadline: Optional[str] = None


class MarksEntryItem(BaseModel):
    studentId: str
    obtainedMarks: float = Field(..., ge=0.0)
    remarks: Optional[str] = None


class SubmitMarksRequest(BaseModel):
    examId: str
    marks: List[MarksEntryItem]


@router.post("/exam", summary="Create a new exam or assessment")
async def create_exam(
    req: CreateExamRequest,
    current_user: TokenData = Depends(require_faculty_up),
):
    db = await get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    exam_id = f"EXAM-{uuid.uuid4().hex[:8].upper()}"

    exam_doc = {
        "examId": exam_id,
        "examName": req.examName,
        "examType": req.examType,
        "academicYear": req.academicYear,
        "semester": req.semester,
        "department": req.department,
        "section": req.section or "All",
        "subject": req.subject,
        "maxMarks": req.maxMarks,
        "passingMarks": req.passingMarks,
        "examDate": req.examDate,
        "deadline": req.deadline,
        "status": "DRAFT",  # DRAFT -> PUBLISHED
        "isPublished": False,
        "createdBy": current_user.name,
        "createdById": current_user.userId,
        "createdAt": now_iso,
        "updatedAt": now_iso,
    }

    await db.exams.insert_one(exam_doc)
    exam_doc.pop("_id", None)

    # Audit log
    await db.audit_logs.insert_one({
        "action": "CREATE_EXAM",
        "examId": exam_id,
        "examName": req.examName,
        "subject": req.subject,
        "createdBy": current_user.name,
        "timestamp": now_iso,
    })

    return {"ok": True, "message": f"Exam '{req.examName}' created in DRAFT status", "exam": exam_doc}


@router.get("/exams", summary="List exams with role scoping")
async def list_exams(
    department: Optional[str] = Query(None),
    semester: Optional[int] = Query(None),
    subject: Optional[str] = Query(None),
    current_user: TokenData = Depends(require_any),
):
    db = await get_db()
    flt: Dict[str, Any] = {}
    if department and department != "All":
        flt["department"] = department
    elif current_user.role == UserRole.HOD and current_user.department:
        flt["department"] = current_user.department

    if semester:
        flt["semester"] = semester
    if subject:
        flt["subject"] = {"$regex": subject, "$options": "i"}

    # Students only see published exams
    if current_user.role == UserRole.STUDENT:
        flt["isPublished"] = True

    exams = await db.exams.find(flt, {"_id": 0}).sort("createdAt", -1).to_list(50)
    return {"total": len(exams), "exams": exams}


@router.post("/marks", summary="Submit or update marks for an exam with strict validation")
async def submit_marks(
    req: SubmitMarksRequest,
    current_user: TokenData = Depends(require_faculty_up),
):
    db = await get_db()
    exam = await db.exams.find_one({"examId": req.examId})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    max_marks = float(exam.get("maxMarks", 100.0))
    passing_marks = float(exam.get("passingMarks", 40.0))

    # Validate all marks
    validation_errors = []
    for m in req.marks:
        if m.obtainedMarks > max_marks:
            validation_errors.append(f"Student {m.studentId}: Obtained marks ({m.obtainedMarks}) cannot exceed maximum marks ({max_marks})")

    if validation_errors:
        raise HTTPException(status_code=400, detail={"errors": validation_errors})

    now_iso = datetime.now(timezone.utc).isoformat()
    inserted_or_updated = 0

    for m in req.marks:
        is_passed = m.obtainedMarks >= passing_marks
        pct = round((m.obtainedMarks / max_marks) * 100.0, 1)

        mark_doc = {
            "examId": req.examId,
            "studentId": m.studentId,
            "examName": exam.get("examName"),
            "subject": exam.get("subject"),
            "maxMarks": max_marks,
            "passingMarks": passing_marks,
            "obtainedMarks": m.obtainedMarks,
            "percentage": pct,
            "isPassed": is_passed,
            "remarks": m.remarks or "",
            "enteredBy": current_user.name,
            "enteredAt": now_iso,
        }

        await db.assessment_marks.update_one(
            {"examId": req.examId, "studentId": m.studentId},
            {"$set": mark_doc},
            upsert=True
        )
        inserted_or_updated += 1

    # Update exam status to MARKS_ENTERED if still draft
    await db.exams.update_one(
        {"examId": req.examId},
        {"$set": {"status": "MARKS_ENTERED", "marksCount": inserted_or_updated, "updatedAt": now_iso}}
    )

    return {"ok": True, "message": f"Recorded marks for {inserted_or_updated} students in {exam.get('examName')}"}


@router.post("/{exam_id}/publish", summary="Publish exam marks so students can view them")
async def publish_exam(
    exam_id: str,
    current_user: TokenData = Depends(require_faculty_up),
):
    db = await get_db()
    res = await db.exams.update_one(
        {"examId": exam_id},
        {"$set": {"isPublished": True, "status": "PUBLISHED", "publishedBy": current_user.name, "publishedAt": datetime.now(timezone.utc).isoformat()}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Exam not found")

    return {"ok": True, "message": "Exam marks successfully published to students"}


@router.get("/student/{student_id}", summary="View student assessments (IDOR protected)")
async def get_student_assessments(
    student_id: str,
    current_user: TokenData = Depends(get_current_user),
):
    # IDOR check: Students can only view their own assessments
    if current_user.role == UserRole.STUDENT and student_id != current_user.userId:
        raise HTTPException(status_code=403, detail="Students can only access their own assessment results")

    db = await get_db()
    flt: Dict[str, Any] = {"studentId": student_id}

    marks = await db.assessment_marks.find(flt, {"_id": 0}).sort("enteredAt", -1).to_list(50)

    # Filter out unpublished exams for students
    if current_user.role == UserRole.STUDENT:
        published_exam_ids = set()
        published_exams = await db.exams.find({"isPublished": True}, {"examId": 1}).to_list(100)
        for e in published_exams:
            published_exam_ids.add(e["examId"])
        marks = [m for m in marks if m.get("examId") in published_exam_ids]

    total_marks = len(marks)
    passed_cnt = sum(1 for m in marks if m.get("isPassed", True))
    avg_pct = round(sum(m.get("percentage", 0.0) for m in marks) / max(1, total_marks), 1) if total_marks > 0 else 0.0

    return {
        "studentId": student_id,
        "totalAssessments": total_marks,
        "passedAssessments": passed_cnt,
        "averagePercentage": avg_pct,
        "assessments": marks,
    }


@router.post("/marks-csv", summary="Upload marks via CSV with preview and validation")
async def upload_marks_csv(
    examId: str = Query(...),
    file: UploadFile = File(...),
    current_user: TokenData = Depends(require_faculty_up),
):
    db = await get_db()
    exam = await db.exams.find_one({"examId": examId})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    max_marks = float(exam.get("maxMarks", 100.0))
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except Exception:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    valid_rows = []
    errors = []
    row_idx = 1

    for row in reader:
        row_idx += 1
        norm = {k.strip().lower().replace(" ", "_"): v.strip() for k, v in row.items() if k and v}
        roll = norm.get("roll_number") or norm.get("rollno") or norm.get("student_id")
        marks_str = norm.get("marks") or norm.get("obtained_marks") or norm.get("score")

        if not roll:
            errors.append(f"Row {row_idx}: Missing roll number")
            continue
        if not marks_str:
            errors.append(f"Row {row_idx} ({roll}): Missing marks value")
            continue

        try:
            val = float(marks_str)
        except ValueError:
            errors.append(f"Row {row_idx} ({roll}): Invalid numeric mark '{marks_str}'")
            continue

        if val < 0.0 or val > max_marks:
            errors.append(f"Row {row_idx} ({roll}): Mark {val} out of bounds (allowed: 0.0 to {max_marks})")
            continue

        valid_rows.append({"studentId": roll.upper(), "obtainedMarks": val, "remarks": norm.get("remarks", "")})

    return {
        "examId": examId,
        "examName": exam.get("examName"),
        "maxMarks": max_marks,
        "totalParsed": len(valid_rows) + len(errors),
        "validCount": len(valid_rows),
        "errorCount": len(errors),
        "errors": errors[:30],
        "preview": valid_rows[:15],
    }
