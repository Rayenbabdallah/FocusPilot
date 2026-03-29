from pathlib import Path

from app.config import BACKEND_ROOT, Settings


def test_settings_normalize_relative_database_and_upload_paths() -> None:
    s = Settings(
        _env_file=None,
        database_url="sqlite+aiosqlite:///./focuspilot_test.db",
        upload_dir="./uploads",
    )

    expected_db = (BACKEND_ROOT / "focuspilot_test.db").resolve().as_posix()
    assert s.database_url == f"sqlite+aiosqlite:///{expected_db}"
    assert Path(s.upload_dir).resolve() == (BACKEND_ROOT / "uploads").resolve()

