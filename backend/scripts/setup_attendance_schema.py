"""
Campus Pulse AI - Attendance Management Schema, Indexes & Seeding
Configures MongoDB Atlas collections, compound indexes, student section & parent contact assignments,
and initial HOD-controlled CA / Subject Faculty assignments.
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

# Add backend directory to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.core.database import connect_db, close_db, get_db

async def setup():
    print("[*] Connecting to local MongoDB...")
    await connect_db()
    db = await get_db()
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Ensure students have section and parentContact
    print("[*] Verifying student sections and parent contacts...")
    from pymongo import UpdateOne
    students = await db.students.find({}, {"_id": 1, "studentId": 1, "section": 1, "parentContact": 1}).to_list(2000)
    bulk_ops = []
    for idx, s in enumerate(students):
        update_fields = {}
        if not s.get("section") or s.get("section") == "All":
            update_fields["section"] = "A" if (idx % 2 == 0) else "B"
        if not s.get("parentContact"):
            phone_suffix = f"{(idx * 173 + 10423) % 90000 + 10000}"
            update_fields["parentContact"] = f"+91-98401{phone_suffix}"
            update_fields["guardianName"] = "Guardian"
        if update_fields:
            bulk_ops.append(UpdateOne({"_id": s["_id"]}, {"$set": update_fields}))

    if bulk_ops:
        res = await db.students.bulk_write(bulk_ops)
        print(f"[+] Bulk updated {res.modified_count} student records with section and parent contact.")
    else:
        print("[+] Student records already have section and parent contact.")

    # 2. Create collections and compound indexes
    print("[*] Creating compound indexes...")
    # faculty_assignments
    await db.faculty_assignments.create_index(
        [("department", 1), ("semester", 1), ("section", 1), ("period", 1), ("status", 1)]
    )
    await db.faculty_assignments.create_index([("subjectFacultyId", 1), ("status", 1)])
    await db.faculty_assignments.create_index([("classAdvisorId", 1), ("status", 1)])
    await db.faculty_assignments.create_index([("assignmentId", 1)], unique=True)

    # attendance_sessions - clean and normalize legacy test sessions
    sessions = await db.attendance_sessions.find({}).to_list(100)
    seen_keys = set()
    for s in sessions:
        sub = s.get("subject") or s.get("subjectCode") or "CS401 - Data Structures"
        key = (s.get("department"), s.get("semester"), s.get("section", "A"), sub, s.get("date"), s.get("period"))
        if key in seen_keys:
            await db.attendance_sessions.delete_one({"_id": s["_id"]})
        else:
            seen_keys.add(key)
            await db.attendance_sessions.update_one(
                {"_id": s["_id"]},
                {"$set": {"subject": sub, "subjectCode": s.get("subjectCode") or sub.split(" ")[0]}}
            )

    await db.attendance_sessions.create_index(
        [("department", 1), ("semester", 1), ("section", 1), ("subject", 1), ("date", 1), ("period", 1)],
        unique=True
    )
    await db.attendance_sessions.create_index([("sessionId", 1)], unique=True)
    await db.attendance_sessions.create_index([("facultyId", 1), ("date", 1)])
    await db.attendance_sessions.create_index([("sessionStatus", 1)])

    # attendance_records
    await db.attendance_records.create_index(
        [("sessionId", 1), ("studentId", 1)],
        unique=True
    )
    await db.attendance_records.create_index([("studentId", 1), ("date", 1)])
    await db.attendance_records.create_index([("status", 1)])

    # od_requests
    await db.od_requests.create_index([("odId", 1)], unique=True)
    await db.od_requests.create_index([("studentId", 1), ("status", 1)])
    await db.od_requests.create_index([("department", 1), ("status", 1)])

    # attendance_audit_logs
    await db.attendance_audit_logs.create_index([("sessionId", 1), ("timestamp", -1)])
    await db.attendance_audit_logs.create_index([("studentId", 1), ("timestamp", -1)])
    await db.attendance_audit_logs.create_index([("auditId", 1)], unique=True)

    print("[+] All compound and unique indexes verified.")

    # 3. Seed Standard Timetable & Faculty Assignments for all Departments
    print("[*] Seeding HOD-controlled Class Advisor & Subject Faculty assignments...")
    sample_assignments = [
        # Computer Science (HOD: HOD001 - Prof. Rajan Sharma)
        {
            "assignmentId": "ASN-CS-4A-P1",
            "department": "Computer Science",
            "academicYear": "2026-2027",
            "batch": "2024-2028",
            "yearOfStudy": 2,
            "semester": 4,
            "section": "A",
            "classAdvisorId": "FAC001",
            "classAdvisorName": "Ms. Priya Nair",
            "subjectFacultyId": "FAC001",
            "subjectFacultyName": "Ms. Priya Nair",
            "subjectCode": "CS401",
            "subjectName": "Data Structures & Algorithms",
            "period": 1,
            "scheduledStartTime": "09:00",
            "scheduledEndTime": "09:50",
            "effectiveStartDate": "2026-01-01",
            "effectiveEndDate": "2026-12-31",
            "status": "ACTIVE",
            "substituteFacultyId": None,
            "substituteFacultyName": None,
            "createdBy": "HOD001",
            "createdAt": now_iso,
            "updatedAt": now_iso,
        },
        {
            "assignmentId": "ASN-CS-4A-P2",
            "department": "Computer Science",
            "academicYear": "2026-2027",
            "batch": "2024-2028",
            "yearOfStudy": 2,
            "semester": 4,
            "section": "A",
            "classAdvisorId": "FAC001",
            "classAdvisorName": "Ms. Priya Nair",
            "subjectFacultyId": "FAC001",
            "subjectFacultyName": "Ms. Priya Nair",
            "subjectCode": "CS401",
            "subjectName": "Data Structures & Algorithms",
            "period": 2,
            "scheduledStartTime": "09:50",
            "scheduledEndTime": "10:40",
            "effectiveStartDate": "2026-01-01",
            "effectiveEndDate": "2026-12-31",
            "status": "ACTIVE",
            "substituteFacultyId": None,
            "substituteFacultyName": None,
            "createdBy": "HOD001",
            "createdAt": now_iso,
            "updatedAt": now_iso,
        },
        {
            "assignmentId": "ASN-CS-4A-P3",
            "department": "Computer Science",
            "academicYear": "2026-2027",
            "batch": "2024-2028",
            "yearOfStudy": 2,
            "semester": 4,
            "section": "A",
            "classAdvisorId": "FAC001",
            "classAdvisorName": "Ms. Priya Nair",
            "subjectFacultyId": "FAC002",
            "subjectFacultyName": "Dr. Anirudh Sen",
            "subjectCode": "CS402",
            "subjectName": "Database Management Systems",
            "period": 3,
            "scheduledStartTime": "10:55",
            "scheduledEndTime": "11:45",
            "effectiveStartDate": "2026-01-01",
            "effectiveEndDate": "2026-12-31",
            "status": "ACTIVE",
            "substituteFacultyId": None,
            "substituteFacultyName": None,
            "createdBy": "HOD001",
            "createdAt": now_iso,
            "updatedAt": now_iso,
        },
        # Electronics (HOD: HOD002 - Prof. Kavitha Reddy)
        {
            "assignmentId": "ASN-EC-4A-P1",
            "department": "Electronics",
            "academicYear": "2026-2027",
            "batch": "2024-2028",
            "yearOfStudy": 2,
            "semester": 4,
            "section": "A",
            "classAdvisorId": "ADV001",
            "classAdvisorName": "Ms. Lakshmi Iyer",
            "subjectFacultyId": "ADV001",
            "subjectFacultyName": "Ms. Lakshmi Iyer",
            "subjectCode": "EC401",
            "subjectName": "Digital Signal Processing",
            "period": 1,
            "scheduledStartTime": "09:00",
            "scheduledEndTime": "09:50",
            "effectiveStartDate": "2026-01-01",
            "effectiveEndDate": "2026-12-31",
            "status": "ACTIVE",
            "substituteFacultyId": None,
            "substituteFacultyName": None,
            "createdBy": "HOD002",
            "createdAt": now_iso,
            "updatedAt": now_iso,
        },
    ]

    for asn in sample_assignments:
        await db.faculty_assignments.update_one(
            {"assignmentId": asn["assignmentId"]},
            {"$set": asn},
            upsert=True
        )

    print(f"[+] Seeded {len(sample_assignments)} baseline faculty assignments.")
    await close_db()
    print("[DONE] Attendance schema setup complete.")

if __name__ == "__main__":
    asyncio.run(setup())
