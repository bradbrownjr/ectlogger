from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./ectlogger.db"
    
    # Backend Server
    backend_port: int = 8000  # Can be changed if port conflicts exist
    
    # Security
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 43200  # 30 days
    magic_link_expire_days: int = 30  # Magic link validity period
    
    # Logging
    log_level: str = "INFO"  # DEBUG, INFO, WARNING, ERROR
    log_file: Optional[str] = None  # Optional file path for Fail2Ban integration
    
    # Frontend
    frontend_url: str = "http://localhost:3000"
    
    # OAuth Providers
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    microsoft_client_id: Optional[str] = None
    microsoft_client_secret: Optional[str] = None
    github_client_id: Optional[str] = None
    github_client_secret: Optional[str] = None

    # GitHub Issues (in-app feedback bridge). Separate from the OAuth login
    # credentials above -- this needs a personal/fine-grained access token
    # with issues:write on github_issues_repo. Unset disables the bridge;
    # feedback submission still emails admins either way.
    github_issues_token: Optional[str] = None
    github_issues_repo: str = "bradbrownjr/ectlogger"

    # Email
    # Master send switch. False makes every send a no-op that logs the intended
    # recipient and returns, so a non-production instance cannot mail real users
    # no matter what the SMTP settings below point at. See docs/DEVELOPMENT.md
    # "Enabling and disabling outbound email".
    email_enabled: bool = True
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str
    smtp_password: str
    smtp_from_email: str
    smtp_from_name: str = "ECTLogger"
    
    # Application
    app_name: str = "ECTLogger"
    app_env: str = "development"
    
    # Deployment (used by start.sh, not the app itself)
    skip_vite: bool = False  # Set to true when Caddy serves static files
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
