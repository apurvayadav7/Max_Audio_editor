"""Project Storage Bundle (.maxaudio) Serialization Engine."""

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from backend.app.config import settings
from backend.app.schemas.project import Project
from backend.app.logging_config import logger


class SecurityError(Exception):
    """Raised when an illegal or path traversal operation is detected."""
    pass


def safe_resolve(base_dir: Path, user_path: str | Path) -> Path:
    """Resolve a path safely under base_dir, preventing directory traversal."""
    resolved = (base_dir / user_path).resolve()
    base_resolved = base_dir.resolve()
    if not resolved.is_relative_to(base_resolved):
        raise SecurityError(f"Path traversal detected: {user_path}")
    return resolved


class ProjectFormat:
    @staticmethod
    def get_bundle_path(project_id: str) -> Path:
        """Get the root directory for a project bundle."""
        clean_id = "".join(c for c in project_id if c.isalnum() or c in ("-", "_"))
        return safe_resolve(settings.PROJECTS_DIR, f"{clean_id}.maxaudio")

    @classmethod
    def initialize_bundle(cls, project: Project) -> Path:
        """Create bundle directory structure on disk."""
        bundle_dir = cls.get_bundle_path(project.id)
        for sub_dir in ["media", "stems", "renders", "cache", "versions"]:
            (bundle_dir / sub_dir).mkdir(parents=True, exist_ok=True)

        cls.save(project)
        return bundle_dir

    @classmethod
    def save(cls, project: Project) -> None:
        """Atomically serialize project state to project.json in bundle."""
        bundle_dir = cls.get_bundle_path(project.id)
        if not bundle_dir.exists():
            for sub_dir in ["media", "stems", "renders", "cache", "versions"]:
                (bundle_dir / sub_dir).mkdir(parents=True, exist_ok=True)

        project.updated_at = datetime.now(timezone.utc).isoformat()
        target_file = bundle_dir / "project.json"
        temp_file = bundle_dir / "project.json.tmp"

        payload = project.model_dump_json(indent=2)
        with open(temp_file, "w", encoding="utf-8") as f:
            f.write(payload)

        # Atomic replacement
        os.replace(temp_file, target_file)
        logger.debug(f"Project '{project.id}' saved successfully to {target_file}")

    @classmethod
    def load(cls, project_id: str) -> Project:
        """Deserialize and validate project state from disk."""
        bundle_dir = cls.get_bundle_path(project_id)
        project_file = bundle_dir / "project.json"

        if not project_file.exists():
            raise FileNotFoundError(f"Project file not found: {project_file}")

        with open(project_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        return Project.model_validate(data)

    @classmethod
    def create_snapshot(cls, project_id: str, note: str = "") -> str:
        """Create a timestamped version snapshot in versions/."""
        bundle_dir = cls.get_bundle_path(project_id)
        project_file = bundle_dir / "project.json"
        if not project_file.exists():
            raise FileNotFoundError(f"Project not found: {project_id}")

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        version_filename = f"project_v_{timestamp}.json"
        dest = bundle_dir / "versions" / version_filename

        shutil.copy2(project_file, dest)
        logger.info(f"Version snapshot created for '{project_id}': {version_filename}")
        return version_filename

    @classmethod
    def delete(cls, project_id: str) -> bool:
        """Delete an entire project bundle."""
        bundle_dir = cls.get_bundle_path(project_id)
        if bundle_dir.exists():
            shutil.rmtree(bundle_dir)
            logger.info(f"Deleted project bundle: {bundle_dir}")
            return True
        return False
