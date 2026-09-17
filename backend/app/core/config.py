import os
from typing import List, Union
from pydantic_settings import BaseSettings
from pydantic import field_validator

class Settings(BaseSettings):
    PROJECT_NAME: str = "Self-Study Center Management SaaS"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Security
    SECRET_KEY: str = "supersecret-jwt-key-for-saas-self-study-platform-change-in-prod-2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # Database
    # Default is SQLite for zero-setup out of the box; supports postgresql+asyncpg://...
    DATABASE_URL: str = "sqlite+aiosqlite:///./study_center.db"

    # Celery & Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # CORS
    CORS_ORIGINS: Union[List[str], str] = ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"]

    @field_validator("CORS_ORIGINS", mode="before")
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        return ["*"]

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""  # Set in .env: your Google OAuth 2.0 client ID

    # SMS Gateway Configuration
    SMS_PROVIDER: str = "mock"  # mock, msg91, fast2sms
    SMS_API_KEY: str = ""
    SMS_SENDER_ID: str = "STDCEN"

    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "ignore"
    }

settings = Settings()
