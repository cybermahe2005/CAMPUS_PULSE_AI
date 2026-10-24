"""API Router - Health Check with DB status."""
from fastapi import APIRouter
from datetime import datetime, timezone
from app.core import database as db_mod

router = APIRouter()


@router.get("/health", summary="Health check")
@router.get("/api/health", summary="Health check alias")
async def health():
    db_status = "unknown"
    db_name = None
    try:
        if db_mod.client is not None:
            await db_mod.client.admin.command("ping")
            db_status = "connected"
            db_name = db_mod.db.name if db_mod.db is not None else None
        else:
            db_status = "not_initialized"
    except Exception as e:
        db_status = f"error: {str(e)[:80]}"

    return {
        "status": "ok",
        "service": "CampusPulseAI Backend",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": {
            "status": db_status,
            "name": db_name,
        },
    }