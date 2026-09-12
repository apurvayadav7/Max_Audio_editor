"""AI Mix Assistant REST API Endpoints.

Provides:
- POST /api/projects/{project_id}/mix/analyze: Multi-track acoustic mix analysis
- POST /api/projects/{project_id}/mix/apply-fix: 1-click execution of recommended mix fixes
- GET /api/projects/{project_id}/mix/explain/{track_id}: Educational audio insight for stem
"""

import uuid
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.app.services.mix_advisor import (
    MixAdvisor,
    MixHealthReport,
    MixAdviceCard,
    AudioInsight,
)
from backend.app.schemas.effect import Effect
from backend.app.services.project_service import ProjectService
from backend.app.storage.project_format import ProjectFormat
from backend.app.logging_config import logger

router = APIRouter(prefix="/api/projects/{project_id}/mix", tags=["AI Mix Assistant"])


class ApplyFixRequest(BaseModel):
    card_id: str
    action_type: str  # "INSERT_EQ_NOTCH", "SET_STEREO_WIDTH", "ADJUST_GAIN", "MONO_SUB"
    track_id: str
    params: dict[str, Any] = Field(default_factory=dict)


@router.post("/analyze", response_model=MixHealthReport)
async def analyze_mix(project_id: str):
    """Run comprehensive multi-track acoustic mix analysis."""
    project = await ProjectService.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    if not bundle_dir.exists():
        raise HTTPException(status_code=404, detail="Project bundle directory not found")

    try:
        report = MixAdvisor.analyze_project(
            project=project,
            bundle_dir=bundle_dir,
            sr=int(project.sample_rate or 44100)
        )
        return report
    except Exception as e:
        logger.error(f"Failed to analyze mix for project {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Mix analysis failed: {str(e)}")


@router.post("/apply-fix")
async def apply_mix_fix(project_id: str, req: ApplyFixRequest):
    """Apply a 1-click corrective mix action directly to project tracks."""
    project = await ProjectService.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    action_type = req.action_type
    track_id = req.track_id
    params = req.params
    applied_description = ""

    if action_type == "INSERT_EQ_NOTCH":
        # Insert or update notch EQ on the target track
        target_track = next((t for t in project.tracks if t.id == track_id), None)
        if not target_track:
            raise HTTPException(status_code=404, detail=f"Track {track_id} not found")

        freq = float(params.get("frequency", 100.0))
        gain = float(params.get("gain_db", -3.5))
        q = float(params.get("q", 2.5))

        # Check if parametric_eq or eq already exists
        eq_fx = next((e for e in target_track.effects if e.type in ["eq", "parametric_eq"]), None)
        if eq_fx:
            eq_fx.parameters.update({
                "notch_freq": freq,
                "notch_gain_db": gain,
                "notch_q": q,
                "low_mid_gain_db": gain if freq < 500 else eq_fx.parameters.get("low_mid_gain_db", 0.0),
                "high_mid_gain_db": gain if freq >= 500 else eq_fx.parameters.get("high_mid_gain_db", 0.0),
            })
        else:
            new_fx = Effect(
                id=f"fx_{uuid.uuid4().hex[:8]}",
                type="parametric_eq",
                name=f"Clarity Carve ({int(freq)}Hz)",
                order=len(target_track.effects),
                parameters={
                    "frequency": freq,
                    "gain_db": gain,
                    "q": q,
                    "filter_type": "notch"
                }
            )
            target_track.effects.append(new_fx)

        applied_description = f"Carved {gain:+.1f} dB notch at {int(freq)} Hz on track '{target_track.name}'"

    elif action_type == "SET_STEREO_WIDTH":
        target_track = next((t for t in project.tracks if t.id == track_id), None)
        if not target_track:
            raise HTTPException(status_code=404, detail=f"Track {track_id} not found")

        width = float(params.get("width", 0.6))
        width_fx = next((e for e in target_track.effects if e.type == "width"), None)
        if width_fx:
            width_fx.parameters["width"] = width
        else:
            new_fx = Effect(
                id=f"fx_{uuid.uuid4().hex[:8]}",
                type="width",
                name="Stereo Imager",
                order=len(target_track.effects),
                parameters={"width": width}
            )
            target_track.effects.append(new_fx)

        applied_description = f"Set stereo width to {int(width*100)}% on track '{target_track.name}'"

    elif action_type == "MONO_SUB":
        target_track = next((t for t in project.tracks if t.id == track_id), None)
        if not target_track:
            raise HTTPException(status_code=404, detail=f"Track {track_id} not found")

        cutoff = float(params.get("cutoff_hz", 120.0))
        fx = next((e for e in target_track.effects if e.type == "width"), None)
        if fx:
            fx.parameters["mono_sub"] = True
            fx.parameters["sub_cutoff_hz"] = cutoff
        else:
            new_fx = Effect(
                id=f"fx_{uuid.uuid4().hex[:8]}",
                type="width",
                name="Mono Sub Bass",
                order=len(target_track.effects),
                parameters={"width": 1.0, "mono_sub": True, "sub_cutoff_hz": cutoff}
            )
            target_track.effects.append(new_fx)

        applied_description = f"Centered sub-bass below {int(cutoff)} Hz on track '{target_track.name}'"

    elif action_type == "ADJUST_GAIN":
        gain_adjustment = float(params.get("gain_db", -1.0))
        if track_id == "master":
            # Scale down all active tracks proportionally
            for t in project.tracks:
                t.volume = float(max(-60.0, min(12.0, t.volume + gain_adjustment)))
            applied_description = f"Adjusted mix gain by {gain_adjustment:+.1f} dB across session for headroom"
        else:
            target_track = next((t for t in project.tracks if t.id == track_id), None)
            if not target_track:
                raise HTTPException(status_code=404, detail=f"Track {track_id} not found")
            target_track.volume = float(max(-60.0, min(12.0, target_track.volume + gain_adjustment)))
            applied_description = f"Adjusted volume of '{target_track.name}' by {gain_adjustment:+.1f} dB"

    else:
        raise HTTPException(status_code=400, detail=f"Unknown action type '{action_type}'")

    # Persist updated project
    await ProjectService.update_project(project_id, project)
    logger.info(f"Applied mix fix '{action_type}' on project {project_id}: {applied_description}")

    return {
        "status": "applied",
        "card_id": req.card_id,
        "action_type": action_type,
        "description": applied_description,
        "tracks": [t.model_dump() for t in project.tracks],
    }


@router.get("/explain/{track_id}", response_model=AudioInsight)
async def explain_track_audio(project_id: str, track_id: str):
    """Generate educational musical and spectral breakdown of a specific track."""
    project = await ProjectService.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    bundle_dir = ProjectFormat.get_bundle_path(project_id)
    if not bundle_dir.exists():
        raise HTTPException(status_code=404, detail="Project bundle directory not found")

    try:
        insight = MixAdvisor.explain_track(
            track_id=track_id,
            project=project,
            bundle_dir=bundle_dir,
            sr=int(project.sample_rate or 44100)
        )
        return insight
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        logger.error(f"Failed to explain track {track_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Audio explanation failed: {str(e)}")
