
from flask import Blueprint, jsonify, request

from training_service import get_training_service, FRUIT_CLASSES, LEAF_CLASSES

training_bp = Blueprint("training", __name__, url_prefix="/api/training")

# ------------------------------------------------------------------
# Missed detection contribution (now after Blueprint definition)
# ------------------------------------------------------------------

@training_bp.post("/contribute/missed")
def contribute_missed_detection():
    """
    Submit a user-confirmed bignay fruit or leaf that the system failed to detect.
    Expected JSON body:
    {
        "subject": "fruit" or "leaf",
        "image": "data:image/jpeg;base64,...",
        "user_id": "optional user id",
        "skip_quality_check": false
    }
    """
    service = get_training_service()
    if not service.is_available():
        return jsonify({
            "success": False,
            "error": "Training service not available. MongoDB may not be configured.",
        }), 503

    try:
        body = request.get_json(force=True, silent=False)
    except Exception as e:
        return jsonify({"success": False, "error": f"Invalid JSON: {str(e)}"}), 400

    required = ["subject", "image"]
    for field in required:
        if field not in body:
            return jsonify({"success": False, "error": f"Missing required field: {field}"}), 400

    result = service.save_missed_detection_contribution(
        subject=body["subject"],
        image_data_url=body["image"],
        user_id=body.get("user_id"),
        save_to_dataset=body.get("save_to_dataset", True),
        skip_quality_check=body.get("skip_quality_check", False),
    )

    if result["success"]:
        return jsonify(result), 201
    else:
        return jsonify(result), 400
"""
Training Routes
===============
API endpoints for training data contributions and model improvement.

Endpoints:
    GET  /api/training/info              – service metadata
    GET  /api/training/stats             – contribution & dataset statistics
    GET  /api/training/balance           – per-class dataset balance analysis
    POST /api/training/contribute        – submit a single contribution
    POST /api/training/contribute/batch  – submit multiple contributions
    GET  /api/training/history           – contribution history (filterable)
    DELETE /api/training/contribution/<id> – delete a contribution
    POST /api/training/retrain           – trigger background retraining
    GET  /api/training/retrain/status    – check retraining progress
    POST /api/training/retrain/cancel    – cancel running retraining
"""

# ------------------------------------------------------------------
# Info & stats
# ------------------------------------------------------------------

@training_bp.get("/info")
def training_info():
    """Get information about training contributions."""
    service = get_training_service()
    return jsonify({
        "available": service.is_available(),
        "fruit_classes": FRUIT_CLASSES,
        "leaf_classes": LEAF_CLASSES,
        "description": "Contribute to model training by confirming or correcting classifications",
    })


@training_bp.get("/stats")
def training_stats():
    """Get training contribution statistics including live dataset counts."""
    service = get_training_service()
    stats = service.get_training_stats()
    return jsonify(stats)


@training_bp.get("/balance")
def dataset_balance():
    """Get detailed per-class dataset balance analysis with imbalance warnings."""
    service = get_training_service()
    balance = service.get_dataset_balance()
    return jsonify(balance)


# ------------------------------------------------------------------
# Contribute
# ------------------------------------------------------------------

@training_bp.post("/contribute")
def contribute_training_data():
    """
    Submit a single training contribution.

    Expected JSON body:
    {
        "subject": "fruit" or "leaf",
        "label": "ripe", "unripe", etc.,
        "image": "data:image/jpeg;base64,...",
        "original_prediction": "what model predicted",
        "original_confidence": 0.85,
        "is_correction": true/false,
        "user_id": "optional user id",
        "skip_quality_check": false
    }
    """
    service = get_training_service()

    if not service.is_available():
        return jsonify({
            "success": False,
            "error": "Training service not available. MongoDB may not be configured.",
        }), 503

    try:
        body = request.get_json(force=True, silent=False)
    except Exception as e:
        return jsonify({"success": False, "error": f"Invalid JSON: {str(e)}"}), 400

    required = ["subject", "label", "image", "original_prediction", "original_confidence"]
    for field in required:
        if field not in body:
            return jsonify({"success": False, "error": f"Missing required field: {field}"}), 400

    result = service.save_training_contribution(
        subject=body["subject"],
        label=body["label"],
        image_data_url=body["image"],
        original_prediction=body["original_prediction"],
        original_confidence=body["original_confidence"],
        is_correction=body.get("is_correction", False),
        user_id=body.get("user_id"),
        save_to_dataset=body.get("save_to_dataset", True),
        skip_quality_check=body.get("skip_quality_check", False),
    )

    if result["success"]:
        return jsonify(result), 201
    else:
        return jsonify(result), 400


@training_bp.post("/contribute/batch")
def contribute_batch():
    """
    Submit multiple training contributions at once.

    Expected JSON body:
    {
        "contributions": [ { ...same fields as /contribute... }, ... ],
        "user_id": "optional default user id"
    }
    """
    service = get_training_service()

    if not service.is_available():
        return jsonify({
            "success": False,
            "error": "Training service not available.",
        }), 503

    try:
        body = request.get_json(force=True, silent=False)
    except Exception as e:
        return jsonify({"success": False, "error": f"Invalid JSON: {str(e)}"}), 400

    items = body.get("contributions")
    if not items or not isinstance(items, list):
        return jsonify({"success": False, "error": "Missing 'contributions' array"}), 400

    result = service.save_batch_contributions(
        contributions=items,
        user_id=body.get("user_id"),
    )

    status_code = 201 if result["success"] else 400
    return jsonify(result), status_code


# ------------------------------------------------------------------
# History
# ------------------------------------------------------------------

@training_bp.get("/history")
def contribution_history():
    """
    Get recent training contributions.

    Query params: limit, subject, label, user_id
    """
    service = get_training_service()

    history = service.get_contribution_history(
        limit=request.args.get("limit", 50, type=int),
        subject=request.args.get("subject"),
        label=request.args.get("label"),
        user_id=request.args.get("user_id"),
    )
    return jsonify({
        "contributions": history,
        "count": len(history),
    })


# ------------------------------------------------------------------
# Delete contribution
# ------------------------------------------------------------------

@training_bp.delete("/contribution/<contribution_id>")
def delete_contribution(contribution_id: str):
    """Delete a contribution and its dataset image."""
    service = get_training_service()
    result = service.delete_contribution(contribution_id)
    status_code = 200 if result["success"] else 400
    return jsonify(result), status_code


# ------------------------------------------------------------------
# Retraining
# ------------------------------------------------------------------

@training_bp.post("/retrain")
def trigger_retrain():
    """
    Trigger model retraining as a background process.

    Optional JSON body:
    {
        "subject": "fruit" | "leaf" | "both",
        "fine_tune": false,
        "force": false
    }
    """
    service = get_training_service()

    body = request.get_json(silent=True) or {}
    result = service.trigger_retrain(
        subject=body.get("subject", "both"),
        fine_tune=body.get("fine_tune", False),
        force=body.get("force", False),
    )

    status_code = 200 if result["success"] else 400
    return jsonify(result), status_code


@training_bp.get("/retrain/status")
def retrain_status():
    """Check the status of the current / last retraining process."""
    service = get_training_service()
    return jsonify(service.get_retrain_status())


@training_bp.post("/retrain/cancel")
def cancel_retrain():
    """Cancel a running retraining process."""
    service = get_training_service()
    result = service.cancel_retrain()
    status_code = 200 if result["success"] else 400
    return jsonify(result), status_code
