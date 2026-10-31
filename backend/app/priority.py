"""
Maintenance prioritisation — rule-based triage, version propertypulse-triage-v2.

This module uses transparent, deterministic rules only.  No machine-learning
prediction of future structural failure is made.  Every factor that raises or
lowers the score is named in the returned reason_codes list so it can be shown
to the inspector.  Inspectors always retain override authority.
"""

# Human-readable descriptions for every reason code.  Keep in sync with the
# frontend reasonLabel maps in App.tsx and GuidedCase.tsx.
REASON_LABELS: dict[str, str] = {
    "no_supported_defect_detected": "No supported defect pattern detected by the model",
    "low_model_confidence": "Model score is below the confidence threshold; human review needed",
    "visible_surface_finding": "A visible surface pattern was recorded by the model",
    "surface_condition_class": "Surface-pattern class (crack/spalling) uses a prompt-review rule",
    "repeat_observation": "A similar reviewed finding was recorded previously in this area",
    "active_moisture_reported": "Active moisture was reported by the inspector or resident",
    "user_reports_worsening": "Inspector reported that the condition appears to be worsening",
    "large_inspector_marked_region": "Inspector-marked region covers a substantial portion of the image",
    "inspector_severity_high": "Inspector or context flags indicate a high-severity condition",
    "unresolved_open_task": "An unresolved maintenance task is already open for this property",
    "recurrence_escalated": "Repeated occurrence across multiple inspections raises urgency",
    "maintenance_review_only": "Triage guidance is for maintenance review only — not a safety certification",
    "fictional_demo_history": "Fictional seeded history record (demo only)",
    "inspector_marked_region": "Region marked by inspector",
    "image_quality_blurry": "Image sharpness is low; pattern screening reliability is reduced",
    "image_quality_poor_lighting": "Poor illumination detected; dark shadows may obscure surface defects",
    "image_quality_overexposed": "High brightness/overexposure detected; glare may wash out surface details",
}


def calculate_priority(
    source_label: str,
    confidence: float,
    context_flags: list[str] | None = None,
    previous_count: int = 0,
    extent_ratio: float | None = None,
    open_task_count: int = 0,
    inspector_severity: str | None = None,
) -> dict:
    """
    Return a priority assessment for a single finding.

    Parameters
    ----------
    source_label : str
        Model class label, e.g. "major_crack", "stain", "plain".
    confidence : float
        Raw model decision score (uncalibrated, NOT a probability).
    context_flags : list[str] | None
        Inspector-reported context flags from the inspection record.
    previous_count : int
        Number of confirmed/corrected findings of the same defect type
        in the same property area from earlier inspections.
    extent_ratio : float | None
        Fraction of image area covered by an inspector-drawn bounding box
        (width x height, 0-1).  None when no region is drawn.
    open_task_count : int
        Number of open (non-completed) maintenance tasks already recorded
        for this property.  A non-zero value adds mild urgency.
    inspector_severity : str | None
        Optional severity assessment provided by the inspector.
        Accepted values: "high", "moderate", "low", or None.

    Returns
    -------
    dict with keys: priority, score, reason_codes, label,
                    rule_version, next_action, reason_labels
    """
    flags = set(context_flags or [])
    reasons: list[str] = []

    # Short-circuit: clear image with high confidence
    if source_label == "plain" and confidence >= 0.48:
        return {
            "priority": "low",
            "score": 0,
            "reason_codes": ["no_supported_defect_detected"],
            "label": "No review needed",
            "rule_version": "propertypulse-triage-v2",
            "next_action": (
                "Save the inspection record. A clear image does not rule out "
                "conditions outside this screening model."
            ),
            "reason_labels": {
                "no_supported_defect_detected": REASON_LABELS["no_supported_defect_detected"]
            },
        }

    # Short-circuit: uncertain model score
    if confidence < 0.48:
        return {
            "priority": "needs_review",
            "score": 0,
            "reason_codes": ["low_model_confidence"],
            "label": "Needs human review",
            "rule_version": "propertypulse-triage-v2",
            "next_action": (
                "Review the photo and record an inspector observation before "
                "deciding on follow-up."
            ),
            "reason_labels": {
                "low_model_confidence": REASON_LABELS["low_model_confidence"]
            },
        }

    # Base score: a surface pattern was detected
    score = 1
    reasons.append("visible_surface_finding")

    # Factor 1: defect class associated with more urgent maintenance
    if source_label in {"major_crack", "spalling"}:
        score += 1
        reasons.append("surface_condition_class")

    # Factor 2: repeat observation in same area (escalates with count)
    if previous_count >= 3:
        score += 2
        reasons.append("recurrence_escalated")
    elif previous_count >= 1:
        score += 1
        reasons.append("repeat_observation")

    # Factor 3: inspector-reported context flags
    if "active_moisture" in flags:
        score += 2
        reasons.append("active_moisture_reported")
    if "worsening" in flags:
        score += 2
        reasons.append("user_reports_worsening")

    # Factor 4: inspector-drawn region size
    if extent_ratio is not None and extent_ratio >= 0.15:
        score += 1
        reasons.append("large_inspector_marked_region")

    # Factor 5: inspector severity override
    if inspector_severity == "high":
        score += 2
        reasons.append("inspector_severity_high")

    # Factor 6: existing unresolved tasks (mild urgency signal)
    if open_task_count > 0:
        score += 1
        reasons.append("unresolved_open_task")

    # Map score to priority tier
    if score >= 5:
        priority = "high"
        label = "Prompt review"
    elif score >= 3:
        priority = "moderate"
        label = "Plan a review"
    else:
        priority = "low"
        label = "Keep under observation"

    reasons.append("maintenance_review_only")

    next_actions = {
        "high": (
            "Arrange an on-site review by a qualified professional and record "
            "the follow-up. Do not rely on this screen output for safety decisions."
        ),
        "moderate": (
            "Plan a maintenance review and capture a dated follow-up photo for "
            "comparison."
        ),
        "low": (
            "Keep this area under observation and add a dated follow-up photo "
            "if needed."
        ),
    }

    return {
        "priority": priority,
        "score": score,
        "reason_codes": reasons,
        "label": label,
        "rule_version": "propertypulse-triage-v2",
        "next_action": next_actions[priority],
        "reason_labels": {
            code: REASON_LABELS.get(code, code.replace("_", " ").title())
            for code in reasons
        },
    }
