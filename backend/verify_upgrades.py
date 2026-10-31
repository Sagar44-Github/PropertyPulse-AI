import io
import shutil
import sys
from pathlib import Path
from PIL import Image, ImageDraw

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from app.main import (
    initialize, demo_login, model_status, list_properties,
    seed_guided_case, _check_image_quality, analyze_image,
    review_finding, create_report, download_report, UPLOAD_DIR
)
from app.db import SessionLocal
from app.models import User, Finding, InspectionImage, MaintenanceTask
from app.priority import calculate_priority, REASON_LABELS
from app.schemas import FindingReviewInput

print("=" * 60, flush=True)
print("RUNNING PROPERTYPULSE COMPETITION UPGRADE VERIFICATION", flush=True)
print("=" * 60, flush=True)

initialize()
db = SessionLocal()

# 1. Test Model Transparency API Data
print("\n[TEST 1] AI Model Transparency Dashboard Data Endpoint...", flush=True)
demo_res = demo_login(db)
user = db.get(User, demo_res["user"]["id"])
assert user is not None, "User not created"

model_data = model_status(user)
assert model_data["ready"] is True
assert "model_version" in model_data and model_data["model_version"]
assert "metrics" in model_data and model_data["metrics"] is not None
metrics = model_data["metrics"]

print(f"  [PASS] Model Version: {model_data['model_version']}", flush=True)
print(f"  [PASS] Holdout Accuracy: {metrics.get('holdout_accuracy') * 100:.2f}%", flush=True)
print(f"  [PASS] Macro F1 Score: {metrics.get('holdout_macro_f1') * 100:.2f}%", flush=True)
print(f"  [PASS] Classes: {len(model_data['classes'])} classes ({', '.join(model_data['classes'])})", flush=True)

# Verify confusion matrix
assert "confusion_matrix" in metrics, "confusion_matrix missing from metrics!"
cm = metrics["confusion_matrix"]
assert len(cm["labels"]) == 7, "Confusion matrix labels count != 7"
assert len(cm["values"]) == 7, "Confusion matrix values rows != 7"
total_samples = sum(sum(row) for row in cm['values'])
print(f"  [PASS] Confusion Matrix: 7x7 matrix present with {total_samples} holdout evaluation samples", flush=True)

# Verify class report
assert "class_report" in metrics, "class_report missing from metrics!"
for label in cm["labels"]:
    assert label in metrics["class_report"], f"Class {label} missing in class_report"
    rep = metrics["class_report"][label]
    assert "precision" in rep and "recall" in rep and "f1-score" in rep
print("  [PASS] Per-class precision, recall, and f1-score verified for all 7 classes.", flush=True)

# 2. Test Image Quality Validation
print("\n[TEST 2] Image Quality Validation...", flush=True)
# Test blur and lighting check
samples_dir = BACKEND_DIR / "samples"
for sample_file in samples_dir.glob("*.jpg"):
    q = _check_image_quality(sample_file)
    assert "blurry" in q and "dark" in q and "warnings" in q
print("  [PASS] Image quality detection executed across all repository sample images.", flush=True)

# Create an excessively dark test image
dark_img = Image.new("RGB", (300, 300), color=(15, 15, 15))
dark_path = UPLOAD_DIR / "test_dark_verify.jpg"
dark_img.save(dark_path, format="JPEG")

dark_quality = _check_image_quality(dark_path)
assert dark_quality["dark"] is True, "Dark image was not detected as underexposed!"
assert len(dark_quality["warnings"]) > 0, "No warning generated for dark image!"
print(f"  [PASS] Dark image correctly detected with warning: '{dark_quality['warnings'][0][:65]}...'", flush=True)

# Seed guided case and test analyze on dark image: must NOT silently classify
guided_case = seed_guided_case(db, user)
current_insp_id = guided_case["current_inspection_id"]

# Attach the dark image record to inspection
dark_record = InspectionImage(
    inspection_id=current_insp_id,
    storage_key="test_dark_verify.jpg",
    original_filename="Underexposed Test Photo.jpg",
    mime_type="image/jpeg",
    byte_size=dark_path.stat().st_size,
    width=300,
    height=300,
    sha256="test-dark-sha256",
    status="uploaded",
)
db.add(dark_record)
db.commit()
db.refresh(dark_record)

analysis_res = analyze_image(dark_record.id, db, user)
dark_finding = analysis_res["finding"]
assert dark_finding["status"] == "needs_review", "Degraded image was silently accepted instead of forcing needs_review!"
assert any("quality" in r.lower() for r in dark_finding["reason_codes"]), "Quality reason code not attached to finding!"
print(f"  [PASS] Degraded image classified with mandatory status '{dark_finding['status']}' and reason codes: {dark_finding['reason_codes']}", flush=True)

# 3. Test Intelligent Maintenance Prioritization
print("\n[TEST 3] Intelligent Maintenance Prioritization...", flush=True)
p_base = calculate_priority("major_crack", 0.85, context_flags=[], previous_count=0, open_task_count=0)
p_recur = calculate_priority("major_crack", 0.85, context_flags=[], previous_count=3, open_task_count=0)
p_task = calculate_priority("major_crack", 0.85, context_flags=[], previous_count=0, open_task_count=2)
p_sev = calculate_priority("major_crack", 0.85, context_flags=[], previous_count=0, inspector_severity="high")

assert p_recur["score"] > p_base["score"], "Recurrence count did not increase priority score!"
assert "recurrence_escalated" in p_recur["reason_codes"], "recurrence_escalated reason code missing!"
assert p_task["score"] > p_base["score"], "Open task count did not increase priority score!"
assert "unresolved_open_task" in p_task["reason_codes"], "unresolved_open_task reason code missing!"
assert p_sev["score"] > p_base["score"], "Inspector severity did not increase priority score!"
assert "inspector_severity_high" in p_sev["reason_codes"], "inspector_severity_high reason code missing!"
assert p_base["rule_version"] == "propertypulse-triage-v2", "Triage rule version is not v2!"
print(f"  [PASS] Base major_crack score: {p_base['score']} ({p_base['priority']})")
print(f"  [PASS] Recurrence-escalated score (count=3): {p_recur['score']} ({p_recur['priority']}) [Reasons: {p_recur['reason_codes']}]")
print(f"  [PASS] Open-task escalation score (tasks=2): {p_task['score']} ({p_task['priority']})")
print(f"  [PASS] Inspector-assessed severity score (high): {p_sev['score']} ({p_sev['priority']})")

# Test finding review endpoint with human override and inspector severity
finding_id = dark_finding["id"]
review_payload = FindingReviewInput(
    status="confirmed",
    priority_override="high",
    priority_override_reason="Inspector noted active leak nearby on ceiling joint requiring prompt review.",
    inspector_severity="high",
)
reviewed = review_finding(finding_id, review_payload, db, user)
assert reviewed["priority"] == "high"
assert reviewed["priority_override"] == "high"
assert reviewed["priority_override_reason"] is not None
print("  [PASS] Finding review preserved human override and inspector authority.", flush=True)

# 4. Test PDF Report Generation
print("\n[TEST 4] PDF Report Generation & Verification...", flush=True)
report_info = create_report(current_insp_id, db, user)
assert "id" in report_info and report_info["id"] is not None
file_res = download_report(report_info["id"], db, user)
assert file_res.media_type == "application/pdf"
pdf_path = Path(file_res.path)
assert pdf_path.exists()
assert pdf_path.stat().st_size > 1000
print(f"  [PASS] PDF report generated and verified: {pdf_path.name} ({pdf_path.stat().st_size:,} bytes).", flush=True)

# Clean up test artifact
dark_path.unlink(missing_ok=True)
db.close()

print("\n" + "=" * 60, flush=True)
print("ALL UPGRADE SUITE TESTS PASSED SUCCESSFULLY!", flush=True)
print("=" * 60, flush=True)
