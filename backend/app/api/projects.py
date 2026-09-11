"""Project Management REST API Endpoints."""

from fastapi import APIRouter, HTTPException, status
from backend.app.schemas.project import Project, CreateProjectRequest, ProjectSummary
from backend.app.services.project_service import ProjectService

router = APIRouter(prefix="/api/projects", tags=["Projects"])


@router.post("", response_model=Project, status_code=status.HTTP_201_CREATED)
async def create_project(request: CreateProjectRequest):
    """Create a new audio project with dedicated disk bundle."""
    try:
        return await ProjectService.create_project(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create project: {e}")


@router.get("", response_model=list[ProjectSummary])
async def list_projects():
    """List all projects in the workspace."""
    return await ProjectService.list_projects()


@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: str):
    """Retrieve full project state."""
    try:
        return await ProjectService.get_project(project_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading project: {e}")


@router.put("/{project_id}", response_model=Project)
async def update_project(project_id: str, project: Project):
    """Update and save project state."""
    try:
        return await ProjectService.update_project(project_id, project)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update project: {e}")


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    """Delete project bundle and index."""
    deleted = await ProjectService.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")
    return {"status": "success", "message": f"Project '{project_id}' deleted."}


@router.post("/{project_id}/version")
async def create_project_version(project_id: str, note: str = ""):
    """Create a snapshot version of the project."""
    try:
        filename = await ProjectService.create_version_snapshot(project_id, note)
        return {"status": "success", "version_file": filename}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create snapshot: {e}")
