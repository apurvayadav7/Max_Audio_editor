"""SQLite Metadata Index Storage for MaxAudioEditor."""

import aiosqlite
from pathlib import Path
from backend.app.config import settings
from backend.app.schemas.project import Project, ProjectSummary
from backend.app.logging_config import logger


class Database:
    @classmethod
    async def init_db(cls):
        """Initialize SQLite database tables."""
        async with aiosqlite.connect(settings.DB_PATH) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    sample_rate INTEGER NOT NULL,
                    tempo REAL NOT NULL,
                    musical_key TEXT NOT NULL,
                    track_count INTEGER NOT NULL,
                    duration REAL NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    filepath TEXT NOT NULL
                )
            """)
            await db.commit()
            logger.debug("Database initialized successfully.")

    @classmethod
    async def upsert_project(cls, project: Project, filepath: str):
        """Index or update a project record in SQLite."""
        await cls.init_db()
        async with aiosqlite.connect(settings.DB_PATH) as db:
            await db.execute("""
                INSERT INTO projects (
                    id, name, sample_rate, tempo, musical_key,
                    track_count, duration, created_at, updated_at, filepath
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    sample_rate=excluded.sample_rate,
                    tempo=excluded.tempo,
                    musical_key=excluded.musical_key,
                    track_count=excluded.track_count,
                    duration=excluded.duration,
                    updated_at=excluded.updated_at,
                    filepath=excluded.filepath
            """, (
                project.id,
                project.name,
                project.sample_rate,
                project.tempo,
                project.musical_key,
                len(project.tracks),
                project.duration,
                project.created_at,
                project.updated_at,
                filepath,
            ))
            await db.commit()

    @classmethod
    async def list_projects(cls) -> list[ProjectSummary]:
        """List all indexed projects ordered by last updated."""
        await cls.init_db()
        async with aiosqlite.connect(settings.DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT id, name, sample_rate, tempo, musical_key, track_count, duration, updated_at
                FROM projects ORDER BY updated_at DESC
            """)
            rows = await cursor.fetchall()
            return [
                ProjectSummary(
                    id=row["id"],
                    name=row["name"],
                    sample_rate=row["sample_rate"],
                    tempo=row["tempo"],
                    musical_key=row["musical_key"],
                    track_count=row["track_count"],
                    duration=row["duration"],
                    updated_at=row["updated_at"],
                )
                for row in rows
            ]

    @classmethod
    async def delete_project(cls, project_id: str):
        """Delete project record from index."""
        await cls.init_db()
        async with aiosqlite.connect(settings.DB_PATH) as db:
            await db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            await db.commit()
