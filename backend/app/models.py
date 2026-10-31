from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    properties: Mapped[list["Property"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Property(Base):
    __tablename__ = "properties"
    __table_args__ = (Index("uq_properties_owner_demo_key", "owner_id", "demo_key", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    property_type: Mapped[str] = mapped_column(String(80), default="Residential")
    location_label: Mapped[str | None] = mapped_column(String(240), nullable=True)
    age_band: Mapped[str | None] = mapped_column(String(40), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Seeded showcase records are explicitly isolated from a user's ordinary portfolio.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    demo_key: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    owner: Mapped[User] = relationship(back_populates="properties")
    inspections: Mapped[list["Inspection"]] = relationship(back_populates="property", cascade="all, delete-orphan")


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True, nullable=False)
    area_label: Mapped[str] = mapped_column(String(180), nullable=False)
    inspection_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_flags: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(40), default="draft", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    property: Mapped[Property] = relationship(back_populates="inspections")
    images: Mapped[list["InspectionImage"]] = relationship(back_populates="inspection", cascade="all, delete-orphan")


class InspectionImage(Base):
    __tablename__ = "inspection_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    inspection_id: Mapped[int] = mapped_column(ForeignKey("inspections.id"), index=True, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(260), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(260), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="uploaded", index=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    inspection: Mapped[Inspection] = relationship(back_populates="images")
    findings: Mapped[list["Finding"]] = relationship(back_populates="image", cascade="all, delete-orphan")


class Finding(Base):
    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("inspection_images.id"), index=True, nullable=False)
    defect_type: Mapped[str] = mapped_column(String(100), nullable=False)
    source_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    bbox: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    evidence_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prediction_alternatives: Mapped[list | None] = mapped_column(JSON, nullable=True)
    priority: Mapped[str] = mapped_column(String(40), default="needs_review")
    priority_score: Mapped[int] = mapped_column(Integer, default=0)
    reason_codes: Mapped[list[str]] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(40), default="suggested", index=True)
    reviewer_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    origin: Mapped[str] = mapped_column(String(40), default="inspection", nullable=False)
    priority_override: Mapped[str | None] = mapped_column(String(40), nullable=True)
    priority_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    image: Mapped[InspectionImage] = relationship(back_populates="findings")


class FindingReviewEvent(Base):
    __tablename__ = "finding_review_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    finding_id: Mapped[int] = mapped_column(ForeignKey("findings.id"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    previous_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    next_status: Mapped[str] = mapped_column(String(40), nullable=False)
    previous_defect_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    next_defect_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class IssueTrend(Base):
    __tablename__ = "issue_trends"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True, nullable=False)
    previous_finding_id: Mapped[int] = mapped_column(ForeignKey("findings.id"), index=True, nullable=False)
    current_finding_id: Mapped[int] = mapped_column(ForeignKey("findings.id"), index=True, nullable=False)
    trend_state: Mapped[str] = mapped_column(String(40), nullable=False)
    attribution: Mapped[str] = mapped_column(String(40), default="inspector", nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class MaintenanceTask(Base):
    __tablename__ = "maintenance_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id"), index=True, nullable=False)
    inspection_id: Mapped[int | None] = mapped_column(ForeignKey("inspections.id"), index=True, nullable=True)
    finding_id: Mapped[int | None] = mapped_column(ForeignKey("findings.id"), index=True, nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assignee: Mapped[str | None] = mapped_column(String(120), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority: Mapped[str] = mapped_column(String(40), default="moderate", nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="open", index=True, nullable=False)
    completion_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    inspection_id: Mapped[int] = mapped_column(ForeignKey("inspections.id"), index=True, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(260), nullable=False)
    format: Mapped[str] = mapped_column(String(20), default="pdf")
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
