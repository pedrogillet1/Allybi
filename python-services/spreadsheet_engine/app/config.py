from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("SPREADSHEET_ENGINE_HOST", "0.0.0.0")
    port: int = int(os.getenv("SPREADSHEET_ENGINE_PORT", "8011"))
    app_name: str = "koda-spreadsheet-engine"
    app_version: str = "0.1.0"
    google_scopes: tuple[str, ...] = (
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    )


settings = Settings()
