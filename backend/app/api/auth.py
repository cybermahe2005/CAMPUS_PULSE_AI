"""API Router — Authentication with persistent MongoDB users, bcrypt hashing, and password management."""
from fastapi import APIRouter, HTTPException, Depends, status
from datetime import datetime, timezone
from typing import Optional, List
import re

from app.core.security import (
    create_access_token, get_current_user,
    hash_password, verify_password, require_admin, require_institution
)
from app.core.database import get_db
from app.schemas.auth import (
    Token, LoginRequest, ChangePasswordRequest, UserInfo, UserRole, TokenData
)

router = APIRouter()

# ── Seed Registry for initial bootstrapping ───────────────────────────────────
BOOTSTRAP_USERS = {
    # ── Administrators ─────────────────────────────────────────────────────────
    "admin": {
        "userId": "ADM001",
        "name": "Dr. Meenakshi Patel",
        "role": UserRole.ADMIN,
        "department": None,
        "password": "admin123",
        "email": "admin@campus.edu",
        "responsibilities": ["SYSTEM_ADMIN"],
    },
    "demo": {
        "userId": "DEMO01",
        "name": "Demo Administrator",
        "role": UserRole.ADMIN,
        "department": None,
        "password": "demo",
        "email": "demo@campus.edu",
        "responsibilities": ["SYSTEM_ADMIN"],
    },

    # ── Institution Leadership ─────────────────────────────────────────────────
    "js": {
        "userId": "JS001",
        "name": "Mr. Arjun Mehta",
        "role": UserRole.JOINT_SECRETARY,
        "department": None,
        "password": "js123",
        "email": "js@campus.edu",
        "responsibilities": ["INSTITUTION_ANALYTICS", "ROLE_MANAGEMENT", "STUDENT_IMPORT"],
    },
    "principal": {
        "userId": "PRN001",
        "name": "Dr. Sunita Krishnan",
        "role": UserRole.PRINCIPAL,
        "department": None,
        "password": "principal123",
        "email": "principal@campus.edu",
        "responsibilities": ["INSTITUTION_MONITORING", "ACADEMIC_OVERSIGHT"],
    },

    # ── Department Leadership (HODs) ───────────────────────────────────────────
    "hod": {
        "userId": "HOD001",
        "name": "Prof. Rajan Sharma",
        "role": UserRole.HOD,
        "department": "Computer Science",
        "password": "hod123",
        "email": "hod.cs@campus.edu",
        "responsibilities": ["DEPARTMENT_OVERSIGHT"],
    },
    "hod_ec": {
        "userId": "HOD002",
        "name": "Prof. Kavitha Reddy",
        "role": UserRole.HOD,
        "department": "Electronics",
        "password": "hod123",
        "email": "hod.ec@campus.edu",
        "responsibilities": ["DEPARTMENT_OVERSIGHT"],
    },
    "hod_me": {
        "userId": "HOD003",
        "name": "Prof. Suresh Babu",
        "role": UserRole.HOD,
        "department": "Mechanical",
        "password": "hod123",
        "email": "hod.me@campus.edu",
        "responsibilities": ["DEPARTMENT_OVERSIGHT"],
    },
    "hod_cv": {
        "userId": "HOD004",
        "name": "Prof. Rajesh Gupta",
        "role": UserRole.HOD,
        "department": "Civil",
        "password": "hod123",
        "email": "hod.cv@campus.edu",
        "responsibilities": ["DEPARTMENT_OVERSIGHT"],
    },
    "hod_mba": {
        "userId": "HOD005",
        "name": "Prof. Preeti Sinha",
        "role": UserRole.HOD,
        "department": "MBA",
        "password": "hod123",
        "email": "hod.mba@campus.edu",
        "responsibilities": ["DEPARTMENT_OVERSIGHT"],
    },

    # ── Faculty, Class Advisor & Mentor ────────────────────────────────────────
    "faculty": {
        "userId": "FAC001",
        "name": "Ms. Priya Nair",
        "role": UserRole.FACULTY,
        "department": "Computer Science",
        "password": "faculty123",
        "email": "faculty@campus.edu",
        "responsibilities": ["CLASS_ADVISOR"],
        "classIds": ["CSE-A-2027", "CS23"],
    },
    "advisor": {
        "userId": "ADV001",
        "name": "Ms. Lakshmi Iyer",
        "role": UserRole.CLASS_ADVISOR,
        "department": "Electronics",
        "password": "advisor123",
        "email": "advisor@campus.edu",
        "responsibilities": ["CLASS_ADVISOR"],
        "classIds": ["ECE-A-2027", "EC23"],
    },
    "mentor": {
        "userId": "MEN001",
        "name": "Mr. Deepak Sharma",
        "role": UserRole.MENTOR,
        "department": "Computer Science",
        "password": "mentor123",
        "email": "mentor@campus.edu",
        "responsibilities": ["MENTOR"],
        "menteeIds": ["CS22001", "CS22002", "CS22003", "CS22004"],
    },
    "faculty_ec": {
        "userId": "FAC002",
        "name": "Dr. Anirudh Sen",
        "role": UserRole.FACULTY,
        "department": "Electronics",
        "password": "faculty123",
        "email": "faculty.ec@campus.edu",
        "responsibilities": ["FACULTY"],
        "classIds": ["ECE-B-2027"],
    },
    "mentor_ec": {
        "userId": "MEN002",
        "name": "Ms. Shweta Rao",
        "role": UserRole.MENTOR,
        "department": "Electronics",
        "password": "mentor123",
        "email": "mentor.ec@campus.edu",
        "responsibilities": ["MENTOR"],
        "menteeIds": ["EC22001", "EC22002"],
    },
    "faculty_me": {
        "userId": "FAC003",
        "name": "Prof. Vinod Nair",
        "role": UserRole.FACULTY,
        "department": "Mechanical",
        "password": "faculty123",
        "email": "faculty.me@campus.edu",
        "responsibilities": ["FACULTY"],
        "classIds": ["ME-A-2027"],
    },
    "mentor_me": {
        "userId": "MEN003",
        "name": "Dr. Manoj Kumar",
        "role": UserRole.MENTOR,
        "department": "Mechanical",
        "password": "mentor123",
        "email": "mentor.me@campus.edu",
        "responsibilities": ["MENTOR"],
        "menteeIds": ["ME22001", "ME22002"],
    },
    "faculty_cv": {
        "userId": "FAC004",
        "name": "Dr. Ramesh Chandra",
        "role": UserRole.FACULTY,
        "department": "Civil",
        "password": "faculty123",
        "email": "faculty.cv@campus.edu",
        "responsibilities": ["FACULTY"],
        "classIds": ["CV-A-2027"],
    },
    "mentor_cv": {
        "userId": "MEN004",
        "name": "Ms. Deepa Menon",
        "role": UserRole.MENTOR,
        "department": "Civil",
        "password": "mentor123",
        "email": "mentor.cv@campus.edu",
        "responsibilities": ["MENTOR"],
        "menteeIds": ["CV22001"],
    },
    "faculty_mba": {
        "userId": "FAC005",
        "name": "Dr. Shalini Verma",
        "role": UserRole.FACULTY,
        "department": "MBA",
        "password": "faculty123",
        "email": "faculty.mba@campus.edu",
        "responsibilities": ["FACULTY"],
        "classIds": ["MBA-A-2027"],
    },
    "mentor_mba": {
        "userId": "MEN005",
        "name": "Prof. Amit Saxena",
        "role": UserRole.MENTOR,
        "department": "MBA",
        "password": "mentor123",
        "email": "mentor.mba@campus.edu",
        "responsibilities": ["MENTOR"],
        "menteeIds": ["MBA22001"],
    },

    # ── Placement Team ──────────────────────────────────────────────────────────
    "placement": {
        "userId": "PLC001",
        "name": "Mr. Vikram Gupta",
        "role": UserRole.PLACEMENT_COORDINATOR,
        "department": None,
        "password": "placement123",
        "email": "placement@campus.edu",
        "responsibilities": ["PLACEMENT_COORDINATOR"],
    },
    "placement_cs": {
        "userId": "PLC002",
        "name": "Ms. Meena Joshi",
        "role": UserRole.PLACEMENT_COORDINATOR,
        "department": "Computer Science",
        "password": "placement123",
        "email": "placement.cs@campus.edu",
        "responsibilities": ["PLACEMENT_COORDINATOR"],
    },

    # ── Demo Students ───────────────────────────────────────────────────────────
    "student": {
        "userId": "STU001",
        "name": "Arun Kumar",
        "role": UserRole.STUDENT,
        "department": "Computer Science",
        "password": "student123",
        "email": "stu001@campus.edu",
    },
    "stu001": {
        "userId": "STU001",
        "name": "Arun Kumar",
        "role": UserRole.STUDENT,
        "department": "Computer Science",
        "password": "stu001",
        "email": "stu001@campus.edu",
    },
    "stu002": {
        "userId": "STU002",
        "name": "Priya Devi",
        "role": UserRole.STUDENT,
        "department": "Electronics",
        "password": "stu002",
        "email": "stu002@campus.edu",
    },
    "stu003": {
        "userId": "STU003",
        "name": "Ravi Shankar",
        "role": UserRole.STUDENT,
        "department": "Mechanical",
        "password": "stu003",
        "email": "stu003@campus.edu",
    },
    "stu004": {
        "userId": "STU004",
        "name": "Lakshmi Reddy",
        "role": UserRole.STUDENT,
        "department": "Computer Science",
        "password": "stu004",
        "email": "stu004@campus.edu",
    },
    "stu005": {
        "userId": "STU005",
        "name": "Rahul Patel",
        "role": UserRole.STUDENT,
        "department": "Computer Science",
        "password": "stu005",
        "email": "stu005@campus.edu",
    },
    "stu006": {
        "userId": "STU006",
        "name": "Ananya Singh",
        "role": UserRole.STUDENT,
        "department": "Computer Science",
        "password": "stu006",
        "email": "stu006@campus.edu",
    },
    "stu007": {
        "userId": "STU007",
        "name": "Karthik Nair",
        "role": UserRole.STUDENT,
        "department": "Computer Science",
        "password": "stu007",
        "email": "stu007@campus.edu",
    },

    # ── Class Representative ────────────────────────────────────────────────────
    "cr001": {
        "userId": "STU_CR001",
        "name": "Siddharth Joshi",
        "role": UserRole.CLASS_REPRESENTATIVE,
        "department": "Computer Science",
        "password": "cr001",
        "email": "cr001@campus.edu",
        "responsibilities": ["CLASS_REPRESENTATIVE"],
    },
}


async def bootstrap_initial_users():
    """Seed and sync all initial administrative, leadership, faculty, and mentor accounts into db.users."""
    db = await get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    for uname, raw in BOOTSTRAP_USERS.items():
        uid = raw.get("userId", uname)
        existing = await db.users.find_one({"userId": uid})
        role_val = raw["role"].value if hasattr(raw["role"], "value") else str(raw["role"])
        doc = {
            "userId": uid,
            "username": uname,
            "name": raw["name"],
            "role": role_val,
            "department": raw.get("department"),
            "email": raw.get("email"),
            "responsibilities": raw.get("responsibilities", []),
            "classIds": raw.get("classIds", []),
            "menteeIds": raw.get("menteeIds", []),
            "mustChangePassword": False,
            "isActive": True,
            "updatedAt": now_iso,
        }
        if not existing:
            doc["passwordHash"] = hash_password(raw["password"])
            doc["createdAt"] = now_iso
            await db.users.insert_one(doc)
        else:
            await db.users.update_one({"userId": uid}, {"$set": doc})


async def _get_or_sync_user(username: str, db):
    """Find user in DB. If not found, check bootstrap registry or students collection."""
    uname = username.strip().lower()

    # 1. Search in users collection
    user = await db.users.find_one({
        "$or": [
            {"username": {"$regex": f"^{re.escape(uname)}$", "$options": "i"}},
            {"userId": {"$regex": f"^{re.escape(uname)}$", "$options": "i"}},
            {"email": {"$regex": f"^{re.escape(uname)}$", "$options": "i"}},
        ]
    })
    if user:
        return user

    # 2. Check bootstrap registry
    if uname in BOOTSTRAP_USERS:
        raw = BOOTSTRAP_USERS[uname]
        new_doc = {
            "userId": raw.get("userId", uname),
            "username": uname,
            "name": raw["name"],
            "role": raw["role"].value if hasattr(raw["role"], "value") else str(raw["role"]),
            "department": raw.get("department"),
            "email": raw.get("email"),
            "passwordHash": hash_password(raw["password"]),
            "responsibilities": raw.get("responsibilities", []),
            "classIds": raw.get("classIds", []),
            "menteeIds": raw.get("menteeIds", []),
            "mustChangePassword": False,
            "isActive": True,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.update_one({"userId": new_doc["userId"]}, {"$set": new_doc}, upsert=True)
        return new_doc

    # 3. Check students collection (for any enrolled or CSV-imported student)
    student = await db.students.find_one({
        "$or": [
            {"studentId": {"$regex": f"^{re.escape(uname)}$", "$options": "i"}},
            {"rollNo": {"$regex": f"^{re.escape(uname)}$", "$options": "i"}},
            {"email": {"$regex": f"^{re.escape(uname)}$", "$options": "i"}},
        ]
    })
    if student:
        sid = student.get("studentId") or student.get("rollNo")
        # Default bootstrap credential for students: "Student@123"
        new_doc = {
            "userId": sid,
            "username": sid.lower(),
            "name": student.get("name", sid),
            "role": UserRole.STUDENT.value,
            "department": student.get("department"),
            "email": student.get("email"),
            "passwordHash": hash_password("Student@123"),
            "responsibilities": [],
            "classIds": [],
            "menteeIds": [],
            "mustChangePassword": True,
            "isActive": True,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.update_one({"userId": sid}, {"$set": new_doc}, upsert=True)
        return new_doc

    return None


@router.post("/login", response_model=Token, summary="Authenticate and get JWT token")
async def login(request: LoginRequest):
    db = await get_db()
    user = await _get_or_sync_user(request.username, db)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Password check: verify bcrypt hash, or check default initial password
    password_valid = False
    hashed = user.get("passwordHash")
    if hashed and verify_password(request.password, hashed):
        password_valid = True
    elif request.password in ["Student@123", request.username.lower()]:
        # Fallback for unmigrated student accounts
        password_valid = True
        # Upgrade to secure hash immediately
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"passwordHash": hash_password(request.password)}}
        )

    if not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not user.get("isActive", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Contact institutional administrator.",
        )

    uid = user.get("userId", request.username.lower())
    role_str = user.get("role", UserRole.STUDENT.value)
    responsibilities = user.get("responsibilities", [])
    class_ids = user.get("classIds", [])
    mentee_ids = user.get("menteeIds", [])
    must_change = bool(user.get("mustChangePassword", False))

    token_data = {
        "sub": uid,
        "role": role_str,
        "department": user.get("department"),
        "name": user.get("name", ""),
        "responsibilities": responsibilities,
        "classIds": class_ids,
        "menteeIds": mentee_ids,
        "mustChangePassword": must_change,
    }
    access_token = create_access_token(token_data)

    # Record login timestamp
    await db.users.update_one(
        {"userId": uid},
        {"$set": {"lastLogin": datetime.now(timezone.utc).isoformat()}}
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        mustChangePassword=must_change,
        user=UserInfo(
            userId=uid,
            name=user.get("name", uid),
            role=UserRole(role_str) if role_str in [r.value for r in UserRole] else UserRole.STUDENT,
            responsibilities=responsibilities,
            department=user.get("department"),
            email=user.get("email"),
            mustChangePassword=must_change,
            classIds=class_ids,
            menteeIds=mentee_ids,
        ),
    )


@router.post("/change-password", summary="Change current user password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: TokenData = Depends(get_current_user),
):
    db = await get_db()
    user = await db.users.find_one({"userId": current_user.userId})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_pw = req.old_password or req.currentPassword
    new_pw = req.new_password or req.newPassword

    if not old_pw or not new_pw:
        raise HTTPException(status_code=400, detail="Both current and new passwords are required")

    # Verify old password
    if not verify_password(old_pw, user.get("passwordHash", "")):
        # Check if old password was default
        if old_pw != "Student@123" and old_pw != current_user.userId.lower():
            raise HTTPException(status_code=400, detail="Current password does not match")

    if old_pw == new_pw:
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    # Password policy: at least 8 chars, at least 1 digit or special character
    if len(new_pw) < 8 or not re.search(r"[0-9!@#$%^&*(),.?\":{}|<>]", new_pw):
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters long and contain at least one number or special character",
        )

    # Update hash and clear mustChangePassword flag
    new_hash = hash_password(new_pw)
    await db.users.update_one(
        {"userId": current_user.userId},
        {
            "$set": {
                "passwordHash": new_hash,
                "mustChangePassword": False,
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }
        }
    )

    # Audit log
    await db.audit_logs.insert_one({
        "action": "CHANGE_PASSWORD",
        "userId": current_user.userId,
        "name": current_user.name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {"ok": True, "message": "Password changed successfully", "mustChangePassword": False}


@router.get("/me", response_model=UserInfo, summary="Get current user profile")
async def me(current_user: TokenData = Depends(get_current_user)):
    db = await get_db()
    user = await db.users.find_one({"userId": current_user.userId}, {"_id": 0, "passwordHash": 0})
    if user:
        return UserInfo(
            userId=user.get("userId", current_user.userId),
            name=user.get("name", current_user.name),
            role=UserRole(user.get("role", current_user.role.value)),
            responsibilities=user.get("responsibilities", current_user.responsibilities),
            department=user.get("department", current_user.department),
            email=user.get("email"),
            mustChangePassword=bool(user.get("mustChangePassword", False)),
            classIds=user.get("classIds", current_user.classIds),
            menteeIds=user.get("menteeIds", current_user.menteeIds),
        )
    return UserInfo(
        userId=current_user.userId,
        name=current_user.name,
        role=current_user.role,
        responsibilities=current_user.responsibilities,
        department=current_user.department,
        mustChangePassword=current_user.mustChangePassword,
        classIds=current_user.classIds,
        menteeIds=current_user.menteeIds,
    )


@router.get("/users", summary="List users (Admin & Leadership only)")
async def list_users(current_user: TokenData = Depends(require_institution)):
    db = await get_db()
    users = await db.users.find(
        {},
        {"passwordHash": 0, "_id": 0}
    ).sort("createdAt", -1).limit(100).to_list(100)
    return users
