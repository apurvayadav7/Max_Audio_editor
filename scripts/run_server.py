import os
import socket
import sys
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

import uvicorn


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """Check if a TCP port is currently occupied."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def find_available_port(preferred_port: int, host: str = "127.0.0.1") -> int:
    """Find preferred port, or increment to the next available free port."""
    port = preferred_port
    while is_port_in_use(port, host):
        print(f"[MaxAudioEditor] Port {port} is busy, checking port {port + 1}...")
        port += 1
    return port


if __name__ == "__main__":
    # Check CLI arguments (--port 8001) or environment variable
    preferred_port = 8000
    for i, arg in enumerate(sys.argv):
        if arg in ("--port", "-p") and i + 1 < len(sys.argv):
            preferred_port = int(sys.argv[i + 1])
            break
    if "PORT" in os.environ:
        preferred_port = int(os.environ["PORT"])

    port = find_available_port(preferred_port)
    print("=================================================================")
    print(f"  MaxAudioEditor DAW Server running on: http://127.0.0.1:{port}")
    print("=================================================================")
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=port, log_level="info")
