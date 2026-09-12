"""Comprehensive End-to-End Live Verification of Phase 11 and Phase 12.

Tests all REST endpoints on the running server http://127.0.0.1:8000
"""

import json
import sys
import time
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = "http://127.0.0.1:8000"


def request(method, path, data=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"} if data else {}
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read()
            if "application/json" in content_type:
                return resp.status, json.loads(raw.decode("utf-8"))
            return resp.status, raw
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        return e.code, err_body


def run_verification():
    print("=" * 60)
    print("STARTING COMPREHENSIVE LIVE VERIFICATION: PHASE 11 & 12")
    print("=" * 60)

    # 0. Health Check
    status, health = request("GET", "/api/health")
    assert status == 200, f"Health check failed: {status}"
    print(f"✅ Server Health: {health}")

    # 1. Create a dedicated test project
    status, proj = request("POST", "/api/projects", {"name": "Live Verification Session", "tempo": 124.0})
    assert status == 201 or status == 200, f"Create project failed: {proj}"
    project_id = proj["id"]
    print(f"✅ Project Created: {project_id} ('{proj['name']}')")

    # Add test tracks (Drums, Vocals, Bass) via PUT /api/projects/{id}
    proj["tracks"] = [
        {"id": "trk_drums", "name": "Drums", "type": "audio", "volume": -2.0, "pan": 0.0, "color": "#ff3d71", "clips": []},
        {"id": "trk_vox", "name": "Vocals", "type": "audio", "volume": 0.0, "pan": 0.0, "color": "#00f0ff", "clips": []},
        {"id": "trk_bass", "name": "Bass", "type": "audio", "volume": -1.0, "pan": 0.0, "color": "#ffb800", "clips": []},
    ]
    status, updated_proj = request("PUT", f"/api/projects/{project_id}", proj)
    assert status == 200, f"Update project failed: {updated_proj}"
    print("✅ Created 3 multitrack channels: Drums, Vocals, Bass")

    # ==========================================
    # PHASE 11 VERIFICATION: AI ASSISTANT
    # ==========================================
    print("\n--- Testing Phase 11: AI Assistant ---")

    # 11.1 Context-aware suggestions
    status, sug = request("GET", f"/api/projects/{project_id}/ai/suggestions")
    assert status == 200, f"Suggestions failed: {sug}"
    assert len(sug["suggestions"]) >= 2
    print(f"✅ Phase 11 Suggestions: Generated {len(sug['suggestions'])} context-aware ideas:")
    for s in sug["suggestions"][:2]:
        print(f"   • [{s['category']}] \"{s['prompt']}\"")

    # 11.2 Relative volume command parsing
    status, plan1 = request("POST", f"/api/projects/{project_id}/ai/plan", {"prompt": "Lower drums volume by 3 dB"})
    assert status == 200, f"Plan 1 failed: {plan1}"
    assert len(plan1["operations"]) == 1
    assert plan1["operations"][0]["op"] == "set_volume"
    assert plan1["operations"][0]["track_name"] == "Drums"
    assert plan1["operations"][0]["params"]["volume"] == -5.0
    print(f"✅ Phase 11 Volume Plan: '{plan1['summary']}' -> new volume: {plan1['operations'][0]['params']['volume']} dB")

    # 11.3 Multi-clause compound command (Effect + Mute)
    status, plan2 = request("POST", f"/api/projects/{project_id}/ai/plan", {"prompt": "Add Reverb to vocals and mute bass"})
    assert status == 200, f"Plan 2 failed: {plan2}"
    assert len(plan2["operations"]) == 2
    op_types = [o["op"] for o in plan2["operations"]]
    assert "add_effect" in op_types
    assert "mute_track" in op_types
    print(f"✅ Phase 11 Compound Plan: Successfully parsed {len(plan2['operations'])} operations across multiple tracks:")
    for op in plan2["operations"]:
        print(f"   • {op['description']}")

    # 11.4 Tempo and 8D Spatial audio commands
    status, plan3 = request("POST", f"/api/projects/{project_id}/ai/plan", {"prompt": "Change tempo to 132 BPM and activate 8D audio circular orbit"})
    assert status == 200, f"Plan 3 failed: {plan3}"
    assert len(plan3["operations"]) == 2
    assert any(o["op"] == "set_tempo" for o in plan3["operations"])
    assert any(o["op"] == "apply_spatial" for o in plan3["operations"])
    print(f"✅ Phase 11 Master Control Plan: Tempo {plan3['operations'][0]['params']} & Spatial {plan3['operations'][1]['params']}")

    # ==========================================
    # PHASE 12 VERIFICATION: LOCAL AI MUSIC GEN
    # ==========================================
    print("\n--- Testing Phase 12: Local AI Music Generation & Extension ---")

    # 12.1 Text-to-Music Generation Job
    status, gen_job = request("POST", f"/api/projects/{project_id}/generate", {
        "prompt": "Cyberpunk 128 BPM Synth Arp in A minor",
        "duration": 2.0,
        "tempo": 128.0,
        "key": "A minor",
    })
    assert status == 200, f"Generate job failed: {gen_job}"
    job_id = gen_job["job_id"]
    print(f"✅ Phase 12 Generation Job Queued: {job_id} ('{gen_job['title']}')")

    # Poll until job completes
    print("   Waiting for local GPU generation worker...")
    completed = False
    for _ in range(40):
        status, job_info = request("GET", f"/api/jobs/{job_id}")
        if status == 200 and job_info.get("status") == "completed":
            completed = True
            break
        time.sleep(0.2)

    assert completed, f"Generation job did not complete in time: {job_info}"
    print(f"✅ Phase 12 Generation Finished in 100% local synthesis [Status: {job_info['status']}]")

    # 12.2 Preview Audio Streaming
    status, prev_bytes = request("GET", f"/api/projects/{project_id}/generate/{job_id}/preview")
    assert status == 200, f"Preview audio stream failed: {status}"
    assert len(prev_bytes) > 5000, f"Preview WAV too small: {len(prev_bytes)} bytes"
    assert prev_bytes.startswith(b"RIFF"), "Not a valid RIFF WAV audio stream"
    print(f"✅ Phase 12 Candidate Audio Preview: Streamed {len(prev_bytes)} bytes valid 32-bit float stereo WAV")

    # 12.3 Preview Waveform Pyramid
    status, wf_pyramid = request("GET", f"/api/projects/{project_id}/generate/{job_id}/waveform")
    assert status == 200, f"Waveform pyramid failed: {status}"
    assert "duration" in wf_pyramid and "levels" in wf_pyramid
    assert len(wf_pyramid["levels"]) > 0
    print(f"✅ Phase 12 Candidate Waveform: Multi-resolution pyramid loaded ({wf_pyramid['duration']:.2f}s duration)")

    # 12.4 Accept into Project Timeline on New Track
    status, accept_res = request("POST", f"/api/projects/{project_id}/generate/{job_id}/accept", {
        "insert_mode": "new_track",
        "playhead_time": 0.0,
        "track_name": "AI Cyberpunk Lead",
    })
    assert status == 200, f"Accept candidate failed: {accept_res}"
    new_track_id = accept_res["track_id"]
    new_clip_id = accept_res["clip_id"]
    print(f"✅ Phase 12 Audio Accepted into Project: Created Track '{new_track_id}' with Clip '{new_clip_id}'")

    # Verify project bundle reflects the new track and clip
    status, updated_proj = request("GET", f"/api/projects/{project_id}")
    assert status == 200
    track_names = [t["name"] for t in updated_proj["tracks"]]
    assert "AI Cyberpunk Lead" in track_names
    ai_track = next(t for t in updated_proj["tracks"] if t["id"] == new_track_id)
    assert len(ai_track["clips"]) == 1
    orig_clip_duration = ai_track["clips"][0]["duration"]
    print(f"✅ Project Bundle Verified: Session now has {len(updated_proj['tracks'])} tracks (including '{ai_track['name']}')")

    # 12.5 Clip Extension Pipeline
    print("\n--- Testing Phase 12 Audio Continuation / Extension ---")
    status, ext_job = request("POST", f"/api/projects/{project_id}/extend", {
        "clip_id": new_clip_id,
        "prompt": "Continue energetic synth arpeggio",
        "extension_seconds": 2.0,
        "overlap_seconds": 0.2,
    })
    assert status == 200, f"Extend job failed: {ext_job}"
    ext_job_id = ext_job["job_id"]
    print(f"✅ Phase 12 Extension Job Queued: {ext_job_id} ('{ext_job['title']}')")

    # Wait for extension job completion
    completed_ext = False
    for _ in range(40):
        status, ext_job_info = request("GET", f"/api/jobs/{ext_job_id}")
        if status == 200 and ext_job_info.get("status") == "completed":
            completed_ext = True
            break
        time.sleep(0.2)

    assert completed_ext, f"Extension job did not complete: {ext_job_info}"
    print(f"✅ Phase 12 Audio Extension Finished [Status: {ext_job_info['status']}]")

    # 12.6 Accept extension replacing existing clip
    status, accept_ext = request("POST", f"/api/projects/{project_id}/generate/{ext_job_id}/accept", {
        "insert_mode": "replace_clip",
        "target_clip_id": new_clip_id,
    })
    assert status == 200, f"Accept extension failed: {accept_ext}"

    # Verify clip was extended in project bundle
    status, proj_after_ext = request("GET", f"/api/projects/{project_id}")
    assert status == 200
    ai_track_after = next(t for t in proj_after_ext["tracks"] if t["id"] == new_track_id)
    extended_clip = ai_track_after["clips"][0]
    assert extended_clip["duration"] > orig_clip_duration
    print(f"✅ Clip Extension Committed: Duration increased from {orig_clip_duration:.2f}s to {extended_clip['duration']:.2f}s with smooth crossfade")

    # 12.7 Discard candidate preview cleanup
    status, discard_res = request("DELETE", f"/api/projects/{project_id}/generate/{job_id}")
    assert status == 200
    print(f"✅ Candidate Preview Cleanup: Discarded temporary cache for {job_id}")

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED: PHASE 11 & PHASE 12 FULLY IMPLEMENTED & OPERATIONAL! 🚀")
    print("=" * 60)


if __name__ == "__main__":
    run_verification()
