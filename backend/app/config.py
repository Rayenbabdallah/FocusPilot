from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    bedrock_model_pro: str = "amazon.nova-pro-v1:0"
    bedrock_model_lite: str = "amazon.nova-lite-v1:0"
    bedrock_model_micro: str = "amazon.nova-micro-v1:0"
    database_url: str = "sqlite+aiosqlite:///./focuspilot.db"
    upload_dir: str = "./uploads"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
