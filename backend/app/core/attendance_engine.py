"""
Campus Pulse AI - Core Attendance & Timetable Access Control Engine
Enforces server-authoritative period-based access, session lifecycle states,
role-based permissions, and parent contact privacy.
"""
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple, List
import pytz

# Standard Institutional Timetable Period Configuration
PERIOD_TIMETABLE: Dict[int, Tuple[str, str]] = {
    1: ("09:00", "09:50"),
    2: ("09:50", "10:40"),
    3: ("10:55", "11:45"),
    4: ("11:45", "12:35"),
    5: ("13:25", "14:15"),
    6: ("14:15", "15:05"),
    7: ("15:20", "16:10"),
    8: ("16:10", "17:00"),
}

INSTITUTION_TIMEZONE = pytz.timezone("Asia/Kolkata")


def get_current_ist_time() -> datetime:
    """Returns the current server time in the institution's timezone (IST)."""
    return datetime.now(INSTITUTION_TIMEZONE)


def parse_time_on_date(date_str: str, time_str: str) -> datetime:
    """Parses date 'YYYY-MM-DD' and time 'HH:MM' into timezone-aware datetime."""
    dt_naive = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
    return INSTITUTION_TIMEZONE.localize(dt_naive)


def evaluate_session_window(
    session_date: str,
    period: int,
    scheduled_start: Optional[str] = None,
    scheduled_end: Optional[str] = None,
    allow_testing_window: bool = False,
    is_cancelled: bool = False,
    is_already_completed: bool = False,
) -> Dict[str, Any]:
    """
    Evaluates timetable-based access window.
    States:
      - CANCELLED: The session was cancelled.
      - UPCOMING: Current time < start time. Message: 'Attendance access will open at [start_time].'
      - OPEN: Start time <= Current time <= End time. Normal marking allowed.
      - CLOSED: Current time > End time and completed. Message: 'Attendance marking is closed. This period ended at [end_time].'
      - INCOMPLETE: Current time > End time and NOT completed.
    """
    if is_cancelled:
        return {
            "status": "CANCELLED",
            "isOpen": False,
            "message": "This period was formally cancelled by departmental leadership.",
            "remainingSeconds": 0,
            "period": period,
            "startTime": scheduled_start,
            "endTime": scheduled_end,
        }

    # Derive start/end from standard timetable if not provided
    if not scheduled_start or not scheduled_end:
        scheduled_start, scheduled_end = PERIOD_TIMETABLE.get(period, ("09:00", "09:50"))

    now = get_current_ist_time()

    # If testing override is enabled, allow open marking window
    if allow_testing_window:
        return {
            "status": "OPEN",
            "isOpen": True,
            "message": f"Testing window active. Session open until {scheduled_end}.",
            "remainingSeconds": 1800,
            "period": period,
            "startTime": scheduled_start,
            "endTime": scheduled_end,
            "currentTime": now.strftime("%H:%M"),
            "currentDate": now.strftime("%Y-%m-%d"),
        }

    try:
        start_dt = parse_time_on_date(session_date, scheduled_start)
        end_dt = parse_time_on_date(session_date, scheduled_end)
    except Exception:
        return {
            "status": "CLOSED",
            "isOpen": False,
            "message": "Invalid session schedule or date format.",
            "remainingSeconds": 0,
            "period": period,
            "startTime": scheduled_start,
            "endTime": scheduled_end,
        }

    if now < start_dt:
        seconds_to_open = int((start_dt - now).total_seconds())
        return {
            "status": "UPCOMING",
            "isOpen": False,
            "message": f"Attendance access will open at {scheduled_start}.",
            "remainingSeconds": max(0, seconds_to_open),
            "period": period,
            "startTime": scheduled_start,
            "endTime": scheduled_end,
            "currentTime": now.strftime("%H:%M"),
            "currentDate": now.strftime("%Y-%m-%d"),
        }
    elif start_dt <= now <= end_dt:
        seconds_to_close = int((end_dt - now).total_seconds())
        return {
            "status": "OPEN",
            "isOpen": True,
            "message": f"Attendance marking is OPEN. Period closes at {scheduled_end}.",
            "remainingSeconds": max(0, seconds_to_close),
            "period": period,
            "startTime": scheduled_start,
            "endTime": scheduled_end,
            "currentTime": now.strftime("%H:%M"),
            "currentDate": now.strftime("%Y-%m-%d"),
        }
    else:
        # Period has ended
        final_status = "CLOSED" if is_already_completed else "INCOMPLETE"
        return {
            "status": final_status,
            "isOpen": False,
            "message": f"Attendance marking is closed. This period ended at {scheduled_end}.",
            "remainingSeconds": 0,
            "period": period,
            "startTime": scheduled_start,
            "endTime": scheduled_end,
            "currentTime": now.strftime("%H:%M"),
            "currentDate": now.strftime("%Y-%m-%d"),
        }


def check_faculty_assignment_match(
    user_id: str,
    user_role: str,
    user_department: Optional[str],
    assignment: Optional[Dict[str, Any]],
    is_ca_submission: bool = False,
) -> Tuple[bool, str]:
    """
    Validates whether the user is authorized to mark attendance for this specific assignment.
    Rules:
      - JOINT_SECRETARY, PRINCIPAL, STUDENT, CLASS_REPRESENTATIVE: strictly forbidden from writing attendance.
      - HOD: Authorized if department matches.
      - FACULTY / CLASS_ADVISOR:
        - If regular session: user must be assigned subjectFacultyId or substituteFacultyId.
        - If CA submission: user must be assigned classAdvisorId for this class.
    """
    role_upper = (user_role or "").upper()
    if role_upper in ["JOINT_SECRETARY", "PRINCIPAL"]:
        return False, f"Role '{role_upper}' has read-only institutional access and cannot mark or edit attendance."
    if role_upper in ["STUDENT", "CLASS_REPRESENTATIVE"]:
        return False, f"Role '{role_upper}' cannot mark or modify attendance records."

    if not assignment:
        # If no explicit assignment exists in timetable, deny access
        return False, "No active timetable faculty assignment exists for this class, subject, and period."

    if assignment.get("status") != "ACTIVE":
        return False, "This timetable faculty assignment is currently INACTIVE or cancelled."

    # Department match check
    assign_dept = assignment.get("department")
    if role_upper in ["HOD", "FACULTY", "CLASS_ADVISOR"] and user_department:
        if user_department != assign_dept:
            return False, f"Cross-department attendance marking is prohibited. User belongs to '{user_department}', assignment belongs to '{assign_dept}'."

    # Admin has system-wide oversight
    if role_upper == "ADMIN":
        return True, "Administrator authorized with full access."

    # HOD can oversee submissions within their department
    if role_upper == "HOD":
        return True, "HOD authorized for departmental session."

    subject_fac = assignment.get("subjectFacultyId")
    substitute_fac = assignment.get("substituteFacultyId")
    class_advisor = assignment.get("classAdvisorId")

    if is_ca_submission:
        if user_id == class_advisor:
            return True, "Class Advisor authorized."
        return False, f"User {user_id} is not the designated Class Advisor ({class_advisor}) for this class."

    # Subject faculty submission
    if user_id in [subject_fac, substitute_fac]:
        return True, "Assigned subject faculty authorized."

    return False, f"User {user_id} is not assigned to teach {assignment.get('subjectName')} (Period {assignment.get('period')}). Assigned faculty is {assignment.get('subjectFacultyName')} ({subject_fac})."
