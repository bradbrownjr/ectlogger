from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./ectlogger.db"
    
    # Security
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Frontend
    frontend_url: str = "http://localhost:3000"
    
    # OAuth Providers
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    microsoft_client_id: Optional[str] = None
    microsoft_client_secret: Optional[str] = None
    github_client_id: Optional[str] = None
    github_client_secret: Optional[str] = None
    
    # Email
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str
    smtp_password: str
    smtp_from_email: str
    smtp_from_name: str = "ECTLogger"
    
    # Application
    app_name: str = "ECTLogger"
    app_env: str = "development"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
