from __future__ import annotations

from dataclasses import dataclass, field

# Configurable mold discard threshold (0.0–1.0).
# Below this confidence, mold detection triggers a monitoring recommendation
# rather than an automatic discard/reject.
MOLD_DISCARD_THRESHOLD = 0.30  # 30%


@dataclass(frozen=True)
class Recommendation:
    primary: str
    alternatives: list[str]
    reason: str


@dataclass(frozen=True)
class QualityAssessment:
    """Detailed quality assessment with product suitability percentages."""
    overall_score: float  # 0-100
    grade: str  # A, B, C, D, F
    product_suitability: dict  # e.g. {"wine": 85, "jam": 70, "vinegar": 40, "eat_fresh": 90}
    summary: str
    details: list[str]


def compute_fruit_analytics(
    *,
    all_probabilities: dict,
    mold_present: bool,
    ripeness_stage: str | None,
    detection_distribution: dict | None = None,
) -> dict:
    """
    Compute comprehensive fruit analytics.

    When *detection_distribution* is provided (from per-fruit object detection)
    it is used instead of the single-image *all_probabilities* for the ripeness
    breakdown and quality assessment, because per-fruit detection is more
    accurate than the whole-image softmax.

    Parameters
    ----------
    all_probabilities : dict
        Whole-image model softmax probabilities (fallback).
    mold_present : bool
        Whether mold was detected by any signal.
    ripeness_stage : str | None
        Primary ripeness stage label.
    detection_distribution : dict | None
        Per-fruit classification distribution in **percentages** (0–100),
        e.g. ``{"ripe": 60.0, "unripe": 30.0, "overripe": 10.0}``.
        When provided, overrides ``all_probabilities`` for ripeness/quality.
    """
    # Decide which probability source to use for ripeness / quality
    if detection_distribution:
        # Convert detection percentages (0–100) → fractions (0–1)
        ripe_prob   = detection_distribution.get("ripe", 0.0) / 100.0
        unripe_prob = detection_distribution.get("unripe", 0.0) / 100.0
        overripe_prob = detection_distribution.get("overripe", 0.0) / 100.0
        good_prob   = detection_distribution.get("good", 0.0) / 100.0
        mold_prob_for_ripeness = detection_distribution.get("mold", 0.0) / 100.0
    else:
        ripe_prob   = all_probabilities.get("ripe", 0.0)
        unripe_prob = all_probabilities.get("unripe", 0.0)
        overripe_prob = all_probabilities.get("overripe", 0.0)
        good_prob   = all_probabilities.get("good", 0.0)
        mold_prob_for_ripeness = all_probabilities.get("mold", 0.0)

    # --- Mold Detection (always from whole-image model — it's a separate signal) ---
    mold_prob = all_probabilities.get("mold", 0.0)
    mold_status = "detected" if mold_present else "clear"
    mold_severity = "none"
    if mold_prob > 0.7:
        mold_severity = "severe"
    elif mold_prob > 0.4:
        mold_severity = "moderate"
    elif mold_prob > 0.15:
        mold_severity = "mild"

    mold_detection = {
        "mold_probability": round(mold_prob * 100, 1),
        "clean_probability": round((1.0 - mold_prob) * 100, 1),
        "status": mold_status,
        "severity": mold_severity,
    }

    # --- Ripeness Analysis ---
    # These values come from detection_distribution when available (more accurate)
    # or fall back to whole-image model probabilities.

    # Compute a ripeness index from 0 (fully unripe) to 100 (fully overripe)
    # Midpoint (~50) means perfectly ripe
    ripeness_index = round(
        (ripe_prob * 50 + overripe_prob * 100 + unripe_prob * 0 + good_prob * 55)
        / max(ripe_prob + overripe_prob + unripe_prob + good_prob, 0.001),
        1,
    )

    ripeness_analysis = {
        "unripe_pct": round(unripe_prob * 100, 1),
        "ripe_pct": round(ripe_prob * 100, 1),
        "overripe_pct": round(overripe_prob * 100, 1),
        "good_pct": round(good_prob * 100, 1),
        "mold_pct": round(mold_prob_for_ripeness * 100, 1),
        "ripeness_index": ripeness_index,
        "stage": ripeness_stage or "unknown",
        "source": "per_fruit_detection" if detection_distribution else "model_probabilities",
    }

    # --- Quality Assessment (product suitability) ---
    if mold_present and mold_prob >= MOLD_DISCARD_THRESHOLD:
        # High-confidence mold — everything drops drastically
        product_suitability = {
            "eat_fresh": 0,
            "wine": 0,
            "jam": 0,
            "vinegar": 0,
            "juice": 0,
        }
        overall_score = 0.0
        grade = "F"
        summary = "Mold detected — fruit is not suitable for any use."
        details = [
            "Discard immediately to prevent contamination.",
            "Do not consume or process moldy fruit.",
        ]
    elif mold_present and mold_prob < MOLD_DISCARD_THRESHOLD:
        # Low-confidence mold — reduced suitability with monitoring advice
        mold_penalty = mold_prob / MOLD_DISCARD_THRESHOLD  # 0..1 scale
        eat_fresh = round(
            (ripe_prob * 0.95 + good_prob * 0.90 + overripe_prob * 0.10 + unripe_prob * 0.05) * 100 * (1 - mold_penalty * 0.7), 1
        )
        wine = round(
            (ripe_prob * 0.85 + good_prob * 0.80 + overripe_prob * 0.65 + unripe_prob * 0.40) * 100 * (1 - mold_penalty * 0.5), 1
        )
        jam = round(
            (ripe_prob * 0.70 + good_prob * 0.65 + overripe_prob * 0.90 + unripe_prob * 0.15) * 100 * (1 - mold_penalty * 0.5), 1
        )
        vinegar = round(
            (ripe_prob * 0.40 + good_prob * 0.35 + overripe_prob * 0.50 + unripe_prob * 0.85) * 100 * (1 - mold_penalty * 0.3), 1
        )
        juice = round(
            (ripe_prob * 0.90 + good_prob * 0.85 + overripe_prob * 0.45 + unripe_prob * 0.20) * 100 * (1 - mold_penalty * 0.6), 1
        )

        product_suitability = {
            "eat_fresh": min(max(eat_fresh, 0), 100.0),
            "wine": min(max(wine, 0), 100.0),
            "jam": min(max(jam, 0), 100.0),
            "vinegar": min(max(vinegar, 0), 100.0),
            "juice": min(max(juice, 0), 100.0),
        }

        top_scores = sorted(product_suitability.values(), reverse=True)[:3]
        overall_score = round(sum(top_scores) / len(top_scores), 1) if top_scores else 0.0

        if overall_score >= 50:
            grade = "C"
        elif overall_score >= 30:
            grade = "D"
        else:
            grade = "F"

        mold_pct_display = round(mold_prob * 100, 0)
        summary = (
            f"Low-level mold indicators ({mold_pct_display}% confidence, below "
            f"{round(MOLD_DISCARD_THRESHOLD * 100)}% threshold). "
            "Monitor closely — the fruit may still be usable with visual inspection."
        )
        details = [
            f"Mold confidence ({mold_pct_display}%) is below the {round(MOLD_DISCARD_THRESHOLD * 100)}% discard threshold.",
            "Inspect the fruit visually before consuming or processing.",
            "Process soon (jam, wine, or vinegar) if visual quality appears acceptable.",
        ]
    else:
        # Product suitability based on combined ripeness probabilities
        eat_fresh = round(
            (ripe_prob * 0.95 + good_prob * 0.90 + overripe_prob * 0.10 + unripe_prob * 0.05) * 100, 1
        )
        wine = round(
            (ripe_prob * 0.85 + good_prob * 0.80 + overripe_prob * 0.65 + unripe_prob * 0.40) * 100, 1
        )
        jam = round(
            (ripe_prob * 0.70 + good_prob * 0.65 + overripe_prob * 0.90 + unripe_prob * 0.15) * 100, 1
        )
        vinegar = round(
            (ripe_prob * 0.40 + good_prob * 0.35 + overripe_prob * 0.50 + unripe_prob * 0.85) * 100, 1
        )
        juice = round(
            (ripe_prob * 0.90 + good_prob * 0.85 + overripe_prob * 0.45 + unripe_prob * 0.20) * 100, 1
        )

        # Cap at 100
        product_suitability = {
            "eat_fresh": min(eat_fresh, 100.0),
            "wine": min(wine, 100.0),
            "jam": min(jam, 100.0),
            "vinegar": min(vinegar, 100.0),
            "juice": min(juice, 100.0),
        }

        # Overall quality score is weighted average of best uses
        top_scores = sorted(product_suitability.values(), reverse=True)[:3]
        overall_score = round(sum(top_scores) / len(top_scores), 1) if top_scores else 0.0

        if overall_score >= 85:
            grade = "A"
        elif overall_score >= 70:
            grade = "B"
        elif overall_score >= 50:
            grade = "C"
        elif overall_score >= 30:
            grade = "D"
        else:
            grade = "F"

        details = []
        best_use = max(product_suitability, key=product_suitability.get)
        best_use_label = best_use.replace("_", " ").title()
        details.append(f"Best use: {best_use_label} ({product_suitability[best_use]:.0f}% suitability)")

        if ripeness_stage == "unripe":
            details.append("Fruit is still developing — best for fermented products.")
            summary = "Unripe fruit is ideal for vinegar or wine production."
        elif ripeness_stage == "ripe" or ripeness_stage is None:
            details.append("Fruit is at peak ripeness — versatile for many products.")
            summary = "Ripe fruit is excellent for eating fresh, juice, and wine."
        elif ripeness_stage == "overripe":
            details.append("Fruit is past peak — process soon to avoid waste.")
            summary = "Overripe fruit is best for jam or wine processing."
        else:
            summary = "Good quality fruit with multiple processing options."

    quality_assessment = {
        "overall_score": overall_score,
        "grade": grade,
        "product_suitability": product_suitability,
        "summary": summary,
        "details": details,
    }

    return {
        "mold_detection": mold_detection,
        "ripeness_analysis": ripeness_analysis,
        "quality_assessment": quality_assessment,
    }


def compute_leaf_analytics(
    *,
    all_probabilities: dict,
    mold_present: bool,
) -> dict:
    """
    Compute comprehensive leaf analytics from Keras model probabilities.
    Provides detailed health assessment and actionable care recommendations.
    """
    healthy_prob = all_probabilities.get("healthy", 0.0)
    mold_prob = all_probabilities.get("mold", 0.0)

    health_status = "healthy" if not mold_present else "diseased"
    health_score = round(healthy_prob * 100, 1)

    mold_severity = "none"
    if mold_prob > 0.7:
        mold_severity = "severe"
    elif mold_prob > 0.4:
        mold_severity = "moderate"
    elif mold_prob > 0.15:
        mold_severity = "mild"

    details = []
    recommendations = []
    care_tips = []

    if mold_present:
        if mold_severity == "severe":
            details.append("Severe mold or disease infection detected on the leaf.")
            details.append("The leaf shows advanced signs of fungal or bacterial damage.")
            details.append("Immediate action is required to prevent spread to healthy parts of the plant.")
            recommendations.append("Remove and destroy all severely infected leaves immediately — do not compost them.")
            recommendations.append("Prune affected branches at least 6 inches below visible infection.")
            recommendations.append("Apply a copper-based fungicide or neem oil treatment to surrounding healthy foliage.")
            recommendations.append("Disinfect pruning tools with 70% rubbing alcohol between cuts to prevent cross-contamination.")
            recommendations.append("Isolate the affected plant from healthy ones if possible.")
            care_tips.append("Avoid overhead watering to reduce moisture on leaf surfaces.")
            care_tips.append("Ensure adequate spacing between plants for air circulation.")
            care_tips.append("Monitor remaining leaves daily for new signs of infection.")
        elif mold_severity == "moderate":
            details.append("Moderate signs of mold or disease detected on the leaf.")
            details.append("The infection appears to be progressing but may still be treatable.")
            recommendations.append("Remove the affected leaves promptly to slow the spread.")
            recommendations.append("Apply an organic fungicide (neem oil or copper spray) to the entire plant.")
            recommendations.append("Improve air circulation around the plant by thinning dense foliage.")
            recommendations.append("Reduce watering frequency and avoid wetting the leaves directly.")
            recommendations.append("Consider applying a foliar fertilizer to boost the plant's natural defenses.")
            care_tips.append("Water at the base of the plant, not overhead.")
            care_tips.append("Check soil drainage — waterlogged roots weaken plant immunity.")
            care_tips.append("Monitor weekly for improvement or worsening.")
        else:  # mild
            details.append("Minor signs of mold or disease detected — likely early-stage infection.")
            details.append("Early intervention can prevent the problem from spreading.")
            recommendations.append("Keep monitoring the affected leaf closely for progression.")
            recommendations.append("Apply preventive neem oil spray to the entire plant as a precaution.")
            recommendations.append("Improve air circulation by spacing plants and pruning overcrowded areas.")
            recommendations.append("Ensure the plant is not stressed from overwatering or nutrient deficiency.")
            care_tips.append("Maintain consistent watering schedule — avoid both drought and overwatering.")
            care_tips.append("Feed with balanced fertilizer to strengthen plant health.")
            care_tips.append("Check surrounding plants for similar symptoms.")
    else:
        details.append("Leaf appears healthy with good color and no visible signs of disease.")
        details.append("The leaf tissue shows normal development and vitality.")
        recommendations.append("Continue regular care and monitoring to maintain plant health.")
        recommendations.append("Maintain a consistent watering schedule appropriate for Bignay trees.")
        recommendations.append("Apply balanced fertilizer during the growing season (every 4-6 weeks).")
        recommendations.append("Inspect leaves periodically for early signs of pests or disease.")
        care_tips.append("Bignay trees thrive in full sun to partial shade with well-drained soil.")
        care_tips.append("Prune regularly to maintain good air circulation within the canopy.")
        care_tips.append("Mulch around the base to retain moisture and suppress weeds.")
        care_tips.append("Watch for common pests like aphids, scale insects, and fruit flies.")

    return {
        "health_assessment": {
            "status": health_status,
            "health_score": health_score,
            "mold_probability": round(mold_prob * 100, 1),
            "healthy_probability": round(healthy_prob * 100, 1),
        },
        "health_score": health_score,
        "mold_detection": {
            "mold_probability": round(mold_prob * 100, 1),
            "clean_probability": round(healthy_prob * 100, 1),
            "status": "detected" if mold_present else "clear",
            "severity": mold_severity,
        },
        "details": details,
        "recommendations": recommendations,
        "care_tips": care_tips,
    }


def recommend(
    *,
    ripeness_stage: str | None,
    mold_present: bool,
    quality: str | None,
    mold_confidence: float = 1.0,
) -> Recommendation:
    """
    Generate a use recommendation.

    When *mold_present* is True but *mold_confidence* is below
    ``MOLD_DISCARD_THRESHOLD`` (30%), the system recommends monitoring
    instead of immediate discard.
    """
    if mold_present:
        if mold_confidence >= MOLD_DISCARD_THRESHOLD:
            return Recommendation(
                primary="discard",
                alternatives=[],
                reason="Mold detected; not recommended for consumption or processing.",
            )
        else:
            # Below threshold — monitor rather than discard
            pct = round(mold_confidence * 100)
            threshold_pct = round(MOLD_DISCARD_THRESHOLD * 100)
            return Recommendation(
                primary="monitor",
                alternatives=["wine", "vinegar", "jam"],
                reason=(
                    f"Low-level mold indicators detected ({pct}% confidence, "
                    f"below {threshold_pct}% discard threshold). "
                    "Inspect visually and consider processing soon if quality appears acceptable."
                ),
            )

    if quality == "reject":
        return Recommendation(
            primary="discard",
            alternatives=[],
            reason="Quality assessment indicates rejection.",
        )

    if ripeness_stage == "unripe":
        return Recommendation(
            primary="vinegar",
            alternatives=["wine"],
            reason="Unripe fruit is typically better for acidic/fermented processing than eating fresh.",
        )

    if ripeness_stage == "ripe":
        return Recommendation(
            primary="eat",
            alternatives=["wine", "jam"],
            reason="Ripe fruit is generally suitable to eat fresh; also good for wine/jam.",
        )

    if ripeness_stage == "overripe":
        return Recommendation(
            primary="jam",
            alternatives=["wine", "vinegar"],
            reason="Overripe fruit is usually best processed soon (jam/wine/vinegar).",
        )

    return Recommendation(
        primary="unknown",
        alternatives=[],
        reason="Not enough information to recommend a use.",
    )
