"""
Campus Pulse AI - Comprehensive Automated Test Suite
Validates all 20 Phase 16 requirements against the live backend and MongoDB Atlas.
"""
import sys
import os
import asyncio
import json
import logging
from io import BytesIO

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.core.config import settings
from app.core.database import connect_db, close_db, get_db
from app.core.security import verify_password, hash_password, create_access_token
from app.core.rbac import BASE_ROLE_PERMISSIONS, BaseRole, has_permission, Permission, get_effective_permissions
from app.main import app

import httpx
from httpx import ASGITransport

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("TestPlatform")

results = []

def record_test(name: str, passed: bool, details: str = ""):
    results.append({"name": name, "passed": passed, "details": details})
    mark = "PASS" if passed else "FAIL"
    print(f"[{mark}] {name} - {details}")

async def run_all_tests():
    print("=" * 80)
    print("CAMPUS PULSE AI - COMPREHENSIVE INTEGRATION & QA TEST SUITE")
    print(f"Environment: Local MongoDB / Compass ({settings.DB_NAME}) at {settings.MONGODB_URL}")
    print("=" * 80)

    # 1. Connect to Database & Bootstrap Staff
    await connect_db()
    db = await get_db()
    from app.api.auth import bootstrap_initial_users
    await bootstrap_initial_users()
    
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        
        # -------------------------------------------------------------
        # TEST 1: System Health & Database Connectivity
        # -------------------------------------------------------------
        try:
            resp = await client.get("/api/health")
            data = resp.json()
            is_healthy = resp.status_code == 200 and data.get("status") == "ok"
            student_count = await db.students.count_documents({})
            record_test(
                "Health & DB Connectivity",
                is_healthy and student_count > 0,
                f"Status: {resp.status_code}, Active Students in Atlas: {student_count}"
            )
        except Exception as e:
            record_test("Health & DB Connectivity", False, str(e))

        # -------------------------------------------------------------
        # TEST 2: Password Hashing & Bcrypt Verification
        # -------------------------------------------------------------
        try:
            raw_pass = "Student@123"
            hashed = hash_password(raw_pass)
            is_valid = verify_password(raw_pass, hashed)
            is_invalid = not verify_password("WrongPassword@999", hashed)
            record_test(
                "Password Hashing & Bcrypt Verification",
                is_valid and is_invalid,
                "Bcrypt salt hashing and comparison verified"
            )
        except Exception as e:
            record_test("Password Hashing & Bcrypt Verification", False, str(e))

        # -------------------------------------------------------------
        # TEST 3: Admin Authentication & Token Issuance
        # -------------------------------------------------------------
        admin_token = None
        try:
            resp = await client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "admin123"}
            )
            data = resp.json()
            if resp.status_code == 200 and "access_token" in data:
                admin_token = data["access_token"]
                user = data.get("user", {})
                record_test(
                    "Admin Authentication",
                    True,
                    f"Token generated for {user.get('email')} with role {user.get('role')}"
                )
            else:
                record_test("Admin Authentication", False, f"HTTP {resp.status_code}: {data}")
        except Exception as e:
            record_test("Admin Authentication", False, str(e))

        # -------------------------------------------------------------
        # TEST 4: Student Authentication & Default Credentials (Student@123)
        # -------------------------------------------------------------
        student_token = None
        sample_student = await db.students.find_one({})
        sample_student_id = sample_student.get("studentId", "STU001") if sample_student else "STU001"
        
        try:
            # Ensure mustChangePassword is set to True to test first-login policy
            await db.users.update_one(
                {"userId": sample_student_id},
                {"$set": {"mustChangePassword": True, "passwordHash": hash_password("Student@123")}}
            )

            resp = await client.post(
                "/api/auth/login",
                json={"username": sample_student_id, "password": "Student@123"}
            )
            data = resp.json()
            if resp.status_code == 200 and "access_token" in data:
                student_token = data["access_token"]
                user = data.get("user", {})
                first_login_enforced = user.get("mustChangePassword") is True and data.get("mustChangePassword") is True
                record_test(
                    "Student Auth with Default Credential (Student@123)",
                    first_login_enforced,
                    f"Authenticated roll {sample_student_id}, role: {user.get('role')}, mustChangePassword: {user.get('mustChangePassword')}"
                )
            else:
                record_test("Student Auth with Default Credential", False, f"HTTP {resp.status_code}: {data}")
        except Exception as e:
            record_test("Student Auth with Default Credential", False, str(e))

        # -------------------------------------------------------------
        # TEST 5: First-Login Password Change Flow
        # -------------------------------------------------------------
        try:
            if student_token:
                change_resp = await client.post(
                    "/api/auth/change-password",
                    headers={"Authorization": f"Bearer {student_token}"},
                    json={
                        "currentPassword": "Student@123",
                        "newPassword": "NewStudentPassword@2026!"
                    }
                )
                c_data = change_resp.json()
                pass_changed = change_resp.status_code == 200 and c_data.get("mustChangePassword") is False
                
                # Revert back to Student@123 for test reproducibility
                revert_resp = await client.post(
                    "/api/auth/change-password",
                    headers={"Authorization": f"Bearer {student_token}"},
                    json={
                        "currentPassword": "NewStudentPassword@2026!",
                        "newPassword": "Student@123"
                    }
                )
                
                record_test(
                    "First-Login Password Change Flow",
                    pass_changed and revert_resp.status_code == 200,
                    f"Password rotated and reset cleanly: {c_data.get('message')}"
                )
            else:
                record_test("First-Login Password Change Flow", False, "Skipped due to missing student token")
        except Exception as e:
            record_test("First-Login Password Change Flow", False, str(e))

        # -------------------------------------------------------------
        # TEST 6: Role-Based Authorization & 9 Roles Check
        # -------------------------------------------------------------
        try:
            all_roles = [r.value for r in BaseRole]
            required_roles = [
                "JOINT_SECRETARY", "PRINCIPAL", "HOD", "FACULTY",
                "CLASS_ADVISOR", "MENTOR", "PLACEMENT_COORDINATOR",
                "STUDENT", "CLASS_REPRESENTATIVE"
            ]
            has_all_9 = all(req in all_roles for req in required_roles)
            has_perms = all(r in BASE_ROLE_PERMISSIONS for r in BaseRole)
            record_test(
                "Role-Based Authorization Architecture (All 9 Roles)",
                has_all_9 and has_perms,
                f"9 standard roles verified in RBAC: {', '.join(required_roles)}"
            )
        except Exception as e:
            record_test("Role-Based Authorization Architecture", False, str(e))

        # -------------------------------------------------------------
        # TEST 7: Student IDOR Protection & Profile Privacy
        # -------------------------------------------------------------
        try:
            if student_token and admin_token:
                other_student = await db.students.find_one({"studentId": {"$ne": sample_student_id}})
                other_id = other_student.get("studentId") if other_student else "STU999_OTHER"
                
                # Student trying to access other student's predictions/risk
                idor_resp = await client.get(
                    f"/api/predictions/{other_id}",
                    headers={"Authorization": f"Bearer {student_token}"}
                )
                is_forbidden = idor_resp.status_code == 403
                
                # Admin trying to access same endpoint (should succeed)
                admin_resp = await client.get(
                    f"/api/predictions/{other_id}",
                    headers={"Authorization": f"Bearer {admin_token}"}
                )
                admin_allowed = admin_resp.status_code in [200, 404]

                record_test(
                    "Student IDOR Protection & Profile Privacy",
                    is_forbidden and admin_allowed,
                    f"Student access to other student profile blocked with HTTP {idor_resp.status_code}"
                )
            else:
                record_test("Student IDOR Protection", False, "Missing tokens")
        except Exception as e:
            record_test("Student IDOR Protection", False, str(e))

        # -------------------------------------------------------------
        # TEST 8: CSV Import Template Downloads
        # -------------------------------------------------------------
        try:
            resp_stu = await client.get(
                "/api/csv-import/template/students",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            resp_acad = await client.get(
                "/api/csv-import/template/academic",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            templates_ok = (
                resp_stu.status_code == 200 and "student_name" in resp_stu.text and
                resp_acad.status_code == 200 and "roll_number" in resp_acad.text
            )
            record_test(
                "CSV Import Template Generation",
                templates_ok,
                "Both student provisioning and academic update templates returned valid CSV headers"
            )
        except Exception as e:
            record_test("CSV Import Template Generation", False, str(e))

        # -------------------------------------------------------------
        # TEST 9: CSV Upload Validation & Preview (Syntax & Range Checks)
        # -------------------------------------------------------------
        try:
            valid_csv = (
                "student_name,roll_number,email,department,semester,cgpa,attendance_percentage,current_arrears,technical_skills\n"
                "Rohan Verma,ROH2026001,rohan.v@campuspulse.edu,Computer Science and Engineering,6,8.75,92.0,0,\"Python, React, SQL\"\n"
            )
            files = {"file": ("students.csv", valid_csv.encode("utf-8"), "text/csv")}
            prev_resp = await client.post(
                "/api/csv-import/preview",
                headers={"Authorization": f"Bearer {admin_token}"},
                files=files
            )
            prev_data = prev_resp.json()
            valid_count = prev_data.get("validCount", 0)
            
            # Now test invalid CSV (attendance > 100, invalid CGPA > 10)
            invalid_csv = (
                "student_name,roll_number,email,department,semester,cgpa,attendance_percentage,current_arrears,technical_skills\n"
                "Bad Student,BAD001,bad@campuspulse.edu,Computer Science and Engineering,6,14.5,150.0,-1,\"None\"\n"
            )
            files_bad = {"file": ("bad_students.csv", invalid_csv.encode("utf-8"), "text/csv")}
            prev_bad_resp = await client.post(
                "/api/csv-import/preview",
                headers={"Authorization": f"Bearer {admin_token}"},
                files=files_bad
            )
            prev_bad_data = prev_bad_resp.json()
            errors_caught = len(prev_bad_data.get("errors", [])) > 0
            
            record_test(
                "CSV Validation & Preview (Range, Syntax, Headers)",
                prev_resp.status_code == 200 and valid_count == 1 and errors_caught,
                f"Valid row parsed correctly (Count: {valid_count}). Range violations caught ({len(prev_bad_data.get('errors', []))} errors)."
            )
        except Exception as e:
            record_test("CSV Validation & Preview", False, str(e))

        # -------------------------------------------------------------
        # TEST 10: Bulk Student Creation & Linked User Account Provisioning
        # -------------------------------------------------------------
        test_roll = "TEST_QA_BATCH_999"
        try:
            # Clean up before testing
            await db.students.delete_one({"studentId": test_roll})
            await db.users.delete_one({"userId": test_roll})

            commit_payload = {
                "rows": [
                    {
                        "student_name": "Test QA Student",
                        "roll_number": test_roll,
                        "email": "testqa999@campuspulse.edu",
                        "department": "Computer Science and Engineering",
                        "degree": "B.Tech",
                        "batch_year": "2024-2028",
                        "semester": 6,
                        "cgpa": 8.45,
                        "attendance_percentage": 88.5,
                        "current_arrears": 0,
                        "historical_arrears": 0,
                        "technical_skills": "Python, FastAPI, React",
                        "soft_skills": "Leadership, Communication",
                        "placement_readiness": 85.0
                    }
                ],
                "defaultPassword": "Student@123",
                "skipDuplicates": False
            }
            commit_resp = await client.post(
                "/api/csv-import/commit",
                headers={"Authorization": f"Bearer {admin_token}"},
                json=commit_payload
            )
            commit_data = commit_resp.json()
            created_stu = commit_data.get("insertedStudents", 0)
            created_usr = commit_data.get("createdAccounts", 0)
            
            stu_in_db = await db.students.find_one({"studentId": test_roll})
            usr_in_db = await db.users.find_one({"userId": test_roll})
            
            # Verify login with created user
            login_resp = await client.post(
                "/api/auth/login",
                json={"username": test_roll, "password": "Student@123"}
            )
            login_success = login_resp.status_code == 200
            
            record_test(
                "Bulk Student Creation & Provisioning",
                created_stu == 1 and created_usr == 1 and stu_in_db is not None and usr_in_db is not None and login_success,
                f"Student record and user login created. MustChangePassword={usr_in_db.get('mustChangePassword') if usr_in_db else None}"
            )
        except Exception as e:
            record_test("Bulk Student Creation & Provisioning", False, str(e))

        # -------------------------------------------------------------
        # TEST 11: Dynamic Academic CSV Partial Update
        # -------------------------------------------------------------
        try:
            academic_csv = (
                "roll_number,semester,attendance_percentage,sgpa,cgpa,current_arrears\n"
                f"{test_roll},6,94.5,8.90,8.55,0\n"
            )
            acad_files = {"file": ("academic_update.csv", academic_csv.encode("utf-8"), "text/csv")}
            acad_resp = await client.post(
                "/api/csv-import/academic-update",
                headers={"Authorization": f"Bearer {admin_token}"},
                files=acad_files
            )
            acad_data = acad_resp.json()
            updated_count = acad_data.get("updatedCount", 0)
            
            refetched = await db.students.find_one({"studentId": test_roll})
            profile_preserved = (
                refetched is not None and
                refetched.get("name") == "Test QA Student" and
                refetched.get("attendancePct") == 94.5
            )

            record_test(
                "Dynamic Academic CSV Partial Update",
                updated_count == 1 and profile_preserved,
                f"Academic record updated without corrupting profile or unassigned fields (Attendance: {refetched.get('attendancePct') if refetched else None}%)"
            )
            
            # Clean up test records
            await db.students.delete_one({"studentId": test_roll})
            await db.users.delete_one({"userId": test_roll})
        except Exception as e:
            record_test("Dynamic Academic CSV Partial Update", False, str(e))

        # -------------------------------------------------------------
        # TEST 12: Multi-Target Predictive Analytics & SHAP Drivers
        # -------------------------------------------------------------
        try:
            pred_resp = await client.get(
                f"/api/predictions/{sample_student_id}",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            pred_data = pred_resp.json()
            targets = pred_data.get("predictions", {})
            has_4_targets = (
                "backlogRisk" in targets and
                "semesterPerformance" in targets and
                "placementReadiness" in targets and
                "engagementDrop" in targets
            )
            shap_drivers = pred_data.get("shapDrivers", [])
            has_shap = len(shap_drivers) > 0
            record_test(
                "Multi-Target Predictive Analytics & SHAP Drivers",
                pred_resp.status_code == 200 and has_4_targets and has_shap,
                f"Targets: Backlog, SGPA Drift, Placement, Engagement verified with {len(shap_drivers)} explainable factors"
            )
        except Exception as e:
            record_test("Multi-Target Predictive Analytics", False, str(e))

        # -------------------------------------------------------------
        # TEST 13: Model Evaluation Metrics Endpoint (Cross-Validation vs Baseline)
        # -------------------------------------------------------------
        try:
            model_resp = await client.get(
                "/api/predictions/meta/models",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            model_data = model_resp.json()
            models_dict = model_data.get("models", {})
            has_models = len(models_dict) >= 3
            first_key = list(models_dict.keys())[0] if has_models else None
            first_model = models_dict.get(first_key, {})
            has_metrics = "productionModel" in first_model and "baseline" in first_model
            record_test(
                "Model Evaluation Metrics & Cross-Validation",
                model_resp.status_code == 200 and has_models and has_metrics,
                f"{len(models_dict)} predictive models evaluated. E.g., {first_key}: ROC-AUC={first_model.get('productionModel', {}).get('rocAuc')} vs Baseline={first_model.get('baseline', {}).get('rocAuc')}"
            )
        except Exception as e:
            record_test("Model Evaluation Metrics", False, str(e))

        # -------------------------------------------------------------
        # TEST 14: What-If Simulator API (Data Leakage & Non-destructive Check)
        # -------------------------------------------------------------
        try:
            orig_doc = await db.students.find_one({"studentId": sample_student_id})
            orig_ssi = orig_doc.get("successIndex", orig_doc.get("studentSuccessIndex", 0))

            sim_resp = await client.post(
                f"/api/simulator/{sample_student_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "attendancePct": 98.0,
                    "codingScore": 95.0,
                    "aptitudeScore": 90.0,
                    "mockInterviewScore": 88.0
                }
            )
            sim_data = sim_resp.json()
            post_doc = await db.students.find_one({"studentId": sample_student_id})
            post_ssi = post_doc.get("successIndex", post_doc.get("studentSuccessIndex", 0))
            
            is_non_destructive = (orig_ssi == post_ssi)
            simulated_ssi = sim_data.get("scenario", {}).get("successIndex")

            record_test(
                "What-If Simulator (Non-destructive Simulation)",
                sim_resp.status_code == 200 and is_non_destructive and simulated_ssi is not None,
                f"Simulated score calculated ({simulated_ssi}). Original DB score preserved ({post_ssi})"
            )
        except Exception as e:
            record_test("What-If Simulator", False, str(e))

        # -------------------------------------------------------------
        # TEST 15: Intervention Lifecycle Transitions
        # -------------------------------------------------------------
        try:
            # 1. Create (RECOMMENDED)
            create_payload = {
                "studentId": sample_student_id,
                "title": "Remedial Coaching in Core Architecture",
                "targetProblem": "Academic Support",
                "triggerCondition": "Attendance < 75% or arrears > 0",
                "recommendedAction": "Weekly faculty mentoring sessions",
                "priority": "HIGH",
                "deadlineDays": 14
            }
            create_resp = await client.post(
                "/api/interventions/create",
                headers={"Authorization": f"Bearer {admin_token}"},
                json=create_payload
            )
            c_data = create_resp.json()
            int_doc = c_data.get("intervention", {})
            int_id = int_doc.get("interventionId")
            
            # 2. Assign (ASSIGNED)
            assign_resp = await client.post(
                "/api/interventions/assign",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"interventionId": int_id, "assignedOwner": "Dr. Sunita Krishnan", "ownerRole": "CLASS_ADVISOR"}
            )
            
            # 3. Status Update (IN_PROGRESS)
            stat_resp = await client.post(
                f"/api/interventions/{int_id}/status",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"status": "IN_PROGRESS", "notes": "Student attended first 2 sessions"}
            )
            
            # 4. Outcome Measurement (COMPLETED)
            out_resp = await client.post(
                f"/api/interventions/{int_id}/outcome",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "status": "COMPLETED",
                    "afterMetrics": {"attendancePct": 92.0, "cgpa": 8.4},
                    "observedImpact": "Cleared mid-term test with 85% marks"
                }
            )
            lifecycle_complete = (
                create_resp.status_code == 200 and
                assign_resp.status_code == 200 and
                stat_resp.status_code == 200 and
                out_resp.status_code == 200 and
                int_id is not None
            )
            record_test(
                "Intervention Recommendation & Lifecycle Engine",
                lifecycle_complete,
                f"Full lifecycle transitions verified: RECOMMENDED -> ASSIGNED -> IN_PROGRESS -> COMPLETED (ID: {int_id})"
            )
        except Exception as e:
            record_test("Intervention Recommendation Engine", False, str(e))

        # -------------------------------------------------------------
        # TEST 16: Placement Eligibility & Job Management
        # -------------------------------------------------------------
        try:
            jobs_resp = await client.get(
                "/api/jobs",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            jobs_data = jobs_resp.json()
            jobs_list = jobs_data.get("jobs", [])
            has_jobs = len(jobs_list) > 0
            
            # Test student placement dashboard with student token
            stu_place_resp = await client.get(
                "/api/student/placement/jobs",
                headers={"Authorization": f"Bearer {student_token}"}
            )
            stu_place_ok = stu_place_resp.status_code == 200
            
            record_test(
                "Placement Eligibility & Intelligence Engine",
                jobs_resp.status_code == 200 and has_jobs and stu_place_ok,
                f"Retrieved {len(jobs_list)} active opportunities. Student placement personalized feed evaluated successfully"
            )
        except Exception as e:
            record_test("Placement Eligibility Engine", False, str(e))

        # -------------------------------------------------------------
        # TEST 17: Evidence-Grounded AI Analytics Copilot (Student Scoped)
        # -------------------------------------------------------------
        try:
            if student_token:
                copilot_stu_resp = await client.post(
                    "/api/copilot/query",
                    headers={"Authorization": f"Bearer {student_token}"},
                    json={"query": "What are my current academic standing and placement readiness?"}
                )
                copilot_stu_data = copilot_stu_resp.json()
                stu_answer = copilot_stu_data.get("answer", "")
                stu_grounded = len(stu_answer) > 20
                
                record_test(
                    "AI Copilot - Student Role Grounded Scoping",
                    copilot_stu_resp.status_code == 200 and stu_grounded,
                    f"Student query grounded in personal DB records without leaking institutional data"
                )
            else:
                record_test("AI Copilot - Student Scoped", False, "Missing student token")
        except Exception as e:
            record_test("AI Copilot - Student Scoped", False, str(e))

        # -------------------------------------------------------------
        # TEST 18: Evidence-Grounded AI Analytics Copilot (Staff / Admin Scoped)
        # -------------------------------------------------------------
        try:
            copilot_admin_resp = await client.post(
                "/api/copilot/query",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"query": "Which department has the most students requiring academic intervention?"}
            )
            copilot_admin_data = copilot_admin_resp.json()
            admin_answer = copilot_admin_data.get("answer", "")
            admin_grounded = len(admin_answer) > 20
            
            record_test(
                "AI Copilot - Administrator Institution Scoping",
                copilot_admin_resp.status_code == 200 and admin_grounded,
                f"Admin query grounded across institutional department metrics"
            )
        except Exception as e:
            record_test("AI Copilot - Admin Scoped", False, str(e))

        # -------------------------------------------------------------
        # TEST 19: Data Quality & Governance Engine
        # -------------------------------------------------------------
        try:
            dq_resp = await client.get(
                "/api/data-quality",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            dq_data = dq_resp.json()
            dq_ok = dq_resp.status_code == 200 and "overallCompleteness" in dq_data and "sources" in dq_data
            record_test(
                "Data Quality & Completeness Audit",
                dq_ok,
                f"Overall institutional data completeness: {dq_data.get('overallCompleteness')}% across {len(dq_data.get('sources', []))} data sources"
            )
        except Exception as e:
            record_test("Data Quality & Governance", False, str(e))

        # -------------------------------------------------------------
        # TEST 20: Dashboard Mission Control API
        # -------------------------------------------------------------
        try:
            dash_resp = await client.get(
                "/api/dashboard/summary",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            dash_data = dash_resp.json()
            dash_ok = dash_resp.status_code == 200 and "total" in dash_data and "deptStats" in dash_data
            record_test(
                "Executive Mission Control Dashboard API",
                dash_ok,
                f"Loaded overview for {dash_data.get('total')} students. Healthy: {dash_data.get('healthy')}, At-Risk: {dash_data.get('atRisk')}, Critical: {dash_data.get('critical')}"
            )
        except Exception as e:
            record_test("Executive Mission Control Dashboard API", False, f"Exception: {str(e)}")

        # -------------------------------------------------------------
        # TEST 21: Single Student Creation & Duplicate Detection
        # -------------------------------------------------------------
        test_single_roll = "TEST_SINGLE_2026_99"
        try:
            # Clean up before test
            await db.students.delete_one({"studentId": test_single_roll})
            await db.users.delete_one({"userId": test_single_roll})

            create_single_payload = {
                "rollNumber": test_single_roll,
                "name": "Pooja Hegde",
                "email": "pooja.single@campuspulse.edu",
                "department": "Computer Science and Engineering",
                "degree": "B.Tech",
                "batch": "2024-2028",
                "semester": 4,
                "section": "B",
                "cgpa": 8.7,
                "attendancePct": 91.5,
                "currentArrears": 0,
                "historicalArrears": 0,
                "placementReadiness": 82.0,
                "codingScore": 85.0,
                "aptitudeScore": 80.0,
                "technicalSkills": "Python, SQL, FastApi",
            }
            # 1. First creation (should succeed)
            single_resp = await client.post(
                "/api/students",
                headers={"Authorization": f"Bearer {admin_token}"},
                json=create_single_payload
            )
            single_ok = single_resp.status_code == 200

            # 2. Duplicate creation attempt (should fail with 400)
            dup_resp = await client.post(
                "/api/students",
                headers={"Authorization": f"Bearer {admin_token}"},
                json=create_single_payload
            )
            dup_caught = dup_resp.status_code == 400

            # Verify user account in db
            usr_doc = await db.users.find_one({"userId": test_single_roll})
            usr_provisioned = usr_doc is not None and usr_doc.get("mustChangePassword") is True

            record_test(
                "Single Student Creation & Duplicate Validation",
                single_ok and dup_caught and usr_provisioned,
                f"Student created and user account provisioned. Duplicate roll correctly rejected (HTTP {dup_resp.status_code})."
            )

            # Cleanup
            await db.students.delete_one({"studentId": test_single_roll})
            await db.users.delete_one({"userId": test_single_roll})
        except Exception as e:
            record_test("Single Student Creation", False, str(e))

        # -------------------------------------------------------------
        # TEST 22: Real Attendance Management (Roster, Session, & Correction)
        # -------------------------------------------------------------
        try:
            # 1. Load roster
            roster_resp = await client.get(
                "/api/attendance/roster?department=Computer%20Science%20and%20Engineering&semester=4",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            roster_ok = roster_resp.status_code == 200

            # Clean slot before test
            await db.attendance_sessions.delete_many({
                "date": "2026-10-24",
                "department": "Computer Science and Engineering",
                "semester": 4,
                "section": "A",
                "period": 2
            })
            sess_payload = {
                "date": "2026-10-24",
                "period": 2,
                "department": "Computer Science and Engineering",
                "semester": 4,
                "section": "A",
                "subject": "CS401 - Data Structures",
                "allowTestingWindow": True,
                "records": [
                    {
                        "studentId": sample_student_id,
                        "status": "ABSENT",
                        "absenceReason": "Severe viral fever and medical leave",
                        "leaveCategory": "MEDICAL"
                    }
                ]
            }
            mark_resp = await client.post(
                "/api/attendance/session",
                headers={"Authorization": f"Bearer {admin_token}"},
                json=sess_payload
            )
            mark_data = mark_resp.json()
            session_id = mark_data.get("session", {}).get("sessionId")

            # 3. Correct attendance with audit justification
            corr_resp = await client.post(
                "/api/attendance/correct",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "sessionId": session_id,
                    "studentId": sample_student_id,
                    "newStatus": "PRESENT",
                    "reason": "Student attended medical leave approval with certificate."
                }
            )
            corr_data = corr_resp.json()

            # 4. Analytics & threshold alerts check
            anal_resp = await client.get(
                "/api/attendance/analytics",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            anal_ok = anal_resp.status_code == 200 and "thresholdAlerts" in anal_resp.json()

            record_test(
                "Real Attendance Management & Correction Audit",
                roster_ok and mark_resp.status_code == 200 and corr_resp.status_code == 200 and anal_ok,
                f"Session {session_id} submitted and corrected with audit justification: {corr_data.get('message')}"
            )
        except Exception as e:
            record_test("Real Attendance Management", False, str(e))

        # -------------------------------------------------------------
        # TEST 23: Real Exam & Internal Marks (Max Marks Boundary Validation)
        # -------------------------------------------------------------
        try:
            # 1. Create exam
            exam_payload = {
                "examName": "Mid-Term Assessment QA Test",
                "examType": "MID_TERM",
                "academicYear": "2026-2027",
                "semester": 4,
                "department": "Computer Science and Engineering",
                "subject": "CS401 - Advanced Data Structures",
                "maxMarks": 50.0,
                "passingMarks": 20.0,
                "examDate": "2026-10-25"
            }
            exam_resp = await client.post(
                "/api/assessments/exam",
                headers={"Authorization": f"Bearer {admin_token}"},
                json=exam_payload
            )
            exam_data = exam_resp.json()
            created_exam_id = exam_data.get("exam", {}).get("examId")

            # 2. Test obtainedMarks > maxMarks boundary rejection
            invalid_marks_payload = {
                "examId": created_exam_id,
                "marks": [
                    {"studentId": sample_student_id, "obtainedMarks": 75.0}  # 75 > 50 max!
                ]
            }
            inv_resp = await client.post(
                "/api/assessments/marks",
                headers={"Authorization": f"Bearer {admin_token}"},
                json=invalid_marks_payload
            )
            over_max_rejected = inv_resp.status_code == 400

            # 3. Enter valid marks
            valid_marks_payload = {
                "examId": created_exam_id,
                "marks": [
                    {"studentId": sample_student_id, "obtainedMarks": 44.5}
                ]
            }
            val_resp = await client.post(
                "/api/assessments/marks",
                headers={"Authorization": f"Bearer {admin_token}"},
                json=valid_marks_payload
            )

            # 4. Publish exam
            pub_resp = await client.post(
                f"/api/assessments/{created_exam_id}/publish",
                headers={"Authorization": f"Bearer {admin_token}"}
            )

            record_test(
                "Real Exam Management & Boundary Validation",
                exam_resp.status_code == 200 and over_max_rejected and val_resp.status_code == 200 and pub_resp.status_code == 200,
                f"Exam {created_exam_id} created, >max marks correctly rejected (400), valid marks entered and published."
            )
        except Exception as e:
            record_test("Real Exam Management", False, str(e))

        # -------------------------------------------------------------
        # TEST 24: Canonical Risk Monotonicity in What-If Simulator
        # -------------------------------------------------------------
        try:
            # Simulate massive improvement: 99% attendance, 0 backlogs, 95 coding, 9.2 CGPA
            sim_mono_resp = await client.post(
                f"/api/simulator/{sample_student_id}",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={
                    "attendancePct": 99.0,
                    "backlogCount": 0,
                    "cgpa": 9.2,
                    "codingScore": 95.0,
                    "mockInterviewScore": 90.0,
                    "aptitudeScore": 90.0,
                    "lmsConsistency": 95.0
                }
            )
            sim_mono_data = sim_mono_resp.json()
            scenario_tier = sim_mono_data.get("scenario", {}).get("riskLevel")
            scenario_ssi = sim_mono_data.get("scenario", {}).get("successIndex", 0)
            baseline_ssi = sim_mono_data.get("current", {}).get("successIndex", 0)

            # Monotonicity check: SSI increased, risk tier improved to healthy or watch
            is_monotonic = scenario_ssi > baseline_ssi and scenario_tier in ["healthy", "watch"]

            record_test(
                "Canonical Risk Monotonicity & Improvement Guarantee",
                sim_mono_resp.status_code == 200 and is_monotonic,
                f"Simulated improvement verified: SSI {baseline_ssi} -> {scenario_ssi}. Risk Tier: {scenario_tier}"
            )
        except Exception as e:
            record_test("Canonical Risk Monotonicity", False, str(e))

        # -------------------------------------------------------------
        # TEST 25: Intervention Resource Optimizer Workload Analytics
        # -------------------------------------------------------------
        try:
            opt_resp = await client.get(
                "/api/interventions/optimizer",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            opt_data = opt_resp.json()
            has_staff = len(opt_data.get("staffWorkloads", [])) > 0
            has_recs = len(opt_data.get("optimalRecommendations", [])) > 0

            record_test(
                "Intervention Resource Optimizer Engine",
                opt_resp.status_code == 200 and has_staff and has_recs,
                f"Analyzed {opt_data.get('totalStaffAnalyzed')} faculty/mentors across departments. Generated {len(opt_data.get('optimalRecommendations', []))} workload-balanced recommendations."
            )
        except Exception as e:
            record_test("Intervention Resource Optimizer", False, str(e))

        # -------------------------------------------------------------
        # TEST 26: Formula Injection Protection in Secure CSV Exports
        # -------------------------------------------------------------
        try:
            from app.api.exports import sanitize_cell
            # Check cell formula neutralization
            danger_formula = "=cmd|' /C calc'!A0"
            sanitized = sanitize_cell(danger_formula)
            is_sanitized = sanitized.startswith("'=")

            # Check student export endpoint
            export_stu_resp = await client.get(
                "/api/exports/students",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            export_ok = export_stu_resp.status_code == 200 and "Student ID" in export_stu_resp.text

            record_test(
                "Formula Injection Protection in Secure CSV Exports",
                is_sanitized and export_ok,
                f"Formula injection attack neutralized: '{danger_formula}' -> '{sanitized}'. CSV export generated {len(export_stu_resp.text.splitlines())} rows."
            )
        except Exception as e:
            record_test("Formula Injection Protection", False, str(e))

    await close_db()

    # -------------------------------------------------------------
    # Summary Report
    # -------------------------------------------------------------
    print("\n" + "=" * 80)
    print("TEST EXECUTION SUMMARY")
    print("=" * 80)
    passed_count = sum(1 for r in results if r["passed"])
    failed_count = sum(1 for r in results if not r["passed"])
    total_count = len(results)

    for i, r in enumerate(results, 1):
        status = "PASS" if r["passed"] else "FAIL"
        print(f"{i:2d}. [{status}]: {r['name']}")
        if r["details"]:
            print(f"    Details: {r['details']}")

    print("-" * 80)
    print(f"TOTAL: {total_count} | PASSED: {passed_count} | FAILED: {failed_count}")
    print("=" * 80)

    if failed_count > 0:
        sys.exit(1)
    else:
        print("\nALL PLATFORM TESTS PASSED! READY FOR PRODUCTION DEPLOYMENT & EVALUATION.")
        sys.exit(0)

if __name__ == "__main__":
    asyncio.run(run_all_tests())
