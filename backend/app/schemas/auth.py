"""Pydantic schemas — Auth and Token models."""
from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional, List


class UserRole(str, Enum):
    # System & Institution leadership
    ADMIN                  = "ADMIN"                  # system administrator
    JOINT_SECRETARY        = "JOINT_SECRETARY"        # institution-wide analytics & management
    PRINCIPAL              = "PRINCIPAL"              # institution-wide academic oversight
    # Department leadership
    HOD                    = "HOD"                    # assigned department scope
    # Faculty & academic roles
    FACULTY                = "FACULTY"                # faculty assigned scope
    CLASS_ADVISOR          = "CLASS_ADVISOR"          # class / section advisor
    MENTOR                 = "MENTOR"                 # assigned mentee scope
    # Placement
    PLACEMENT_COORDINATOR  = "PLACEMENT_COORDINATOR"  # placement management
    PLACEMENT_OFFICER      = "PLACEMENT_OFFICER"      # alias for placement coordinator
    # Students
    STUDENT                = "STUDENT"                # self-only access
    CLASS_REPRESENTATIVE   = "CLASS_REPRESENTATIVE"   # student with aggregate class info


class FacultyResponsibility(str, Enum):
    CLASS_ADVISOR          = "CLASS_ADVISOR"
    MENTOR                 = "MENTOR"
    PLACEMENT_COORDINATOR  = "PLACEMENT_COORDINATOR"


class StudentResponsibility(str, Enum):
    CLASS_REPRESENTATIVE   = "CLASS_REPRESENTATIVE"


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: Optional[str] = None
    new_password: Optional[str] = None
    currentPassword: Optional[str] = None
    newPassword: Optional[str] = None


class UserInfo(BaseModel):
    userId: str
    name: str
    role: UserRole
    responsibilities: List[str] = []
    department: Optional[str] = None
    email: Optional[str] = None
    mustChangePassword: bool = False
    classIds: List[str] = []
    menteeIds: List[str] = []


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo
    mustChangePassword: bool = False


class TokenData(BaseModel):
    userId: str
    role: UserRole
    department: Optional[str] = None
    name: str = ""
    responsibilities: List[str] = []
    classIds: List[str] = []
    menteeIds: List[str] = []
    mustChangePassword: bool = False


Token.model_rebuild()
