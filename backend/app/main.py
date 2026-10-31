import base64
import hashlib
import html
import hmac
import io
import json
import os
import secrets
import shutil
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import Image as PDFImage, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import desc, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from .ai import ModelUnavailable, classifier
from .db import Base, MODEL_DIR, REPORT_DIR, SessionLocal, UPLOAD_DIR, engine, get_db
from .migrations import upgrade_existing_schema
from .models import Finding, FindingReviewEvent, Inspection, InspectionImage, IssueTrend, MaintenanceTask, Property, Report, User
from .priority import calculate_priority, REASON_LABELS
from .schemas import (
    AnnotationInput,
    FindingReviewInput,
    InspectionInput,
    IssueTrendInput,
    LoginInput,
    MaintenanceTaskInput,
    MaintenanceTaskUpdateInput,
    PropertyInput,
    RegisterInput,
    UserProfileInput,
)


APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
SAMPLE_DIR = BACKEND_DIR / "samples"
SECRET_KEY = os.getenv("PROPERTY_PULSE_SECRET", "local-demo-secret-change-before-deployment")
TOKEN_TTL_HOURS = int(os.getenv("PROPERTY_PULSE_TOKEN_HOURS", "168"))
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
bearer = HTTPBearer(auto_error=False)

app = FastAPI(
    title="PropertyPulse AI",
    version="1.0.0",
    description="Evidence-led property inspection and maintenance review API.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv(
        "PROPERTY_PULSE_CORS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _issue_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _b64(
        json.dumps(
            {"sub": str(user_id), "iat": int(now.timestamp()), "exp": int((now + timedelta(hours=TOKEN_TTL_HOURS)).timestamp())},
            separators=(",", ":"),
        ).encode()
    )
    message = header + "." + payload
    signature = _b64(hmac.new(SECRET_KEY.encode(), message.encode(), hashlib.sha256).digest())
    return message + "." + signature


def _read_token(token: str) -> int:
    try:
        header, payload, signature = token.split(".")
        message = header + "." + payload
        expected = _b64(hmac.new(SECRET_KEY.encode(), message.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid signature")
        raw = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        data = json.loads(raw)
        if int(data["exp"]) < int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("expired")
        return int(data["sub"])
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.") from exc


def _password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return _b64(salt) + "." + _b64(digest)


def _verify_password(password: str, saved: str | None) -> bool:
    if not saved or "." not in saved:
        return False
    salt_text, digest_text = saved.split(".", 1)
    salt = base64.urlsafe_b64decode(salt_text + "=" * (-len(salt_text) % 4))
    expected = base64.urlsafe_b64decode(digest_text + "=" * (-len(digest_text) % 4))
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return hmac.compare_digest(actual, expected)


def _user_json(user: User):
    return {"id": user.id, "name": user.name, "email": user.email, "is_demo": user.is_demo}


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in to open this workspace.")
    user_id = _read_token(credentials.credentials)
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="This account is no longer available.")
    return user


def _signed_media_url(kind: str, resource_id: str | int, user_id: int) -> str:
    now = int(datetime.now(timezone.utc).timestamp())
    payload = _b64(json.dumps({"kind": kind, "id": str(resource_id), "sub": user_id, "exp": now + 3600}, separators=(",", ":")).encode())
    signature = _b64(hmac.new(SECRET_KEY.encode(), ("media." + payload).encode(), hashlib.sha256).digest())
    return "/api/v1/media/" + payload + "." + signature


def _read_media_token(token: str) -> dict:
    try:
        payload, signature = token.split(".", 1)
        expected = _b64(hmac.new(SECRET_KEY.encode(), ("media." + payload).encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid signature")
        raw = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        data = json.loads(raw)
        if int(data["exp"]) < int(datetime.now(timezone.utc).timestamp()):
            raise ValueError("expired")
        if data.get("kind") not in {"image", "sample"}:
            raise ValueError("invalid media kind")
        return data
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Media not found or link expired.") from exc


def _iso(value):
    return value.isoformat() if value else None


def _finding_json(finding: Finding):
    actions = {
        "high": "Arrange an on-site review by a qualified professional and record the follow-up.",
        "moderate": "Plan a maintenance review and capture a follow-up photo for comparison.",
        "low": "Keep this area under observation and add a dated follow-up photo if needed.",
        "needs_review": "Review the photo and record an inspector observation before deciding on follow-up.",
    }
    return {
        "id": finding.id,
        "image_id": finding.image_id,
        "defect_type": finding.defect_type,
        "source_label": finding.source_label,
        "confidence": finding.confidence,
        "bbox": finding.bbox,
        "evidence_text": finding.evidence_text,
        "model_name": finding.model_name,
        "model_version": finding.model_version,
        "prediction_alternatives": finding.prediction_alternatives or [],
        "priority": finding.priority_override or finding.priority,
        "recommended_priority": finding.priority,
        "priority_override": finding.priority_override,
        "priority_override_reason": finding.priority_override_reason,
        "next_action": actions.get(finding.priority_override or finding.priority, actions["needs_review"]),
        "triage_rule_version": "propertypulse-triage-v2",
        "reason_labels": {code: REASON_LABELS.get(code, code.replace("_", " ").title()) for code in (finding.reason_codes or [])},
        "priority_score": finding.priority_score,
        "reason_codes": finding.reason_codes or [],
        "status": finding.status,
        "reviewer_note": finding.reviewer_note,
        "origin": finding.origin,
        "is_sample": finding.is_sample,
        "created_at": _iso(finding.created_at),
    }


def _image_json(image: InspectionImage, user_id: int):
    path = UPLOAD_DIR / image.storage_key
    quality = _check_image_quality(path) if path.exists() else {"blurry": False, "dark": False, "overexposed": False, "warnings": []}
    return {
        "id": image.id,
        "url": _signed_media_url("image", image.id, user_id),
        "filename": image.original_filename,
        "mime_type": image.mime_type,
        "width": image.width,
        "height": image.height,
        "byte_size": image.byte_size,
        "status": image.status,
        "is_sample": image.is_sample,
        "created_at": _iso(image.created_at),
        "findings": [_finding_json(item) for item in image.findings],
        "quality_warnings": quality.get("warnings", []),
        "quality_flags": {
            "blurry": quality.get("blurry", False),
            "dark": quality.get("dark", False),
            "overexposed": quality.get("overexposed", False),
        },
    }


def _inspection_json(inspection: Inspection, user_id: int):
    return {
        "id": inspection.id,
        "property_id": inspection.property_id,
        "property_name": inspection.property.name if inspection.property else None,
        "area_label": inspection.area_label,
        "inspection_date": _iso(inspection.inspection_date),
        "notes": inspection.notes,
        "context_flags": inspection.context_flags or [],
        "status": inspection.status,
        "created_at": _iso(inspection.created_at),
        "completed_at": _iso(inspection.completed_at),
        "images": [_image_json(item, user_id) for item in inspection.images],
        "finding_count": sum(len(item.findings) for item in inspection.images),
    }


def _property_json(prop: Property, include_inspections: bool = False, user_id: int | None = None):
    payload = {
        "id": prop.id,
        "name": prop.name,
        "property_type": prop.property_type,
        "location_label": prop.location_label,
        "age_band": prop.age_band,
        "notes": prop.notes,
        "cover_image_url": prop.cover_image_url,
        "is_demo": prop.is_demo,
        "demo_key": prop.demo_key,
        "created_at": _iso(prop.created_at),
        "updated_at": _iso(prop.updated_at),
        "inspection_count": len(prop.inspections),
        "last_inspection_date": max(
            (_iso(item.inspection_date) for item in prop.inspections if item.inspection_date), default=None
        ),
    }
    if include_inspections:
        if user_id is None:
            raise ValueError("A user id is required when serializing property images.")
        payload["inspections"] = [_inspection_json(item, user_id) for item in sorted(prop.inspections, key=lambda row: row.inspection_date or row.created_at, reverse=True)]
    return payload


def _task_json(task: MaintenanceTask, property_name: str | None = None):
    return {
        "id": task.id,
        "property_id": task.property_id,
        "property_name": property_name,
        "inspection_id": task.inspection_id,
        "finding_id": task.finding_id,
        "title": task.title,
        "description": task.description,
        "assignee": task.assignee,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "priority": task.priority,
        "status": task.status,
        "completion_note": task.completion_note,
        "created_at": _iso(task.created_at),
        "updated_at": _iso(task.updated_at),
    }


def _trend_json(trend: IssueTrend):
    return {
        "id": trend.id,
        "property_id": trend.property_id,
        "previous_finding_id": trend.previous_finding_id,
        "current_finding_id": trend.current_finding_id,
        "trend_state": trend.trend_state,
        "attribution": trend.attribution,
        "note": trend.note,
        "created_at": _iso(trend.created_at),
    }


def _reviewed_category(finding: Finding) -> str:
    if finding.status == "corrected" and finding.origin != "demo_seed":
        return " ".join(finding.defect_type.casefold().split())
    return (finding.source_label or " ".join(finding.defect_type.casefold().split())).casefold()


def _owned_property(db: Session, property_id: int, user_id: int) -> Property:
    prop = db.scalar(
        select(Property)
        .where(Property.id == property_id, Property.owner_id == user_id)
        .options(selectinload(Property.inspections))
    )
    if prop is None:
        raise HTTPException(status_code=404, detail="Property not found.")
    return prop


def _owned_inspection(db: Session, inspection_id: int, user_id: int) -> Inspection:
    inspection = db.scalar(
        select(Inspection)
        .join(Property)
        .where(Inspection.id == inspection_id, Property.owner_id == user_id)
        .options(
            selectinload(Inspection.property),
            selectinload(Inspection.images).selectinload(InspectionImage.findings),
        )
    )
    if inspection is None:
        raise HTTPException(status_code=404, detail="Inspection not found.")
    return inspection


def _owned_finding(db: Session, finding_id: int, user_id: int) -> Finding:
    finding = db.scalar(
        select(Finding)
        .join(InspectionImage)
        .join(Inspection)
        .join(Property)
        .where(Finding.id == finding_id, Property.owner_id == user_id)
        .options(selectinload(Finding.image).selectinload(InspectionImage.inspection).selectinload(Inspection.property))
    )
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found.")
    return finding


def _seed_demo(db: Session):
    demo = db.scalar(select(User).where(User.email == "demo@propertypulse.ai"))
    if demo is None:
        demo = User(name="Sagar", email="demo@propertypulse.ai", is_demo=True)
        db.add(demo)
        db.flush()
    if not db.scalar(select(func.count(Property.id)).where(Property.owner_id == demo.id)):
        homes = [
            ("Willow & Stone Residence", "Detached home", "Colombo 07", "10–20 years", "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85"),
            ("The Glasshouse", "Apartment", "Rajagiriya", "0–10 years", "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=85"),
            ("Cedar Row House", "Townhouse", "Nawala", "20–40 years", "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=85"),
        ]
        for name, kind, location, age, cover in homes:
            db.add(Property(owner_id=demo.id, name=name, property_type=kind, location_label=location, age_band=age, cover_image_url=cover))
        db.commit()

    inspection_count = db.scalar(
        select(func.count(Inspection.id)).join(Property).where(Property.owner_id == demo.id)
    ) or 0
    if inspection_count or not classifier.ready:
        return

    demo_properties = db.scalars(
        select(Property).where(Property.owner_id == demo.id).order_by(Property.id)
    ).all()
    examples = [
        ("Bathroom", "stain", ["active_moisture"], 21),
        ("Living room", "peeling", [], 10),
        ("Exterior wall", "major_crack", ["worsening"], 4),
    ]
    for prop, (area, label, flags, days_ago) in zip(demo_properties, examples):
        source = SAMPLE_DIR / (label + ".jpg")
        if not source.exists():
            continue
        visit_date = date.today() - timedelta(days=days_ago)
        inspection = Inspection(
            property_id=prop.id,
            area_label=area,
            inspection_date=datetime.combine(visit_date, datetime.min.time(), tzinfo=timezone.utc),
            notes="Dataset sample used to make the demo workspace immediately explorable.",
            context_flags=flags,
            status="complete",
            completed_at=datetime.now(timezone.utc),
        )
        db.add(inspection)
        db.flush()
        storage_key = "demo-" + uuid4().hex + ".jpg"
        destination = UPLOAD_DIR / storage_key
        shutil.copyfile(source, destination)
        with Image.open(destination) as sample_image:
            width, height = sample_image.size
        contents = destination.read_bytes()
        image = InspectionImage(
            inspection_id=inspection.id,
            storage_key=storage_key,
            original_filename=label.replace("_", " ").title() + " sample.jpg",
            mime_type="image/jpeg",
            byte_size=len(contents),
            width=width,
            height=height,
            sha256=hashlib.sha256(contents).hexdigest(),
            status="analyzed",
            is_sample=True,
        )
        db.add(image)
        db.flush()
        output = classifier.classify(destination)
        assessment = calculate_priority(output["source_label"], output["confidence"], flags)
        db.add(Finding(
            image_id=image.id,
            defect_type=output["defect_type"],
            source_label=output["source_label"],
            confidence=output["confidence"],
            evidence_text=output["evidence_text"],
            model_name=output["model_name"],
            model_version=output["model_version"],
            priority=assessment["priority"],
            priority_score=assessment["score"],
            reason_codes=assessment["reason_codes"],
            status="needs_review" if output["uncertain"] else "suggested",
            is_sample=True,
        ))
    db.commit()


@app.on_event("startup")
def initialize():
    Base.metadata.create_all(bind=engine)
    upgrade_existing_schema()
    with SessionLocal() as db:
        _seed_demo(db)


@app.get("/health")
def health():
    return {"status": "ok", "service": "PropertyPulse AI", "model": classifier.status()}


@app.get("/api/v1/media/{media_token}")
def get_signed_media(
    media_token: str,
    db: Annotated[Session, Depends(get_db)],
):
    data = _read_media_token(media_token)
    try:
        user_id = int(data["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=404, detail="Media not found or link expired.") from exc

    if data["kind"] == "image":
        try:
            image_id = int(data["id"])
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=404, detail="Media not found or link expired.") from exc
        image = db.scalar(
            select(InspectionImage)
            .join(Inspection)
            .join(Property)
            .where(InspectionImage.id == image_id, Property.owner_id == user_id)
        )
        if image is None:
            raise HTTPException(status_code=404, detail="Media not found or link expired.")
        path = UPLOAD_DIR / image.storage_key
        media_type = image.mime_type
    else:
        sample_id = str(data.get("id", ""))
        if not sample_id or any(char not in "abcdefghijklmnopqrstuvwxyz0123456789_-" for char in sample_id):
            raise HTTPException(status_code=404, detail="Media not found or link expired.")
        path = SAMPLE_DIR / (sample_id + ".jpg")
        media_type = "image/jpeg"

    if not path.is_file():
        raise HTTPException(status_code=404, detail="Media file is unavailable.")
    return FileResponse(
        path,
        media_type=media_type,
        headers={
            "Content-Disposition": "inline",
            "Cache-Control": "private, max-age=60",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/api/v1/model")
def model_status(user: Annotated[User, Depends(current_user)]):
    return classifier.status()


@app.post("/api/v1/auth/demo")
def demo_login(db: Annotated[Session, Depends(get_db)]):
    user = db.scalar(select(User).where(User.email == "demo@propertypulse.ai"))
    if user is None:
        user = User(name="Sagar", email="demo@propertypulse.ai", is_demo=True)
        db.add(user)
        db.commit()
        db.refresh(user)
    return {"access_token": _issue_token(user.id), "token_type": "bearer", "user": _user_json(user)}


@app.post("/api/v1/auth/register", status_code=201)
def register(payload: RegisterInput, db: Annotated[Session, Depends(get_db)]):
    email = payload.email.strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(name=payload.name.strip(), email=email, password_hash=_password_hash(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": _issue_token(user.id), "token_type": "bearer", "user": _user_json(user)}


@app.post("/api/v1/auth/login")
def login(payload: LoginInput, db: Annotated[Session, Depends(get_db)]):
    user = db.scalar(select(User).where(User.email == payload.email.strip().lower()))
    if user is None or not _verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return {"access_token": _issue_token(user.id), "token_type": "bearer", "user": _user_json(user)}


@app.get("/api/v1/auth/me")
def me(user: Annotated[User, Depends(current_user)]):
    return _user_json(user)


@app.patch("/api/v1/auth/me")
def update_profile(
    payload: UserProfileInput,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    user.name = payload.name.strip()
    db.commit()
    db.refresh(user)
    return _user_json(user)


@app.get("/api/v1/dashboard")
def dashboard(db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    properties = db.scalars(
        select(Property)
        .where(Property.owner_id == user.id)
        .options(selectinload(Property.inspections))
        .order_by(desc(Property.updated_at))
    ).all()
    inspections = db.scalars(
        select(Inspection)
        .join(Property)
        .where(Property.owner_id == user.id)
        .options(selectinload(Inspection.property), selectinload(Inspection.images).selectinload(InspectionImage.findings))
        .order_by(desc(Inspection.inspection_date))
        .limit(8)
    ).all()
    findings = db.scalars(
        select(Finding)
        .join(InspectionImage)
        .join(Inspection)
        .join(Property)
        .where(Property.owner_id == user.id, Finding.status != "dismissed")
    ).all()
    open_reviews = sum(item.status in {"suggested", "needs_review"} for item in findings)
    high_priority = sum(item.priority == "high" and item.status != "dismissed" for item in findings)
    return {
        "summary": {
            "property_count": len(properties),
            "inspection_count": len(inspections),
            "open_reviews": open_reviews,
            "high_priority": high_priority,
            "review_completion": round(100 * (1 - open_reviews / max(len(findings), 1))) if findings else None,
        },
        "properties": [_property_json(item) for item in properties],
        "recent_inspections": [_inspection_json(item, user.id) for item in inspections],
        "model": classifier.status(),
    }


@app.get("/api/v1/properties")
def list_properties(db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    properties = db.scalars(
        select(Property)
        .where(Property.owner_id == user.id)
        .options(selectinload(Property.inspections))
        .order_by(desc(Property.updated_at))
    ).all()
    return [_property_json(item) for item in properties]


@app.post("/api/v1/properties", status_code=201)
def create_property(payload: PropertyInput, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    prop = Property(owner_id=user.id, **payload.model_dump())
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return _property_json(prop)


@app.get("/api/v1/properties/{property_id}")
def get_property(property_id: int, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    prop = _owned_property(db, property_id, user.id)
    return _property_json(prop, include_inspections=True, user_id=user.id)


@app.patch("/api/v1/properties/{property_id}")
def update_property(property_id: int, payload: PropertyInput, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    prop = _owned_property(db, property_id, user.id)
    for key, value in payload.model_dump().items():
        setattr(prop, key, value)
    db.commit()
    db.refresh(prop)
    return _property_json(prop)


@app.delete("/api/v1/properties/{property_id}")
def delete_property(property_id: int, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    prop = _owned_property(db, property_id, user.id)
    inspection_ids = [row.id for row in prop.inspections]
    finding_ids = db.scalars(
        select(Finding.id).join(InspectionImage).join(Inspection).where(Inspection.property_id == prop.id)
    ).all()
    reports = db.scalars(select(Report).where(Report.inspection_id.in_(inspection_ids))).all() if inspection_ids else []
    for report in reports:
        (REPORT_DIR / report.storage_key).unlink(missing_ok=True)
        db.delete(report)
    db.query(MaintenanceTask).filter(MaintenanceTask.property_id == prop.id).delete(synchronize_session=False)
    db.query(IssueTrend).filter(IssueTrend.property_id == prop.id).delete(synchronize_session=False)
    if finding_ids:
        db.query(FindingReviewEvent).filter(FindingReviewEvent.finding_id.in_(finding_ids)).delete(synchronize_session=False)
    db.delete(prop)
    db.commit()
    return {"deleted": True, "id": property_id}


@app.post("/api/v1/properties/{property_id}/inspections", status_code=201)
def create_inspection(
    property_id: int,
    payload: InspectionInput,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    prop = _owned_property(db, property_id, user.id)
    chosen_date = payload.inspection_date or date.today()
    inspection = Inspection(
        property_id=prop.id,
        area_label=payload.area_label.strip(),
        inspection_date=datetime.combine(chosen_date, datetime.min.time(), tzinfo=timezone.utc),
        notes=payload.notes,
        context_flags=payload.context_flags,
        status="draft",
    )
    db.add(inspection)
    db.commit()
    db.refresh(inspection)
    return _inspection_json(inspection, user.id)


@app.get("/api/v1/inspections/{inspection_id}")
def get_inspection(inspection_id: int, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    return _inspection_json(_owned_inspection(db, inspection_id, user.id), user.id)


@app.get("/api/v1/properties/{property_id}/history")
def property_history(property_id: int, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    _owned_property(db, property_id, user.id)
    inspections = db.scalars(
        select(Inspection)
        .where(Inspection.property_id == property_id)
        .options(selectinload(Inspection.property), selectinload(Inspection.images).selectinload(InspectionImage.findings))
        .order_by(desc(Inspection.inspection_date))
    ).all()
    return [_inspection_json(item, user.id) for item in inspections]


@app.get("/api/v1/demo/samples")
def list_demo_samples(user: Annotated[User, Depends(current_user)]):
    items = []
    if SAMPLE_DIR.exists():
        for path in sorted(SAMPLE_DIR.glob("*.jpg")):
            items.append({
                "id": path.stem,
                "label": path.stem.replace("_", " ").title(),
                "url": _signed_media_url("sample", path.stem, user.id),
            })
    return items


GUIDED_CASE_KEY = "propertypulse-guided-case-v1"


def _guided_case_json(db: Session, prop: Property, user_id: int):
    full_property = db.scalar(
        select(Property)
        .where(Property.id == prop.id, Property.owner_id == user_id)
        .options(selectinload(Property.inspections).selectinload(Inspection.images).selectinload(InspectionImage.findings))
    )
    inspections = sorted(full_property.inspections, key=lambda item: item.inspection_date or item.created_at)
    tasks = db.scalars(select(MaintenanceTask).where(MaintenanceTask.property_id == prop.id).order_by(MaintenanceTask.created_at)).all()
    trend_rows = db.scalars(select(IssueTrend).where(IssueTrend.property_id == prop.id).order_by(IssueTrend.created_at)).all()
    return {
        "property": _property_json(full_property, include_inspections=True, user_id=user_id),
        "previous_inspection_id": inspections[0].id if inspections else None,
        "current_inspection_id": inspections[-1].id if inspections else None,
        "inspections": [_inspection_json(item, user_id) for item in inspections],
        "tasks": [_task_json(item, full_property.name) for item in tasks],
        "trends": [_trend_json(item) for item in trend_rows],
        "fictional_demo": True,
        "case_key": GUIDED_CASE_KEY,
    }


@app.post("/api/v1/demo/case/seed")
def seed_guided_case(db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    prop = db.scalar(select(Property).where(Property.owner_id == user.id, Property.demo_key == GUIDED_CASE_KEY))
    if prop is not None:
        return _guided_case_json(db, prop, user.id)

    prop = Property(
        owner_id=user.id,
        name="Willow Court · Unit 204",
        property_type="Apartment",
        location_label="Fictional demo property",
        age_band="10–20 years",
        notes="Fictional case created for the guided PropertyPulse walkthrough.",
        is_demo=True,
        demo_key=GUIDED_CASE_KEY,
    )
    db.add(prop)
    db.flush()
    today = date.today()
    previous = Inspection(
        property_id=prop.id,
        area_label="Bathroom ceiling",
        inspection_date=datetime.combine(today - timedelta(days=30), datetime.min.time(), tzinfo=timezone.utc),
        notes="Fictional demo history. The attached dataset sample is an illustration, not a photograph of this property.",
        context_flags=[],
        status="complete",
        completed_at=datetime.now(timezone.utc),
    )
    current = Inspection(
        property_id=prop.id,
        area_label="Bathroom ceiling",
        inspection_date=datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc),
        notes="Fictional demo scenario: the resident reports active moisture near a visible surface mark.",
        context_flags=["active_moisture"],
        status="draft",
    )
    db.add_all([previous, current])
    db.flush()

    sample_path = SAMPLE_DIR / "stain.jpg"
    if sample_path.exists():
        storage_key = "guided-history-" + uuid4().hex + ".jpg"
        destination = UPLOAD_DIR / storage_key
        shutil.copyfile(sample_path, destination)
        with Image.open(destination) as sample_image:
            width, height = sample_image.size
        content = destination.read_bytes()
        image = InspectionImage(
            inspection_id=previous.id,
            storage_key=storage_key,
            original_filename="Fictional demo history · dataset illustration.jpg",
            mime_type="image/jpeg",
            byte_size=len(content),
            width=width,
            height=height,
            sha256=hashlib.sha256(content).hexdigest(),
            status="analyzed",
            is_sample=True,
        )
        db.add(image)
        db.flush()
        assessment = calculate_priority("stain", 0.8, [])
        db.add(Finding(
            image_id=image.id,
            defect_type="Stain-like surface observation",
            source_label="stain",
            confidence=None,
            evidence_text="Fictional, pre-reviewed demo history used to demonstrate repeat-observation workflow. This dataset illustration is not evidence from Willow Court.",
            model_name="Fictional demo fixture",
            model_version="scenario-v1",
            priority=assessment["priority"],
            priority_score=assessment["score"],
            reason_codes=["fictional_demo_history"],
            status="confirmed",
            is_sample=True,
            origin="demo_seed",
            reviewer_note="Seeded fictional history; not a real inspection or a real photo of this property.",
        ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(Property).where(Property.owner_id == user.id, Property.demo_key == GUIDED_CASE_KEY))
        if existing is None:
            raise
        return _guided_case_json(db, existing, user.id)
    db.refresh(prop)
    return _guided_case_json(db, prop, user.id)


@app.delete("/api/v1/demo/case")
def reset_guided_case(db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    prop = db.scalar(select(Property).where(Property.owner_id == user.id, Property.demo_key == GUIDED_CASE_KEY))
    if prop is None:
        return {"reset": True}
    inspections = db.scalars(select(Inspection).where(Inspection.property_id == prop.id)).all()
    inspection_ids = [row.id for row in inspections]
    findings = db.scalars(
        select(Finding).join(InspectionImage).join(Inspection).where(Inspection.property_id == prop.id)
    ).all()
    finding_ids = [row.id for row in findings]
    images = db.scalars(
        select(InspectionImage).join(Inspection).where(Inspection.property_id == prop.id)
    ).all()
    for image in images:
        (UPLOAD_DIR / image.storage_key).unlink(missing_ok=True)
    report_rows = db.scalars(select(Report).where(Report.inspection_id.in_(inspection_ids))).all() if inspection_ids else []
    for report in report_rows:
        (REPORT_DIR / report.storage_key).unlink(missing_ok=True)
        db.delete(report)
    if finding_ids:
        db.query(IssueTrend).filter(
            (IssueTrend.previous_finding_id.in_(finding_ids)) | (IssueTrend.current_finding_id.in_(finding_ids))
        ).delete(synchronize_session=False)
        db.query(FindingReviewEvent).filter(FindingReviewEvent.finding_id.in_(finding_ids)).delete(synchronize_session=False)
    db.query(MaintenanceTask).filter(MaintenanceTask.property_id == prop.id).delete(synchronize_session=False)
    db.delete(prop)
    db.commit()
    return {"reset": True}


BLUR_THRESHOLD = 15.0     # Laplacian variance below this ? blurry
DARK_THRESHOLD = 40.0     # Mean pixel brightness below this (0-255) ? dark
BRIGHT_THRESHOLD = 230.0  # Mean pixel brightness above this ? overexposed


def _check_image_quality(image_path) -> dict:
    """
    Check image quality using Laplacian variance (blur) and mean brightness
    (illumination).  Returns a dict with boolean flags and human-readable
    warning strings.  Uses PIL and numpy only  -  no extra dependencies.
    """
    warnings: list[str] = []
    blurry = False
    dark = False
    overexposed = False
    try:
        with Image.open(image_path) as img:
            gray = ImageOps.exif_transpose(img).convert("L")
            arr = np.asarray(gray, dtype=np.float32)
            mean_brightness = float(arr.mean())
            # Laplacian approximation via numpy convolution
            kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
            # Simple 3x3 convolution using strides for speed
            h, w = arr.shape
            if h > 2 and w > 2:
                padded = np.pad(arr, 1, mode="reflect")
                lap = (
                    padded[:-2, :-2] * kernel[0, 0]
                    + padded[:-2, 1:-1] * kernel[0, 1]
                    + padded[:-2, 2:] * kernel[0, 2]
                    + padded[1:-1, :-2] * kernel[1, 0]
                    + padded[1:-1, 1:-1] * kernel[1, 1]
                    + padded[1:-1, 2:] * kernel[1, 2]
                    + padded[2:, :-2] * kernel[2, 0]
                    + padded[2:, 1:-1] * kernel[2, 1]
                    + padded[2:, 2:] * kernel[2, 2]
                )
                blur_score = float(np.var(lap))
            else:
                blur_score = float("inf")

            if blur_score < BLUR_THRESHOLD:
                blurry = True
                warnings.append(
                    f"This image appears blurry (sharpness score {blur_score:.0f} < {BLUR_THRESHOLD:.0f}). "
                    "Blurry images reduce classification reliability. Consider retaking with a steady camera."
                )
            if mean_brightness < DARK_THRESHOLD:
                dark = True
                warnings.append(
                    f"This image appears underexposed (mean brightness {mean_brightness:.0f}/255). "
                    "Poor lighting reduces classification reliability. Improve lighting before retaking."
                )
            elif mean_brightness > BRIGHT_THRESHOLD:
                overexposed = True
                warnings.append(
                    f"This image appears overexposed (mean brightness {mean_brightness:.0f}/255). "
                    "Overexposed images may hide surface details. Reduce glare before retaking."
                )
    except Exception:
        pass  # Quality check is advisory only; never block a valid upload
    return {
        "blurry": blurry,
        "dark": dark,
        "overexposed": overexposed,
        "blur_score": round(blur_score, 1) if "blur_score" in dir() else None,
        "warnings": warnings,
    }

async def _save_image(upload: UploadFile):
    original_name = Path(upload.filename or "inspection-photo.jpg").name
    contents = await upload.read()
    if not contents:
        raise HTTPException(status_code=400, detail="The selected image is empty.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Images must be 15 MB or smaller.")
    try:
        with Image.open(io.BytesIO(contents)) as check:
            if check.format not in ALLOWED_FORMATS:
                raise HTTPException(status_code=415, detail="Choose a JPG, PNG, or WebP image.")
            check.verify()
        with Image.open(io.BytesIO(contents)) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
            width, height = image.size
            if min(width, height) < 256:
                raise HTTPException(status_code=400, detail="Use an image at least 256 pixels wide and tall.")
            storage_key = uuid4().hex + ".jpg"
            file_path = UPLOAD_DIR / storage_key
            image.save(file_path, format="JPEG", quality=92, optimize=True)
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=415, detail="This file is not a supported image.") from exc
    return {
        "storage_key": storage_key,
        "original_filename": original_name,
        "mime_type": "image/jpeg",
        "byte_size": len(contents),
        "width": width,
        "height": height,
        "sha256": hashlib.sha256(contents).hexdigest(),
        "file_path": file_path,
        "_quality": _check_image_quality(file_path),
    }


@app.post("/api/v1/inspections/{inspection_id}/images", status_code=201)
async def upload_image(
    inspection_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
    file: UploadFile = File(...),
):
    inspection = _owned_inspection(db, inspection_id, user.id)
    saved = await _save_image(file)
    image = InspectionImage(
        inspection_id=inspection.id,
        storage_key=saved["storage_key"],
        original_filename=saved["original_filename"],
        mime_type=saved["mime_type"],
        byte_size=saved["byte_size"],
        width=saved["width"],
        height=saved["height"],
        sha256=saved["sha256"],
        status="uploaded",
    )
    inspection.status = "pending_analysis"
    db.add(image)
    db.commit()
    db.refresh(image)
    response = _image_json(image, user.id)
    _q = saved.get("_quality", {})
    response["quality_warnings"] = _q.get("warnings", [])
    response["quality_flags"] = {k: _q.get(k, False) for k in ("blurry", "dark", "overexposed")}
    return response


@app.post("/api/v1/inspections/{inspection_id}/samples/{sample_id}", status_code=201)
def add_sample(
    inspection_id: int,
    sample_id: str,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    inspection = _owned_inspection(db, inspection_id, user.id)
    source = (SAMPLE_DIR / (sample_id + ".jpg")).resolve()
    if source.parent != SAMPLE_DIR.resolve() or not source.exists():
        raise HTTPException(status_code=404, detail="This sample image is not available.")
    storage_key = "sample-" + uuid4().hex + ".jpg"
    destination = UPLOAD_DIR / storage_key
    shutil.copyfile(source, destination)
    with Image.open(destination) as image_file:
        width, height = image_file.size
    payload = destination.read_bytes()
    image = InspectionImage(
        inspection_id=inspection.id,
        storage_key=storage_key,
        original_filename=sample_id.replace("_", " ").title() + " sample.jpg",
        mime_type="image/jpeg",
        byte_size=len(payload),
        width=width,
        height=height,
        sha256=hashlib.sha256(payload).hexdigest(),
        status="uploaded",
        is_sample=True,
    )
    inspection.status = "pending_analysis"
    db.add(image)
    db.commit()
    db.refresh(image)
    return _image_json(image, user.id)


@app.post("/api/v1/images/{image_id}/analyze")
def analyze_image(
    image_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    image = db.scalar(
        select(InspectionImage)
        .join(Inspection)
        .join(Property)
        .where(InspectionImage.id == image_id, Property.owner_id == user.id)
        .options(selectinload(InspectionImage.inspection).selectinload(Inspection.property))
    )
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    path = UPLOAD_DIR / image.storage_key
    try:
        output = classifier.classify(path)
    except ModelUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        image.status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail="Analysis failed. The image is saved so you can retry.") from exc

    for previous in list(image.findings):
        db.delete(previous)
    inspection = image.inspection
    area_key = " ".join(inspection.area_label.casefold().split())
    prior_count = db.scalar(
        select(func.count(Finding.id))
        .join(InspectionImage)
        .join(Inspection)
        .where(
            Inspection.property_id == inspection.property_id,
            func.lower(func.trim(Inspection.area_label)) == area_key,
            or_(Finding.source_label == output["source_label"], func.lower(Finding.defect_type) == output["defect_type"].casefold()),
            Finding.status.in_(["confirmed", "corrected"]),
            Finding.id.not_in(select(Finding.id).where(Finding.image_id == image.id)),
        )
    ) or 0
    open_task_count = db.scalar(
        select(func.count(MaintenanceTask.id))
        .where(
            MaintenanceTask.property_id == inspection.property_id,
            MaintenanceTask.status.not_in(["completed"]),
        )
    ) or 0
    quality = _check_image_quality(path)
    assessment = calculate_priority(
        output["source_label"],
        output["confidence"],
        inspection.context_flags,
        previous_count=int(prior_count),
        open_task_count=int(open_task_count),
    )
    reasons_list = list(assessment["reason_codes"])
    has_quality_defect = False
    if quality.get("blurry"):
        reasons_list.insert(0, "image_quality_blurry")
        has_quality_defect = True
    if quality.get("dark"):
        reasons_list.insert(0, "image_quality_poor_lighting")
        has_quality_defect = True
    if quality.get("overexposed"):
        reasons_list.insert(0, "image_quality_overexposed")
        has_quality_defect = True

    finding = Finding(
        image_id=image.id,
        defect_type=output["defect_type"],
        source_label=output["source_label"],
        confidence=output["confidence"],
        evidence_text=output["evidence_text"],
        model_name=output["model_name"],
        model_version=output["model_version"],
        prediction_alternatives=output.get("top_predictions", []),
        priority=assessment["priority"],
        priority_score=assessment["score"],
        reason_codes=reasons_list,
        status="needs_review" if (output["uncertain"] or has_quality_defect) else "suggested",
        is_sample=image.is_sample,
    )
    image.status = "analyzed"
    inspection.status = "needs_review" if output["uncertain"] else "complete"
    inspection.completed_at = datetime.now(timezone.utc)
    db.add(finding)
    db.commit()
    db.refresh(finding)
    result = {"image": _image_json(image, user.id), "analysis": output, "assessment": assessment, "finding": _finding_json(finding)}
    result["quality_warnings"] = quality.get("warnings", [])
    result["quality_flags"] = {k: quality.get(k, False) for k in ("blurry", "dark", "overexposed")}
    return result


@app.post("/api/v1/images/{image_id}/annotations", status_code=201)
def create_annotation(
    image_id: int,
    payload: AnnotationInput,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    image = db.scalar(
        select(InspectionImage)
        .join(Inspection)
        .join(Property)
        .where(InspectionImage.id == image_id, Property.owner_id == user.id)
        .options(selectinload(InspectionImage.inspection))
    )
    if image is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    box = payload.bbox
    if not all(key in box for key in ("x", "y", "width", "height")):
        raise HTTPException(status_code=422, detail="Region requires x, y, width, and height.")
    if any(value < 0 or value > 1 for value in box.values()) or box["x"] + box["width"] > 1.001 or box["y"] + box["height"] > 1.001:
        raise HTTPException(status_code=422, detail="Region coordinates must stay inside the image.")
    inspection = image.inspection
    assessment = calculate_priority(
        "other",
        0.8,
        inspection.context_flags,
        extent_ratio=box["width"] * box["height"],
    )
    finding = Finding(
        image_id=image.id,
        defect_type=payload.defect_type,
        source_label="inspector_marked",
        confidence=None,
        bbox={key: round(value, 5) for key, value in box.items()},
        evidence_text="Region marked by the inspector. This is a human observation, not an AI localization.",
        model_name=None,
        model_version=None,
        priority=assessment["priority"],
        priority_score=assessment["score"],
        reason_codes=["inspector_marked_region", *assessment["reason_codes"]],
        status="confirmed",
        origin="inspector_annotation",
        reviewer_note=payload.reviewer_note,
        is_sample=image.is_sample,
    )
    image.status = "analyzed"
    inspection.status = "complete"
    inspection.completed_at = datetime.now(timezone.utc)
    db.add(finding)
    db.commit()
    db.refresh(finding)
    return _finding_json(finding)


@app.patch("/api/v1/findings/{finding_id}")
def review_finding(
    finding_id: int,
    payload: FindingReviewInput,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    finding = _owned_finding(db, finding_id, user.id)
    previous_status = finding.status
    previous_defect_type = finding.defect_type
    finding.status = payload.status
    finding.reviewer_note = payload.reviewer_note
    if payload.defect_type:
        finding.defect_type = payload.defect_type
        finding.status = "corrected"
    if payload.priority_override is not None:
        if not payload.priority_override_reason or len(payload.priority_override_reason.strip()) < 5:
            raise HTTPException(status_code=422, detail="Add a short reason when overriding the recommended priority.")
        finding.priority_override = payload.priority_override
        finding.priority_override_reason = payload.priority_override_reason.strip()
    elif "priority_override" in payload.model_fields_set:
        finding.priority_override = None
        finding.priority_override_reason = None

    inspection = finding.image.inspection
    area_key = " ".join(inspection.area_label.casefold().split())
    previous_count = db.scalar(
        select(func.count(Finding.id))
        .join(InspectionImage)
        .join(Inspection)
        .where(
            Inspection.property_id == inspection.property_id,
            func.lower(func.trim(Inspection.area_label)) == area_key,
            or_(Finding.source_label == finding.source_label, func.lower(Finding.defect_type) == finding.defect_type.casefold()),
            Finding.status.in_(["confirmed", "corrected"]),
            Finding.id != finding.id,
        )
    ) or 0
    open_task_count_rv = db.scalar(
        select(func.count(MaintenanceTask.id))
        .where(
            MaintenanceTask.property_id == inspection.property_id,
            MaintenanceTask.status.not_in(["completed"]),
        )
    ) or 0
    assessment = calculate_priority(
        finding.source_label or "other",
        finding.confidence or 0,
        inspection.context_flags,
        previous_count=int(previous_count),
        extent_ratio=(finding.bbox or {}).get("width", 0) * (finding.bbox or {}).get("height", 0) if finding.bbox else None,
        open_task_count=int(open_task_count_rv),
        inspector_severity=payload.inspector_severity,
    )
    finding.priority = assessment["priority"]
    finding.priority_score = assessment["score"]
    finding.reason_codes = assessment["reason_codes"]
    db.add(FindingReviewEvent(
        finding_id=finding.id,
        user_id=user.id,
        previous_status=previous_status,
        next_status=finding.status,
        previous_defect_type=previous_defect_type,
        next_defect_type=finding.defect_type,
        note=finding.reviewer_note,
    ))
    db.commit()
    db.refresh(finding)
    return _finding_json(finding)


@app.get("/api/v1/findings/{finding_id}/reviews")
def finding_review_history(
    finding_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    _owned_finding(db, finding_id, user.id)
    rows = db.scalars(
        select(FindingReviewEvent)
        .where(FindingReviewEvent.finding_id == finding_id, FindingReviewEvent.user_id == user.id)
        .order_by(FindingReviewEvent.created_at.desc())
    ).all()
    return [{
        "id": row.id,
        "finding_id": row.finding_id,
        "previous_status": row.previous_status,
        "next_status": row.next_status,
        "previous_defect_type": row.previous_defect_type,
        "next_defect_type": row.next_defect_type,
        "note": row.note,
        "created_at": _iso(row.created_at),
    } for row in rows]


@app.put("/api/v1/findings/{finding_id}/region")
def mark_region(
    finding_id: int,
    payload: AnnotationInput,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    finding = db.scalar(
        select(Finding)
        .join(InspectionImage)
        .join(Inspection)
        .join(Property)
        .where(Finding.id == finding_id, Property.owner_id == user.id)
        .options(selectinload(Finding.image).selectinload(InspectionImage.inspection))
    )
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found.")
    box = payload.bbox
    if not all(key in box for key in ("x", "y", "width", "height")):
        raise HTTPException(status_code=422, detail="Region requires x, y, width, and height.")
    if any(value < 0 or value > 1 for value in box.values()) or box["x"] + box["width"] > 1.001 or box["y"] + box["height"] > 1.001:
        raise HTTPException(status_code=422, detail="Region coordinates must stay inside the image.")
    finding.bbox = {key: round(value, 5) for key, value in box.items()}
    finding.reviewer_note = payload.reviewer_note or finding.reviewer_note
    finding.status = "confirmed"
    finding.defect_type = payload.defect_type
    finding.origin = "inspector_annotation"
    inspection = finding.image.inspection
    area_ratio = box["width"] * box["height"]
    assessment = calculate_priority(
        finding.source_label or "other",
        finding.confidence or 0,
        inspection.context_flags,
        extent_ratio=area_ratio,
    )
    finding.priority = assessment["priority"]
    finding.priority_score = assessment["score"]
    finding.reason_codes = assessment["reason_codes"]
    db.add(FindingReviewEvent(
        finding_id=finding.id,
        user_id=user.id,
        previous_status="suggested",
        next_status="confirmed",
        previous_defect_type=finding.defect_type,
        next_defect_type=payload.defect_type,
        note=finding.reviewer_note,
    ))
    db.commit()
    db.refresh(finding)
    return _finding_json(finding)


@app.get("/api/v1/tasks")
def list_tasks(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
    status: str | None = None,
    property_id: int | None = None,
):
    valid_statuses = {"open", "in_progress", "blocked", "completed"}
    if status and status not in valid_statuses:
        raise HTTPException(status_code=422, detail="Choose a supported task status.")
    query = select(MaintenanceTask).join(Property).where(Property.owner_id == user.id)
    if status:
        query = query.where(MaintenanceTask.status == status)
    if property_id is not None:
        query = query.where(MaintenanceTask.property_id == property_id)
    rows = db.scalars(query.order_by(MaintenanceTask.due_date.is_(None), MaintenanceTask.due_date, desc(MaintenanceTask.created_at))).all()
    names = {row.id: row.name for row in db.scalars(select(Property).where(Property.owner_id == user.id)).all()}
    return [_task_json(row, names.get(row.property_id)) for row in rows]


@app.post("/api/v1/tasks", status_code=201)
def create_task(
    payload: MaintenanceTaskInput,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    prop = _owned_property(db, payload.property_id, user.id)
    inspection_id = payload.inspection_id
    if inspection_id is not None:
        inspection = _owned_inspection(db, inspection_id, user.id)
        if inspection.property_id != prop.id:
            raise HTTPException(status_code=422, detail="The linked inspection must belong to this property.")
    if payload.finding_id is not None:
        finding = _owned_finding(db, payload.finding_id, user.id)
        linked_inspection_id = finding.image.inspection.id
        if finding.image.inspection.property_id != prop.id:
            raise HTTPException(status_code=422, detail="The linked finding must belong to this property.")
        if inspection_id is not None and inspection_id != linked_inspection_id:
            raise HTTPException(status_code=422, detail="The linked finding must belong to the selected inspection.")
        inspection_id = linked_inspection_id
    task = MaintenanceTask(
        property_id=prop.id,
        inspection_id=inspection_id,
        finding_id=payload.finding_id,
        created_by=user.id,
        **payload.model_dump(exclude={"property_id", "inspection_id", "finding_id"}),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task_json(task, prop.name)


@app.patch("/api/v1/tasks/{task_id}")
def update_task(
    task_id: int,
    payload: MaintenanceTaskUpdateInput,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    task = db.scalar(
        select(MaintenanceTask)
        .join(Property)
        .where(MaintenanceTask.id == task_id, Property.owner_id == user.id)
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Maintenance task not found.")
    values = payload.model_dump(exclude_unset=True)
    for key in ("title", "priority", "status"):
        if key in values and values[key] is None:
            raise HTTPException(status_code=422, detail=f"{key.replace('_', ' ').title()} cannot be empty.")
    for key, value in values.items():
        setattr(task, key, value.strip() if isinstance(value, str) and key in {"title", "assignee"} else value)
    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(task)
    prop = db.get(Property, task.property_id)
    return _task_json(task, prop.name if prop else None)


@app.get("/api/v1/properties/{property_id}/trends")
def property_trends(
    property_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    _owned_property(db, property_id, user.id)
    rows = db.scalars(select(IssueTrend).where(IssueTrend.property_id == property_id).order_by(IssueTrend.created_at.desc())).all()
    return [_trend_json(row) for row in rows]


@app.post("/api/v1/findings/{finding_id}/trends", status_code=201)
def record_issue_trend(
    finding_id: int,
    payload: IssueTrendInput,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    current = _owned_finding(db, finding_id, user.id)
    previous = _owned_finding(db, payload.previous_finding_id, user.id)
    current_inspection = current.image.inspection
    previous_inspection = previous.image.inspection
    if current.id == previous.id or current_inspection.property_id != previous_inspection.property_id:
        raise HTTPException(status_code=422, detail="Choose a different reviewed finding from this property.")
    if current.status not in {"confirmed", "corrected"} or previous.status not in {"confirmed", "corrected"}:
        raise HTTPException(status_code=422, detail="Review both findings before recording their history.")
    current_area = " ".join(current_inspection.area_label.casefold().split())
    previous_area = " ".join(previous_inspection.area_label.casefold().split())
    if current_area != previous_area:
        raise HTTPException(status_code=422, detail="Compare findings recorded in the same property area.")
    same_category = _reviewed_category(current) == _reviewed_category(previous)
    if not same_category and payload.trend_state != "unable_to_compare":
        raise HTTPException(status_code=422, detail="These reviewed findings have different categories. Record unable to compare instead.")
    trend = IssueTrend(
        property_id=current_inspection.property_id,
        previous_finding_id=previous.id,
        current_finding_id=current.id,
        trend_state=payload.trend_state,
        attribution="inspector",
        note=payload.note,
        created_by=user.id,
    )
    db.add(trend)
    db.commit()
    db.refresh(trend)
    return _trend_json(trend)


@app.post("/api/v1/inspections/{inspection_id}/reports", status_code=201)
def create_report(
    inspection_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
):
    inspection = _owned_inspection(db, inspection_id, user.id)
    path = REPORT_DIR / ("propertypulse-inspection-" + str(inspection.id) + "-" + uuid4().hex[:8] + ".pdf")
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="PulseTitle", parent=styles["Title"], textColor=colors.HexColor("#17362B"), fontSize=24, leading=29, spaceAfter=10, alignment=0))
    styles.add(ParagraphStyle(name="PulseMeta", parent=styles["BodyText"], textColor=colors.HexColor("#64736D"), fontSize=9, leading=13))
    styles.add(ParagraphStyle(name="PulseBody", parent=styles["BodyText"], textColor=colors.HexColor("#24322D"), fontSize=9, leading=13, spaceAfter=4))
    styles.add(ParagraphStyle(name="PulseSection", parent=styles["Heading2"], textColor=colors.HexColor("#24493B"), fontSize=13, leading=16, spaceBefore=12, spaceAfter=7))
    styles.add(ParagraphStyle(name="PulseSmall", parent=styles["BodyText"], textColor=colors.HexColor("#64736D"), fontSize=8, leading=11))
    safe = lambda value: html.escape(str(value or "")).replace("\n", "<br/>")
    story = [
        Paragraph("Inspection report", styles["PulseTitle"]),
        Paragraph("PROPERTY PULSE  ·  VISUAL MAINTENANCE SCREENING  ·  Generated " + datetime.now().strftime("%d %b %Y, %H:%M UTC"), styles["PulseMeta"]),
        Spacer(1, 18),
        Paragraph(safe(inspection.property.name), styles["Heading2"]),
        Paragraph(safe(inspection.property.location_label or "Location not set") + " · " + safe(inspection.area_label) + " · " + inspection.inspection_date.strftime("%d %b %Y"), styles["PulseMeta"]),
        Spacer(1, 12),
    ]
    if inspection.property.is_demo:
        story.extend([Paragraph("FICTIONAL DEMO CASE", styles["PulseSection"]), Paragraph("This property and any seeded history are fictional. Dataset sample images are illustrations and are not photographs of this property.", styles["PulseBody"]), Spacer(1, 5)])
    if inspection.notes:
        story.extend([Paragraph("Inspection notes and reported context", styles["PulseSection"]), Paragraph(safe(inspection.notes), styles["PulseBody"])])
    story.append(Paragraph("Evidence and reviewed observations", styles["PulseSection"]))
    finding_ids: list[int] = []
    for image_record in inspection.images:
        local_path = UPLOAD_DIR / image_record.storage_key
        if local_path.exists():
            label = "Dataset sample illustration" if image_record.is_sample else "Inspector-provided photo"
            story.extend([Paragraph(label + " · " + safe(image_record.original_filename), styles["PulseSmall"]), PDFImage(str(local_path), width=5.8 * inch, height=3.75 * inch, kind="proportional"), Spacer(1, 8)])
        if not image_record.findings:
            story.append(Paragraph("No supported finding is saved for this photo.", styles["PulseBody"]))
        for finding in image_record.findings:
            finding_ids.append(finding.id)
            story.append(Paragraph(safe(finding.defect_type), styles["Heading3"]))
            score = "Not available (seeded scenario record)" if finding.confidence is None else str(round(finding.confidence * 100)) + "% uncalibrated model score"
            reasons = {
                "visible_surface_finding": "Visible surface pattern recorded",
                "surface_condition_class": "Classification rule for this surface pattern",
                "repeat_observation": "A similar reviewed observation was recorded before in this area",
                "active_moisture_reported": "Active moisture reported by the inspector/resident",
                "user_reports_worsening": "Worsening reported by the inspector",
                "low_model_confidence": "Low model score; human review is needed",
                "inspector_marked_region": "Region marked by the inspector",
                "maintenance_review_only": "Maintenance review guidance only",
                "no_supported_defect_detected": "No supported pattern detected in the model label set",
                "fictional_demo_history": "Fictional seeded demo history",
                "inspector_severity_high": "High severity condition assessed by inspector",
                "unresolved_open_task": "Unresolved maintenance task already open for property",
                "recurrence_escalated": "Repeated occurrence across multiple inspections raises urgency",
                "large_inspector_marked_region": "Inspector-marked region covers a substantial portion of image",
            }
            reason_text = ", ".join(reasons.get(code, code.replace("_", " ")) for code in (finding.reason_codes or []))
            display_priority = finding.priority_override or finding.priority
            cell = lambda value, style="PulseBody": Paragraph(safe(value), styles[style])
            rows = [
                [cell("Maintenance priority", "PulseSmall"), cell(display_priority.replace("_", " ").title())],
                [cell("Rule recommendation", "PulseSmall"), cell(finding.priority.replace("_", " ").title())],
                [cell("Review state", "PulseSmall"), cell(finding.status.replace("_", " ").title())],
                [cell("Model", "PulseSmall"), cell((finding.model_name or "No model inference recorded") + (" · " + finding.model_version if finding.model_version else ""))],
                [cell("Model score", "PulseSmall"), cell(score)],
                [cell("Evidence note", "PulseSmall"), cell(finding.evidence_text or "No evidence note saved.")],
                [cell("Why this priority", "PulseSmall"), cell(reason_text or "No additional context recorded")],
                [cell("Inspector note", "PulseSmall"), cell(finding.reviewer_note or "None recorded")],
            ]
            table = Table(rows, colWidths=[1.35 * inch, 4.65 * inch], hAlign="LEFT")
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F0F4F0")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#24322D")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#DDE5DF")),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]))
            story.extend([table, Spacer(1, 12)])

    trends = db.scalars(select(IssueTrend).where(IssueTrend.current_finding_id.in_(finding_ids)).order_by(IssueTrend.created_at.desc())).all() if finding_ids else []
    if trends:
        story.append(Paragraph("Property history and comparison", styles["PulseSection"]))
        for trend in trends:
            previous = db.get(Finding, trend.previous_finding_id)
            current = db.get(Finding, trend.current_finding_id)
            if not previous or not current:
                continue
            previous_image = db.get(InspectionImage, previous.image_id)
            current_image = db.get(InspectionImage, current.image_id)
            previous_inspection = db.get(Inspection, previous_image.inspection_id) if previous_image else None
            current_inspection = db.get(Inspection, current_image.inspection_id) if current_image else None
            story.append(Paragraph(
                "Inspector-recorded trend: <b>" + safe(trend.trend_state.replace("_", " ").title()) + "</b> · "
                + ("Recorded " + trend.created_at.strftime("%d %b %Y") if trend.created_at else "Date unavailable")
                + (" · " + safe(trend.note) if trend.note else ""), styles["PulseBody"],
            ))
            comparison_cells = []
            for caption, image_row, inspection_row in (("Earlier · fictional dataset illustration if marked", previous_image, previous_inspection), ("Current", current_image, current_inspection)):
                image_path = UPLOAD_DIR / image_row.storage_key if image_row else None
                parts: list[object] = [Paragraph("<b>" + caption + "</b>", styles["PulseSmall"])]
                if image_path and image_path.exists():
                    parts.append(PDFImage(str(image_path), width=2.7 * inch, height=1.85 * inch, kind="proportional"))
                parts.append(Paragraph(safe(inspection_row.area_label if inspection_row else "Area unavailable") + " · " + safe(inspection_row.inspection_date.strftime("%d %b %Y") if inspection_row else "Date unavailable"), styles["PulseSmall"]))
                comparison_cells.append(parts)
            comparison = Table([[comparison_cells[0], comparison_cells[1]]], colWidths=[3 * inch, 3 * inch])
            comparison.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#DDE5DF")), ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#DDE5DF")), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
            story.extend([comparison, Spacer(1, 10)])

    task_query = select(MaintenanceTask).where(MaintenanceTask.property_id == inspection.property_id)
    if not inspection.property.is_demo:
        task_query = task_query.where((MaintenanceTask.inspection_id == inspection.id) | (MaintenanceTask.finding_id.in_(finding_ids) if finding_ids else MaintenanceTask.inspection_id == inspection.id))
    related_tasks = db.scalars(task_query.order_by(MaintenanceTask.due_date, MaintenanceTask.created_at)).all()
    if related_tasks:
        story.append(Paragraph("Maintenance follow-up", styles["PulseSection"]))
        task_rows = [[cell("Task"), cell("Owner"), cell("Due"), cell("Status")]]
        for task in related_tasks:
            task_rows.append([cell(task.title), cell(task.assignee or "Unassigned"), cell(task.due_date.isoformat() if task.due_date else "Not set"), cell(task.status.replace("_", " ").title())])
        task_table = Table(task_rows, colWidths=[2.75 * inch, 1.1 * inch, 1.0 * inch, 1.15 * inch], repeatRows=1)
        task_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#24493B")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F6F7F3")), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#DDE5DF")), ("FONTSIZE", (0, 0), (-1, -1), 8), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
        story.extend([task_table, Spacer(1, 10)])
    story.extend([
        Paragraph("Model and data notes", styles["PulseSection"]),
        Paragraph("The local image model is trained on chandrabhuma/building_defect_vqa under CC BY 4.0. Its image-level output does not localize pixels, measure defect size, establish the cause of a mark, or confirm active moisture. Scores are uncalibrated model scores.", styles["PulseBody"]),
        Paragraph("Important limitations", styles["PulseSection"]),
        Paragraph(
            "This report summarizes visible image findings for maintenance review. It is not a structural-safety certification, engineering diagnosis, insurance decision, valuation, or measurement of physical defect size. Seek an appropriately qualified on-site professional for concerning conditions.",
            styles["PulseBody"],
        ),
    ])
    def draw_footer(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#DDE5DF"))
        canvas.line(0.65 * inch, 0.48 * inch, 7.85 * inch, 0.48 * inch)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#64736D"))
        canvas.drawString(0.65 * inch, 0.31 * inch, "PropertyPulse AI · Visual maintenance screening record")
        canvas.drawRightString(7.85 * inch, 0.31 * inch, "Page " + str(document.page))
        canvas.restoreState()
    SimpleDocTemplate(str(path), pagesize=letter, rightMargin=0.65 * inch, leftMargin=0.65 * inch, topMargin=0.65 * inch, bottomMargin=0.68 * inch, title="PropertyPulse inspection report", author="PropertyPulse AI").build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    content = path.read_bytes()
    report = Report(
        inspection_id=inspection.id,
        storage_key=path.name,
        format="pdf",
        content_hash=hashlib.sha256(content).hexdigest(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"id": report.id, "format": "pdf", "download_url": "/api/v1/reports/" + str(report.id) + "/download", "generated_at": _iso(report.generated_at)}


@app.get("/api/v1/reports/{report_id}/download")
def download_report(report_id: int, db: Annotated[Session, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    report = db.scalar(
        select(Report)
        .join(Inspection)
        .join(Property)
        .where(Report.id == report_id, Property.owner_id == user.id)
    )
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    path = REPORT_DIR / report.storage_key
    if not path.exists():
        raise HTTPException(status_code=404, detail="The report file is no longer available.")
    return FileResponse(path, media_type="application/pdf", filename="PropertyPulse-Inspection-" + str(report.inspection_id) + ".pdf")
