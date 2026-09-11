# MaxAudioEditor — Project Structure

```text
MaxAudioEditor/
│
├── README.md
├── PRD.md
├── FRD.md
├── SRD.md
├── TRD.md
├── PHASES.md
├── STRUCTURE.md
├── MASTER_PROMPT.md
│
├── frontend/
│   ├── index.html
│   ├── assets/
│   │   ├── icons/
│   │   └── fonts/
│   ├── css/
│   │   ├── reset.css
│   │   ├── variables.css
│   │   ├── layout.css
│   │   ├── components.css
│   │   ├── timeline.css
│   │   ├── mixer.css
│   │   ├── inspector.css
│   │   └── responsive.css
│   │
│   └── js/
│       ├── app.js
│       │
│       ├── core/
│       │   ├── event-bus.js
│       │   ├── ids.js
│       │   ├── constants.js
│       │   └── utils.js
│       │
│       ├── state/
│       │   ├── store.js
│       │   ├── project-store.js
│       │   ├── transport-store.js
│       │   └── selection-store.js
│       │
│       ├── timeline/
│       │   ├── timeline.js
│       │   ├── ruler.js
│       │   ├── grid.js
│       │   ├── track.js
│       │   ├── clip.js
│       │   ├── selection.js
│       │   ├── snapping.js
│       │   └── interaction.js
│       │
│       ├── audio/
│       │   ├── audio-engine.js
│       │   ├── transport.js
│       │   ├── scheduler.js
│       │   ├── mixer.js
│       │   ├── meters.js
│       │   ├── buffer-cache.js
│       │   ├── worklets/
│       │   │   ├── compressor.js
│       │   │   ├── saturation.js
│       │   │   ├── spatial.js
│       │   │   └── analyzer.js
│       │   └── effects/
│       │       ├── eq.js
│       │       ├── compressor.js
│       │       ├── reverb.js
│       │       ├── delay.js
│       │       ├── filter.js
│       │       └── spatial.js
│       │
│       ├── canvas/
│       │   ├── renderer.js
│       │   ├── waveform.js
│       │   ├── grid-renderer.js
│       │   ├── automation-renderer.js
│       │   └── overlay-renderer.js
│       │
│       ├── commands/
│       │   ├── command-manager.js
│       │   ├── command-registry.js
│       │   ├── undo.js
│       │   └── redo.js
│       │
│       ├── panels/
│       │   ├── transport-panel.js
│       │   ├── inspector-panel.js
│       │   ├── mixer-panel.js
│       │   ├── effects-panel.js
│       │   ├── analysis-panel.js
│       │   ├── ai-panel.js
│       │   ├── export-panel.js
│       │   └── history-panel.js
│       │
│       ├── ai/
│       │   ├── assistant.js
│       │   ├── operation-schema.js
│       │   ├── planner.js
│       │   └── preview.js
│       │
│       ├── api/
│       │   ├── client.js
│       │   ├── projects.js
│       │   ├── media.js
│       │   ├── analysis.js
│       │   ├── stems.js
│       │   ├── jobs.js
│       │   └── websocket.js
│       │
│       └── workers/
│           ├── waveform-worker.js
│           └── analysis-worker.js
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── dependencies.py
│   │   │
│   │   ├── api/
│   │   │   ├── projects.py
│   │   │   ├── media.py
│   │   │   ├── analysis.py
│   │   │   ├── stems.py
│   │   │   ├── ai.py
│   │   │   ├── jobs.py
│   │   │   └── exports.py
│   │   │
│   │   ├── schemas/
│   │   │   ├── project.py
│   │   │   ├── track.py
│   │   │   ├── clip.py
│   │   │   ├── effect.py
│   │   │   ├── automation.py
│   │   │   ├── job.py
│   │   │   └── ai_operation.py
│   │   │
│   │   ├── services/
│   │   │   ├── project_service.py
│   │   │   ├── media_service.py
│   │   │   ├── analysis_service.py
│   │   │   ├── stem_service.py
│   │   │   ├── ai_service.py
│   │   │   ├── render_service.py
│   │   │   └── cache_service.py
│   │   │
│   │   ├── audio/
│   │   │   ├── decode.py
│   │   │   ├── encode.py
│   │   │   ├── waveform.py
│   │   │   ├── dsp.py
│   │   │   ├── time_pitch.py
│   │   │   ├── effects/
│   │   │   └── render_graph.py
│   │   │
│   │   ├── ai/
│   │   │   ├── registry.py
│   │   │   ├── device.py
│   │   │   ├── stem_models.py
│   │   │   ├── analysis_models.py
│   │   │   ├── generation_models.py
│   │   │   ├── transcription_models.py
│   │   │   └── command_model.py
│   │   │
│   │   ├── jobs/
│   │   │   ├── manager.py
│   │   │   ├── scheduler.py
│   │   │   ├── worker.py
│   │   │   └── progress.py
│   │   │
│   │   ├── storage/
│   │   │   ├── filesystem.py
│   │   │   ├── sqlite.py
│   │   │   └── project_format.py
│   │   │
│   │   └── security/
│   │       ├── paths.py
│   │       ├── validation.py
│   │       └── subprocess.py
│   │
│   ├── workers/
│   │   ├── analysis_worker.py
│   │   ├── stem_worker.py
│   │   ├── ai_worker.py
│   │   └── render_worker.py
│   │
│   └── tests/
│       ├── unit/
│       ├── audio/
│       ├── api/
│       ├── ai/
│       └── integration/
│
├── data/
│   ├── projects/
│   ├── models/
│   ├── cache/
│   ├── jobs/
│   ├── temp/
│   └── logs/
│
├── scripts/
│   ├── setup_windows.ps1
│   ├── setup_linux.sh
│   ├── check_gpu.py
│   ├── download_models.py
│   ├── verify_models.py
│   └── benchmark.py
│
├── tests/
├── docs/
├── requirements.txt
├── pyproject.toml
├── .env.example
└── .gitignore
```

## Architectural rules

1. UI state is separate from audio runtime objects.
2. Project JSON contains only serializable data.
3. Source media is immutable.
4. Derived media is cacheable/rebuildable.
5. AI operations are validated commands.
6. Heavy work never blocks the UI.
7. Final rendering is deterministic.
8. Models are local and registered explicitly.
9. GPU memory is managed centrally.
10. No feature may introduce a mandatory external API.

