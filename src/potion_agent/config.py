"""
Configuration utilities for the potion logistics agent.

This module centralises environment-driven configuration so the rest of the
codebase can remain decoupled from deployment specifics. Extension points are
documented inline for clarity.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional


@dataclass(frozen=True)
class Settings:
    """
    Runtime configuration for the potion logistics agent.

    Values default to sensible local-development settings, but can be
    overridden through environment variables prefixed with `POTION_`.
    """

    cauldron_api_url: str = os.getenv(
        "POTION_CAULDRON_API_URL", "http://localhost:8000/api/cauldrons"
    )
    transport_api_url: str = os.getenv(
        "POTION_TRANSPORT_API_URL", "http://localhost:8000/api/transports"
    )
    network_map_path: str = os.getenv(
        "POTION_NETWORK_MAP_PATH", "config/potion_network_map.json"
    )
    poll_interval_seconds: float = float(
        os.getenv("POTION_POLL_INTERVAL_SECONDS", "5.0")
    )
    anomaly_threshold: float = float(os.getenv("POTION_ANOMALY_THRESHOLD", "0.15"))
    forecast_horizon_minutes: int = int(
        os.getenv("POTION_FORECAST_HORIZON_MINUTES", "30")
    )
    max_history_points: int = int(os.getenv("POTION_MAX_HISTORY_POINTS", "20"))

    nvidia_api_key: Optional[str] = os.getenv("NVIDIA_API_KEY")
    nvidia_api_base: str = os.getenv(
        "NVIDIA_API_BASE", "https://integrate.api.nvidia.com/v1"
    )
    nemotron_model: str = os.getenv(
        "POTION_NEMOTRON_MODEL", "nemotron-nano-9b-v2"
    )

    log_dir: str = os.getenv("POTION_LOG_DIR", "logs")
    enable_structured_logging: bool = os.getenv(
        "POTION_STRUCTURED_LOGGING", "true"
    ).lower() in {"1", "true", "yes"}
    
    use_eog_api: bool = os.getenv(
        "POTION_USE_EOG_API", "true"
    ).lower() in {"1", "true", "yes"}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return (and cache) the active runtime settings."""

    return Settings()


__all__ = ["Settings", "get_settings"]

