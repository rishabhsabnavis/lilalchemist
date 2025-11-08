"""
Logging helpers for consistent observability across the agent workflow.
"""

from __future__ import annotations

import json
import logging
from logging.config import dictConfig
from pathlib import Path
from typing import Any, Dict

from .config import get_settings


def configure_logging() -> None:
    """Initialise the logging stack based on runtime settings."""

    settings = get_settings()
    log_dir = Path(settings.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)

    handlers: Dict[str, Dict[str, Any]] = {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "structured" if settings.enable_structured_logging else "standard",
            "level": "INFO",
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "formatter": "structured",
            "filename": str(log_dir / "potion_agent.log"),
            "maxBytes": 1_000_000,
            "backupCount": 5,
            "level": "INFO",
        },
    }

    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "standard": {
                    "format": "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
                },
                "structured": {
                    "()": "potion_agent.logging_utils.StructuredFormatter",
                },
            },
            "handlers": handlers,
            "root": {"level": "INFO", "handlers": ["console", "file"]},
        }
    )


class StructuredFormatter(logging.Formatter):
    """Formatter that emits structured JSON logs for downstream analysis."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: D401
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "context"):
            payload["context"] = getattr(record, "context")
        return json.dumps(payload, ensure_ascii=False)


__all__ = ["StructuredFormatter", "configure_logging"]

