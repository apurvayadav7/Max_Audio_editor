"""Phase 2 Audio Ingestion, Waveform Pipeline & Streaming Unit Tests."""

import io
import pytest
import numpy as np
import soundfile as sf
from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.audio.decode import probe_audio, decode_audio_to_pcm
from backend.app.audio.waveform import WaveformPyramid


def generate_test_tone(duration=2.0, sr=44100, freq=440.0) -> bytes:
    """Generate stereo sine wave WAV file in-memory."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False, dtype=np.float32)
    left = 0.5 * np.sin(2 * np.pi * freq * t)
    right = 0.5 * np.sin(2 * np.pi * freq * 1.5 * t)
    audio = np.stack([left, right], axis=1)

    buffer = io.BytesIO()
    sf.write(buffer, audio, sr, format="WAV", subtype="FLOAT")
    buffer.seek(0)
    return buffer.read()


@pytest.mark.asyncio
async def test_audio_ingestion_and_streaming(tmp_path):
    """Test full audio upload -> waveform -> stream pipeline."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Create a project
        create_res = await client.post("/api/projects", json={"name": "Audio Pipeline Test"})
        assert create_res.status_code == 201
        project_id = create_res.json()["id"]

        # 2. Upload test tone audio file
        audio_bytes = generate_test_tone(duration=1.5, sr=44100, freq=440.0)
        files = {"file": ("test_sine.wav", audio_bytes, "audio/wav")}

        upload_res = await client.post(
            f"/api/projects/{project_id}/media",
            files=files,
            params={"auto_track": True}
        )
        assert upload_res.status_code == 201
        data = upload_res.json()
        assert "asset" in data
        assert data["asset"]["name"] == "test_sine"
        assert abs(data["asset"]["duration"] - 1.5) < 0.05
        assert data["asset"]["channels"] == 2
        assert data["created_track_id"] is not None
        assert data["created_clip_id"] is not None
        media_id = data["asset"]["id"]

        # 3. Retrieve waveform peak pyramid
        wf_res = await client.get(f"/api/projects/{project_id}/media/{media_id}/waveform")
        assert wf_res.status_code == 200
        wf_data = wf_res.json()
        assert "levels" in wf_data
        assert "64" in wf_data["levels"]
        assert len(wf_data["levels"]["64"]["channels"]) == 2
        # Check peak bounds
        ch0_max = wf_data["levels"]["64"]["channels"][0]["max"]
        assert max(ch0_max) <= 0.6
        assert min(ch0_max) >= 0.0

        # 4. Test audio streaming without range (Full 200)
        stream_res = await client.get(f"/api/projects/{project_id}/media/{media_id}/stream")
        assert stream_res.status_code == 200
        assert len(stream_res.content) > 1000

        # 5. Test HTTP Range streaming (Partial Content 206)
        range_headers = {"Range": "bytes=0-1023"}
        range_res = await client.get(
            f"/api/projects/{project_id}/media/{media_id}/stream",
            headers=range_headers
        )
        assert range_res.status_code == 206
        assert len(range_res.content) == 1024
        assert "bytes 0-1023/" in range_res.headers["Content-Range"]

        # 6. Verify project state updated with track and clip
        proj_res = await client.get(f"/api/projects/{project_id}")
        assert proj_res.status_code == 200
        proj_state = proj_res.json()
        assert len(proj_state["tracks"]) == 1
        assert proj_state["tracks"][0]["name"] == "test_sine"
        assert len(proj_state["tracks"][0]["clips"]) == 1
        assert proj_state["tracks"][0]["clips"][0]["source_id"] == media_id

        # Clean up
        await client.delete(f"/api/projects/{project_id}")
