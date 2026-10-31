def calculate_priority(
    source_label: str,
    confidence: float,
    context_flags: list[str] | None = None,
    previous_count: int = 0,
    extent_ratio: float | None = None,
):
    flags = set(context_flags or [])
    reasons: list[str] = []
    if source_label == "plain" and confidence >= 0.48:
        return {
            "priority": "low",
            "score": 0,
            "reason_codes": ["no_supported_defect_detected"],
            "label": "No review needed",
            "rule_version": "propertypulse-triage-v1",
            "next_action": "Save the inspection record. A clear image does not rule out conditions outside this screening model.",
        }
    if confidence < 0.48:
        return {
            "priority": "needs_review",
            "score": 0,
            "reason_codes": ["low_model_confidence"],
            "label": "Needs human review",
            "rule_version": "propertypulse-triage-v1",
            "next_action": "Review the photo and record an inspector observation before deciding on follow-up.",
        }

    score = 1
    reasons.append("visible_surface_finding")
    if source_label in {"major_crack", "spalling"}:
        score += 1
        reasons.append("surface_condition_class")
    if previous_count:
        score += 1
        reasons.append("repeat_observation")
    if "active_moisture" in flags:
        score += 2
        reasons.append("active_moisture_reported")
    if "worsening" in flags:
        score += 2
        reasons.append("user_reports_worsening")
    if extent_ratio is not None and extent_ratio >= 0.15:
        score += 1
        reasons.append("large_inspector_marked_region")

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
    return {
        "priority": priority,
        "score": score,
        "reason_codes": reasons,
        "label": label,
        "rule_version": "propertypulse-triage-v1",
        "next_action": {
            "high": "Arrange an on-site review by a qualified professional and record the follow-up.",
            "moderate": "Plan a maintenance review and capture a follow-up photo for comparison.",
            "low": "Keep this area under observation and add a dated follow-up photo if needed.",
        }[priority],
    }
