"""Phase 0 Architecture & Health Unit Tests."""

import pytest
from httpx import AsyncClient, ASGITransport
from backend.app.main import app


@pytest.mark.asyncio
async def test_health_endpoint():
    """Verify GET /api/health returns 200 OK and expected app metadata."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["app_name"] == "MaxAudioEditor"
        assert "version" in data


@pytest.mark.asyncio
async def test_system_info_endpoint():
    """Verify GET /api/system/info returns host CPU, RAM, and storage."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/system/info")
        assert response.status_code == 200
        data = response.json()
        assert data["cpu_cores_logical"] >= 1
        assert data["disk_total_gb"] > 0
        assert "python_version" in data


@pytest.mark.asyncio
async def test_gpu_endpoint():
    """Verify GET /api/system/gpu returns GPU diagnostic response."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/system/gpu")
        assert response.status_code == 200
        data = response.json()
        assert "cuda_available" in data
        assert "recommended_tier" in data
        assert "device_name" in data


@pytest.mark.asyncio
async def test_frontend_static_serving():
    """Verify that root / serves index.html."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        assert "MaxAudioEditor" in response.text
        assert "css/variables.css" in response.text
