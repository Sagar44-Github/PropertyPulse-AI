from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class UserProfileInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class PropertyInput(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    property_type: str = Field(default="Residential", max_length=80)
    location_label: str | None = Field(default=None, max_length=240)
    age_band: str | None = Field(default=None, max_length=40)
    notes: str | None = None
    cover_image_url: str | None = None


class InspectionInput(BaseModel):
    area_label: str = Field(min_length=2, max_length=180)
    inspection_date: date | None = None
    notes: str | None = None
    context_flags: list[str] = Field(default_factory=list)


class FindingReviewInput(BaseModel):
    status: Literal["confirmed", "corrected", "dismissed", "suggested"]
    defect_type: str | None = None
    reviewer_note: str | None = None
    priority_override: Literal["low", "moderate", "high"] | None = None
    priority_override_reason: str | None = Field(default=None, max_length=1000)


class AnnotationInput(BaseModel):
    defect_type: str = Field(min_length=2, max_length=100)
    bbox: dict[str, float]
    reviewer_note: str | None = None


class IssueTrendInput(BaseModel):
    previous_finding_id: int
    trend_state: Literal["new", "recurring", "stable", "improved", "worsening", "unable_to_compare"]
    note: str | None = Field(default=None, max_length=1200)


class MaintenanceTaskInput(BaseModel):
    property_id: int
    inspection_id: int | None = None
    finding_id: int | None = None
    title: str = Field(min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=4000)
    assignee: str | None = Field(default=None, max_length=120)
    due_date: date | None = None
    priority: Literal["low", "moderate", "high"] = "moderate"
    status: Literal["open", "in_progress", "blocked", "completed"] = "open"
    completion_note: str | None = Field(default=None, max_length=2000)


class MaintenanceTaskUpdateInput(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=4000)
    assignee: str | None = Field(default=None, max_length=120)
    due_date: date | None = None
    priority: Literal["low", "moderate", "high"] | None = None
    status: Literal["open", "in_progress", "blocked", "completed"] | None = None
    completion_note: str | None = Field(default=None, max_length=2000)
