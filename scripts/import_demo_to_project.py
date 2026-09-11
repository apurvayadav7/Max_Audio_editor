"""Script to import demo_synth_riff.wav into current project."""

import httpx

client = httpx.Client(base_url="http://127.0.0.1:8000")
projects = client.get("/api/projects").json()
if not projects:
    print("No projects found, creating one...")
    res = client.post("/api/projects", json={"name": "Neon Nightdrive", "sample_rate": 44100, "tempo": 124.0})
    project_id = res.json()["id"]
else:
    project_id = projects[0]["id"]

print(f"Importing to project: {project_id}")
with open("data/temp/demo_synth_riff.wav", "rb") as f:
    upload_res = client.post(
        f"/api/projects/{project_id}/media",
        files={"file": ("demo_synth_riff.wav", f, "audio/wav")},
        params={"auto_track": True}
    )

print("Status:", upload_res.status_code)
print("Response:", upload_res.json())
