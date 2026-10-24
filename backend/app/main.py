"""
Campus Pulse AI - FastAPI Application Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import connect_db, close_db
from app.api import (
    health, auth, students, dashboard, predictions, simulator,
    interventions, placement, copilot, data_quality, jobs, student_placement,
    csv_import, attendance, assessments, exports
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    await connect_db()
    try:
        from app.api.auth import bootstrap_initial_users
        await bootstrap_initial_users()
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").warning(f"Could not bootstrap initial users: {e}")
    yield
    await close_db()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Campus Pulse AI - Student Success Decision Intelligence Platform",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core Routers
app.include_router(health.router, tags=["Health"])
app.include_router(auth.router,            prefix="/api/auth",          tags=["Auth"])
app.include_router(students.router,        prefix="/api/students",      tags=["Students"])
app.include_router(dashboard.router,       prefix="/api/dashboard",     tags=["Dashboard"])
app.include_router(predictions.router,     prefix="/api/predictions",   tags=["Predictions"])
app.include_router(simulator.router,       prefix="/api/simulator",     tags=["Simulator"])
app.include_router(interventions.router,   prefix="/api/interventions", tags=["Interventions"])

# Placement Routers
app.include_router(placement.router,         prefix="/api/placement",          tags=["Placement"])
app.include_router(jobs.router,              prefix="/api/jobs",               tags=["Jobs"])
app.include_router(student_placement.router, prefix="/api/student/placement",  tags=["Student Placement"])

# Supporting Routers
app.include_router(copilot.router,      prefix="/api/copilot",      tags=["Copilot"])
app.include_router(data_quality.router, prefix="/api/data-quality", tags=["Data Quality"])
app.include_router(csv_import.router,   prefix="/api/csv-import",   tags=["CSV Import"])
app.include_router(attendance.router,   prefix="/api/attendance",   tags=["Attendance"])
app.include_router(assessments.router,  prefix="/api/assessments",  tags=["Assessments"])
app.include_router(exports.router,      prefix="/api/exports",      tags=["Exports"])