"""API Router — Bulk CSV Student Import & Academic Updates."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import csv
import io
import re

from app.core.security import require_admin, require_institution, hash_password
from app.schemas.auth import TokenData, UserRole
from app.core.database import get_db
from app.core.stream_catalog import normalize_stream, normalize_degree

router = APIRouter()

# ── CSV Schemas & Templates ──────────────────────────────────────────────────
STUDENT_CSV_HEADERS = [
    "student_name", "roll_number", "email", "phone", "department",
    "degree", "specialization", "batch_year", "academic_year", "semester",
    "class_section", "date_of_birth", "gender", "tenth_percentage",
    "twelfth_percentage", "diploma_percentage", "cgpa", "ug_percentage",
    "current_arrears", "historical_arrears", "attendance_percentage",
    "technical_skills", "soft_skills", "certifications", "career_interests",
    "placement_readiness"
]

STUDENT_SAMPLE_ROWS = [
    [
        "Aarav Sharma", "CS24001", "aarav.sharma@campus.edu", "+919876543210", "Computer Science",
        "BE", "Computer Science and Engineering", "2024-2028", "2026-2027", "4",
        "CSE-A", "2005-06-15", "Male", "88.5",
        "86.0", "", "8.45", "",
        "0", "0", "91.0",
        "Java, Python, SQL, DSA", "Communication, Leadership", "AWS Certified Cloud Practitioner", "Software Engineer, Cloud Developer",
        "78.0"
    ],
    [
        "Diya Patel", "EC24002", "diya.patel@campus.edu", "+919876543211", "Electronics",
        "BE", "Electronics and Communication", "2024-2028", "2026-2027", "4",
        "ECE-B", "2005-08-22", "Female", "84.0",
        "82.5", "", "7.80", "",
        "1", "1", "76.5",
        "Python, Embedded C, MATLAB", "Teamwork, Problem Solving", "", "VLSI Design, Embedded Engineer",
        "62.0"
    ],
]

ACADEMIC_CSV_HEADERS = [
    "roll_number", "semester", "attendance_percentage", "sgpa", "cgpa",
    "current_arrears", "subject_marks", "internal_assessment"
]

ACADEMIC_SAMPLE_ROWS = [
    ["CS24001", "4", "92.0", "8.60", "8.45", "0", "Data Structures:88,Database Systems:85,OS:82", "IA1:45/50,IA2:47/50"],
    ["EC24002", "4", "78.0", "7.50", "7.80", "1", "Signals and Systems:68,Microprocessors:72,Analog IC:60", "IA1:38/50,IA2:40/50"],
]


@router.get("/template/{import_type}", summary="Download CSV Template")
async def download_template(import_type: str = "students"):
    output = io.StringIO()
    writer = csv.writer(output)

    if import_type == "academic":
        writer.writerow(ACADEMIC_CSV_HEADERS)
        for r in ACADEMIC_SAMPLE_ROWS:
            writer.writerow(r)
        filename = "campus_pulse_academic_updates_template.csv"
    else:
        writer.writerow(STUDENT_CSV_HEADERS)
        for r in STUDENT_SAMPLE_ROWS:
            writer.writerow(r)
        filename = "campus_pulse_bulk_students_template.csv"

    csv_data = output.getvalue()
    output.close()

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


def _safe_float(val, default=0.0):
    try:
        return float(val) if val not in (None, "", "—", "N/A") else default
    except (ValueError, TypeError):
        return default


def _safe_int(val, default=0):
    try:
        return int(float(val)) if val not in (None, "", "—", "N/A") else default
    except (ValueError, TypeError):
        return default


@router.post("/preview", summary="Upload and validate CSV without saving")
async def preview_csv(
    file: UploadFile = File(...),
    importType: str = Form("students"),
    current_user: TokenData = Depends(require_institution),
):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files (.csv) are supported")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except Exception:
            raise HTTPException(status_code=400, detail="Unable to decode file. Ensure file is UTF-8 encoded.")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file appears to be empty or lacks headers")

    db = await get_db()
    existing_rolls = set(await db.students.distinct("studentId"))
    existing_rolls |= set(await db.students.distinct("rollNo"))
    existing_emails = set(await db.students.distinct("email"))

    rows_data = []
    errors = []
    seen_in_file_rolls = set()
    seen_in_file_emails = set()

    for idx, row in enumerate(reader, start=2):  # line 2 is row 1
        # Normalize keys by trimming and lowercasing
        norm_row = {k.strip().lower().replace(" ", "_"): (v.strip() if v else "") for k, v in row.items() if k}
        row_errors = []

        roll = norm_row.get("roll_number") or norm_row.get("rollno") or norm_row.get("student_id") or ""
        name = norm_row.get("student_name") or norm_row.get("name") or ""
        email = norm_row.get("email") or ""
        dept = norm_row.get("department") or ""

        # Validations
        if not roll:
            row_errors.append({"field": "roll_number", "message": "Roll number is required"})
        elif roll in seen_in_file_rolls:
            row_errors.append({"field": "roll_number", "message": f"Duplicate roll number '{roll}' within CSV"})
        else:
            seen_in_file_rolls.add(roll)

        if not name:
            row_errors.append({"field": "student_name", "message": "Student name is required"})

        if email:
            if not re.match(r"[^@]+@[^@]+\.[^@]+", email):
                row_errors.append({"field": "email", "message": f"Invalid email format: '{email}'"})
            elif email in seen_in_file_emails:
                row_errors.append({"field": "email", "message": f"Duplicate email '{email}' in file"})
            else:
                seen_in_file_emails.add(email)

        cgpa_val = _safe_float(norm_row.get("cgpa"), None)
        if cgpa_val is not None and (cgpa_val < 0.0 or cgpa_val > 10.0):
            row_errors.append({"field": "cgpa", "message": f"CGPA must be between 0.0 and 10.0 (got {cgpa_val})"})

        att_val = _safe_float(norm_row.get("attendance_percentage") or norm_row.get("attendance"), None)
        if att_val is not None and (att_val < 0.0 or att_val > 100.0):
            row_errors.append({"field": "attendance_percentage", "message": f"Attendance must be between 0 and 100"})

        is_duplicate = roll in existing_rolls or (email and email in existing_emails)

        if row_errors:
            for err in row_errors:
                errors.append({"row": idx, **err, "roll": roll, "name": name})

        rows_data.append({
            "rowIndex": idx,
            "roll": roll,
            "name": name,
            "email": email,
            "department": dept,
            "degree": norm_row.get("degree", "BE"),
            "semester": _safe_int(norm_row.get("semester"), 1),
            "cgpa": cgpa_val if cgpa_val is not None else "Pending",
            "attendance": att_val if att_val is not None else "Pending",
            "currentArrears": _safe_int(norm_row.get("current_arrears"), 0),
            "historicalArrears": _safe_int(norm_row.get("historical_arrears"), 0),
            "skills": norm_row.get("technical_skills", ""),
            "placementReadiness": _safe_float(norm_row.get("placement_readiness"), 50.0),
            "isDuplicate": is_duplicate,
            "hasErrors": len(row_errors) > 0,
            "errorCount": len(row_errors),
            "rawRow": norm_row,
        })

    valid_count = sum(1 for r in rows_data if not r["hasErrors"])
    duplicate_count = sum(1 for r in rows_data if r["isDuplicate"])

    return {
        "filename": file.filename,
        "totalRows": len(rows_data),
        "validCount": valid_count,
        "errorCount": len(errors),
        "duplicateCount": duplicate_count,
        "detectedColumns": list(reader.fieldnames or []),
        "errors": errors[:50],  # cap preview errors
        "preview": rows_data[:20],
        "allRows": rows_data if len(rows_data) <= 500 else rows_data[:500],
    }


class CommitImportRequest(BaseModel):
    rows: List[Dict[str, Any]]
    skipDuplicates: bool = True
    defaultPassword: str = "Student@123"


@router.post("/commit", summary="Commit validated CSV records to MongoDB")
async def commit_csv(
    req: CommitImportRequest,
    current_user: TokenData = Depends(require_institution),
):
    if not req.rows:
        raise HTTPException(status_code=400, detail="No rows provided for import")

    db = await get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    default_hash = hash_password(req.defaultPassword)

    inserted_students = 0
    updated_students = 0
    created_accounts = 0
    skipped_count = 0
    failed_rows = []

    for r in req.rows:
        raw = r.get("rawRow") or r
        roll = (r.get("roll") or raw.get("roll_number") or raw.get("rollno") or "").strip()
        name = (r.get("name") or raw.get("student_name") or "").strip()
        email = (r.get("email") or raw.get("email") or f"{roll.lower()}@campus.edu").strip()
        dept = r.get("department") or raw.get("department") or "General"

        if not roll or not name:
            failed_rows.append({"roll": roll, "reason": "Missing roll number or name"})
            continue

        existing = await db.students.find_one({"$or": [{"studentId": roll}, {"rollNo": roll}]})

        if existing and req.skipDuplicates:
            skipped_count += 1
            continue

        cgpa_val = _safe_float(raw.get("cgpa"), 7.0)
        att_val = _safe_float(raw.get("attendance_percentage") or raw.get("attendance"), 80.0)
        curr_arr = _safe_int(raw.get("current_arrears"), 0)
        hist_arr = _safe_int(raw.get("historical_arrears"), 0)
        pr_score = _safe_float(raw.get("placement_readiness"), 50.0)
        skills_str = raw.get("technical_skills") or raw.get("skills") or ""
        skill_list = [s.strip() for s in skills_str.split(",") if s.strip()]

        # Compute transparent Student Success Index
        ssi = round(clamp_metric(cgpa_val * 10 * 0.40 + att_val * 0.35 + pr_score * 0.25 - (curr_arr * 8)), 1)
        risk_level = "critical" if (curr_arr >= 2 or ssi < 45 or att_val < 65) else \
                     "at_risk"  if (curr_arr == 1 or ssi < 60 or att_val < 75) else \
                     "watch"    if (ssi < 70) else "healthy"

        student_doc = {
            "studentId": roll,
            "rollNo": roll,
            "name": name,
            "email": email,
            "phone": raw.get("phone", ""),
            "department": dept,
            "degree": raw.get("degree", "BE"),
            "streamCode": normalize_stream(dept),
            "semester": _safe_int(raw.get("semester"), 4),
            "batch": raw.get("batch_year", "2024-2028"),
            "section": raw.get("class_section", "A"),
            "cgpa": cgpa_val,
            "attendancePct": att_val,
            "currentArrears": curr_arr,
            "historicalArrears": hist_arr,
            "backlogCount": curr_arr,
            "totalArrearsHistory": hist_arr,
            "tenthPercentage": _safe_float(raw.get("tenth_percentage"), None),
            "twelfthPercentage": _safe_float(raw.get("twelfth_percentage"), None),
            "diplomaPercentage": _safe_float(raw.get("diploma_percentage"), None),
            "placementReadiness": pr_score,
            "academicReadiness": round(cgpa_val * 10, 1),
            "engagementHealth": att_val,
            "successIndex": ssi,
            "riskLevel": risk_level,
            "riskProbability": round(max(0.05, min(0.95, 1.0 - (ssi / 100.0))), 2),
            "momentum": "STABLE",
            "skills": {s.lower(): 70 for s in skill_list},
            "studentSkills": [{"skillName": s, "proficiencyScore": 70, "source": "CSV_IMPORT", "verified": False} for s in skill_list],
            "careerInterests": [c.strip() for c in (raw.get("career_interests") or "").split(",") if c.strip()],
            "dataConfidence": 85.0,
            "dataSource": "CSV_BULK_IMPORT",
            "importedBy": current_user.name,
            "importedAt": now_iso,
        }

        # 1. Upsert student document
        await db.students.update_one({"studentId": roll}, {"$set": student_doc}, upsert=True)
        if existing:
            updated_students += 1
        else:
            inserted_students += 1

        # 2. Create or link user login account
        user_doc = {
            "userId": roll,
            "username": roll.lower(),
            "name": name,
            "email": email,
            "role": UserRole.STUDENT.value,
            "department": dept,
            "passwordHash": default_hash,
            "mustChangePassword": True,
            "isActive": True,
            "createdAt": now_iso,
            "importedBy": current_user.name,
        }
        user_res = await db.users.update_one(
            {"userId": roll},
            {"$setOnInsert": user_doc},
            upsert=True
        )
        if user_res.upserted_id:
            created_accounts += 1

    # Record import audit entry
    await db.csv_imports.insert_one({
        "importType": "STUDENT_CREATION",
        "importedBy": current_user.name,
        "userId": current_user.userId,
        "totalRequested": len(req.rows),
        "insertedStudents": inserted_students,
        "updatedStudents": updated_students,
        "createdAccounts": created_accounts,
        "skippedCount": skipped_count,
        "failedCount": len(failed_rows),
        "timestamp": now_iso,
    })

    return {
        "ok": True,
        "message": f"Import completed: {inserted_students} created, {updated_students} updated, {created_accounts} login accounts ready.",
        "insertedStudents": inserted_students,
        "updatedStudents": updated_students,
        "createdAccounts": created_accounts,
        "skippedDuplicates": skipped_count,
        "failedCount": len(failed_rows),
        "defaultPassword": req.defaultPassword,
        "mustChangePassword": True,
    }


def clamp_metric(v, lo=0.0, hi=100.0):
    return max(lo, min(hi, v))


@router.post("/academic-update", summary="Dynamic CSV import for marks, attendance and arrears")
async def import_academic_updates(
    file: UploadFile = File(...),
    current_user: TokenData = Depends(require_institution),
):
    """Safely updates attendance, SGPA, CGPA, and arrears without overwriting unrelated student fields."""
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except Exception:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    db = await get_db()
    updated = 0
    not_found = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for row in reader:
        norm = {k.strip().lower().replace(" ", "_"): v.strip() for k, v in row.items() if k and v}
        roll = norm.get("roll_number") or norm.get("rollno") or norm.get("student_id")
        if not roll:
            continue

        student = await db.students.find_one({"$or": [{"studentId": roll}, {"rollNo": roll}]})
        if not student:
            not_found.append(roll)
            continue

        update_fields: Dict[str, Any] = {"lastAcademicUpdate": now_iso, "academicUpdatedBy": current_user.name}

        if "attendance_percentage" in norm:
            att = _safe_float(norm["attendance_percentage"])
            update_fields["attendancePct"] = att
            update_fields["engagementHealth"] = att

        if "cgpa" in norm:
            cgpa = _safe_float(norm["cgpa"])
            update_fields["cgpa"] = cgpa
            update_fields["academicReadiness"] = round(cgpa * 10, 1)

        if "current_arrears" in norm:
            update_fields["currentArrears"] = _safe_int(norm["current_arrears"])
            update_fields["backlogCount"] = update_fields["currentArrears"]

        if "historical_arrears" in norm:
            update_fields["historicalArrears"] = _safe_int(norm["historical_arrears"])

        if "subject_marks" in norm:
            # Format: Subject1:85,Subject2:90
            marks_dict = {}
            for pair in norm["subject_marks"].split(","):
                if ":" in pair:
                    subj, mk = pair.split(":", 1)
                    marks_dict[subj.strip()] = _safe_float(mk.strip())
            update_fields["subjectMarks"] = marks_dict

        # Recalculate SSI
        cur_cgpa = update_fields.get("cgpa", student.get("cgpa", 7.0))
        cur_att = update_fields.get("attendancePct", student.get("attendancePct", 80.0))
        cur_arr = update_fields.get("currentArrears", student.get("currentArrears", 0))
        cur_pr = student.get("placementReadiness", 50.0)

        ssi = round(clamp_metric(cur_cgpa * 10 * 0.40 + cur_att * 0.35 + cur_pr * 0.25 - (cur_arr * 8)), 1)
        update_fields["successIndex"] = ssi
        update_fields["riskLevel"] = "critical" if (cur_arr >= 2 or ssi < 45 or cur_att < 65) else \
                                     "at_risk"  if (cur_arr == 1 or ssi < 60 or cur_att < 75) else \
                                     "watch"    if (ssi < 70) else "healthy"

        await db.students.update_one({"_id": student["_id"]}, {"$set": update_fields})
        updated += 1

    return {
        "ok": True,
        "message": f"Academic updates applied to {updated} students",
        "updatedCount": updated,
        "notFoundRolls": not_found[:20],
    }


@router.get("/history", summary="List CSV Import History")
async def get_import_history(current_user: TokenData = Depends(require_institution)):
    db = await get_db()
    history = await db.csv_imports.find({}, {"_id": 0}).sort("timestamp", -1).limit(25).to_list(25)
    return history
