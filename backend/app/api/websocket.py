"""WebSocket broadcasting endpoint for real-time DAW telemetry and job progress."""

import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.app.jobs.manager import job_manager

logger = logging.getLogger("maxaudio.ws")
router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/jobs")
async def websocket_jobs_endpoint(websocket: WebSocket):
    """Real-time bidirectional WebSocket connection for job progress and system events."""
    await websocket.accept()
    queue = job_manager.subscribe()
    logger.info("[WebSocket] Client connected to /ws/jobs")

    try:
        while True:
            # Wait for next broadcast message or incoming ping
            msg = await queue.get()
            await websocket.send_text(json.dumps(msg))
    except (WebSocketDisconnect, asyncio.CancelledError):
        logger.info("[WebSocket] Client disconnected from /ws/jobs")
    except Exception as e:
        logger.warning(f"[WebSocket] Error in connection: {e}")
    finally:
        job_manager.unsubscribe(queue)
