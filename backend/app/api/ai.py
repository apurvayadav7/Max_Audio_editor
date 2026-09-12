"""AI Assistant API Endpoints."""

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field

from backend.app.services.project_service import ProjectService
from backend.app.services.ai_service import AIService, AIOperationPlan
from backend.app.logging_config import logger

router = APIRouter(prefix="/api/projects/{project_id}/ai", tags=["AI Assistant"])


class AIPlanRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=500)


@router.post("/plan", response_model=AIOperationPlan)
async def generate_ai_plan(project_id: str, request: AIPlanRequest):
    """
    Parse natural language user prompt into an actionable AIOperationPlan.
    """
    try:
        project = await ProjectService.get_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        plan = AIService.parse_plan(request.prompt, project)
        logger.info(f"[AI] Generated plan with {len(plan.operations)} operations for project '{project_id}'")
        return plan
    except Exception as e:
        logger.error(f"[AI] Error parsing AI plan: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate AI plan: {e}")


@router.get("/suggestions")
async def get_ai_suggestions(project_id: str):
    """
    Return dynamic prompt suggestions tailored to the active project context.
    """
    try:
        project = await ProjectService.get_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    suggestions = AIService.generate_suggestions(project)
    return {"project_id": project_id, "suggestions": suggestions}
