from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings

BACKEND_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    bedrock_model_pro: str = "amazon.nova-pro-v1:0"
    bedrock_model_lite: str = "amazon.nova-lite-v1:0"
    bedrock_model_micro: str = "amazon.nova-micro-v1:0"
    database_url: str = "sqlite+aiosqlite:///./focuspilot.db"
    upload_dir: str = "./uploads"
    cors_origins: str = "http://localhost:5173"
    demo_mode: bool = False

    model_config = {"env_file": str(BACKEND_ROOT / ".env"), "extra": "ignore"}

    @field_validator("database_url")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        prefix = "sqlite+aiosqlite:///"
        if value.startswith(prefix + "./"):
            relative = value[len(prefix):]  # "./focuspilot.db"
            absolute = (BACKEND_ROOT / relative[2:]).resolve()
            return f"{prefix}{absolute.as_posix()}"
        return value

    @field_validator("upload_dir")
    @classmethod
    def normalize_upload_dir(cls, value: str) -> str:
        if value.startswith("./"):
            return str((BACKEND_ROOT / value[2:]).resolve())
        return value


@lru_cache()
def get_settings() -> Settings:
    return Settings()
