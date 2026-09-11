"""Phase 1 Project Model & Storage Unit Tests."""

import pytest
from pathlib import Path
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.schemas.track import Track
from backend.app.schemas.clip import Clip
from backend.app.schemas.effect import Effect
from backend.app.storage.project_format import safe_resolve, SecurityError


@pytest.mark.asyncio
async def test_project_lifecycle_and_bundle():
    """Test full project lifecycle: Create -> Get -> Update -> Snapshot -> List -> Delete."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Create new project
        create_res = await client.post("/api/projects", json={
            "name": "Synthwave Opus",
            "sample_rate": 48000,
            "tempo": 128.0
        })
        assert create_res.status_code == 201
        project = create_res.json()
        project_id = project["id"]
        assert project["name"] == "Synthwave Opus"
        assert project["sample_rate"] == 48000
        assert project["tempo"] == 128.0

        # Verify bundle created on disk
        from backend.app.config import settings
        bundle_path = settings.PROJECTS_DIR / f"{project_id}.maxaudio"
        assert bundle_path.exists()
        assert (bundle_path / "project.json").exists()
        assert (bundle_path / "media").is_dir()
        assert (bundle_path / "stems").is_dir()
        assert (bundle_path / "renders").is_dir()
        assert (bundle_path / "cache").is_dir()
        assert (bundle_path / "versions").is_dir()

        # 2. Get project
        get_res = await client.get(f"/api/projects/{project_id}")
        assert get_res.status_code == 200
        assert get_res.json()["id"] == project_id

        # 3. Update project with track, clip, and effect
        track = Track(
            name="Lead Vocals",
            type="audio",
            color="#00f0ff",
            volume=-1.5,
            pan=0.0
        )
        clip = Clip(
            name="Verse 1 Take",
            source_id="media_take_01",
            track_id=track.id,
            start_time=4.0,
            duration=16.0,
            gain=-0.5
        )
        effect = Effect(
            type="compressor",
            name="Studio Opto Comp",
            parameters={"threshold": -18.0, "ratio": 4.0, "attack": 20.0, "release": 150.0}
        )
        track.clips.append(clip)
        track.effects.append(effect)

        project["tracks"].append(track.model_dump())
        project["tempo"] = 130.0

        put_res = await client.put(f"/api/projects/{project_id}", json=project)
        assert put_res.status_code == 200
        updated = put_res.json()
        assert len(updated["tracks"]) == 1
        assert updated["tracks"][0]["name"] == "Lead Vocals"
        assert updated["tracks"][0]["clips"][0]["name"] == "Verse 1 Take"
        assert updated["tracks"][0]["effects"][0]["type"] == "compressor"
        assert updated["tempo"] == 130.0

        # 4. Create snapshot version
        ver_res = await client.post(f"/api/projects/{project_id}/version?note=Pre-mastering")
        assert ver_res.status_code == 200
        assert "version_file" in ver_res.json()
        ver_file = bundle_path / "versions" / ver_res.json()["version_file"]
        assert ver_file.exists()

        # 5. List projects
        list_res = await client.get("/api/projects")
        assert list_res.status_code == 200
        projects_list = list_res.json()
        matching = [p for p in projects_list if p["id"] == project_id]
        assert len(matching) == 1
        assert matching[0]["name"] == "Synthwave Opus"
        assert matching[0]["track_count"] == 1

        # 6. Delete project
        del_res = await client.delete(f"/api/projects/{project_id}")
        assert del_res.status_code == 200
        assert not bundle_path.exists()

        # Verify 404 after delete
        not_found = await client.get(f"/api/projects/{project_id}")
        assert not_found.status_code == 404


def test_path_traversal_safety():
    """Verify that path traversal attempts raise SecurityError."""
    base = Path("D:/Max_Audio_editor/data/projects")
    with pytest.raises(SecurityError):
        safe_resolve(base, "../../Windows/System32")
    with pytest.raises(SecurityError):
        safe_resolve(base, "../../../passwords.txt")
