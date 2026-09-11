"""Project Business Logic Service."""

from backend.app.schemas.project import Project, CreateProjectRequest, ProjectSummary
from backend.app.storage.project_format import ProjectFormat
from backend.app.storage.db import Database
from backend.app.logging_config import logger


class ProjectService:
    @staticmethod
    async def create_project(request: CreateProjectRequest) -> Project:
        """Initialize a new project, create directory bundle, and index in DB."""
        project = Project(
            name=request.name,
            sample_rate=request.sample_rate,
            tempo=request.tempo,
        )

        bundle_path = ProjectFormat.initialize_bundle(project)
        await Database.upsert_project(project, str(bundle_path))
        logger.info(f"Created new project: '{project.name}' (ID: {project.id})")
        return project

    @staticmethod
    async def get_project(project_id: str) -> Project:
        """Load full project document from disk."""
        return ProjectFormat.load(project_id)

    @staticmethod
    async def update_project(project_id: str, updated: Project) -> Project:
        """Save project state modifications and update DB index."""
        if updated.id != project_id:
            updated.id = project_id
        
        ProjectFormat.save(updated)
        bundle_path = ProjectFormat.get_bundle_path(project_id)
        await Database.upsert_project(updated, str(bundle_path))
        return updated

    @staticmethod
    async def list_projects() -> list[ProjectSummary]:
        """List summary of all existing projects."""
        return await Database.list_projects()

    @staticmethod
    async def delete_project(project_id: str) -> bool:
        """Delete project bundle and remove from DB."""
        deleted = ProjectFormat.delete(project_id)
        if deleted:
            await Database.delete_project(project_id)
        return deleted

    @staticmethod
    async def create_version_snapshot(project_id: str, note: str = "") -> str:
        """Create version snapshot."""
        return ProjectFormat.create_snapshot(project_id, note)
