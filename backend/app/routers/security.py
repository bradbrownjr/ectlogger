from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import subprocess
import os

from app.models import User, UserRole
from app.dependencies import get_current_user
from app.config import settings
from app.logger import logger

router = APIRouter(prefix="/security", tags=["security"])


class Fail2BanStatus(BaseModel):
    installed: bool
    running: bool
    jail_enabled: bool
    currently_banned: int
    total_banned: int
    banned_ips: List[str]
    log_file_configured: bool
    log_file_path: Optional[str]


class SecurityLogEntry(BaseModel):
    timestamp: str
    level: str
    category: str
    message: str
    ip: Optional[str]


class SecurityInfo(BaseModel):
    fail2ban: Fail2BanStatus
    recent_auth_events: List[SecurityLogEntry]


def run_command(cmd: List[str], timeout: int = 5) -> tuple[bool, str]:
    """Run a shell command and return success status and output"""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "Command timed out"
    except FileNotFoundError:
        return False, "Command not found"
    except Exception as e:
        return False, str(e)


def get_fail2ban_status() -> Fail2BanStatus:
    """Get Fail2Ban status for the ectlogger jail"""
    status = Fail2BanStatus(
        installed=False,
        running=False,
        jail_enabled=False,
        currently_banned=0,
        total_banned=0,
        banned_ips=[],
        log_file_configured=bool(settings.log_file),
        log_file_path=settings.log_file
    )
    
    # Check if fail2ban-client exists
    success, output = run_command(["which", "fail2ban-client"])
    if not success:
        return status
    
    status.installed = True
    
    # Check if fail2ban service is running
    success, output = run_command(["systemctl", "is-active", "fail2ban"])
    if not success or "active" not in output:
        return status
    
    status.running = True
    
    # Get ectlogger jail status
    success, output = run_command(["fail2ban-client", "status", "ectlogger"])
    if not success:
        return status
    
    status.jail_enabled = True
    
    # Parse the output
    for line in output.split('\n'):
        line = line.strip()
        if 'Currently banned:' in line:
            try:
                status.currently_banned = int(line.split(':')[1].strip())
            except (ValueError, IndexError):
                pass
        elif 'Total banned:' in line:
            try:
                status.total_banned = int(line.split(':')[1].strip())
            except (ValueError, IndexError):
                pass
        elif 'Banned IP list:' in line:
            try:
                ip_part = line.split(':')[1].strip()
                if ip_part:
                    status.banned_ips = [ip.strip() for ip in ip_part.split() if ip.strip()]
            except IndexError:
                pass
    
    return status


def get_recent_security_events(limit: int = 50) -> List[SecurityLogEntry]:
    """Read recent security-related events from the log file"""
    events = []
    
    if not settings.log_file or not os.path.exists(settings.log_file):
        return events
    
    try:
        # Read last N lines from log file
        with open(settings.log_file, 'r') as f:
            lines = f.readlines()
        
        # Filter for security-relevant events (AUTH, SECURITY categories)
        for line in reversed(lines[-500:]):  # Check last 500 lines
            line = line.strip()
            if not line:
                continue
            
            # Parse log format: YYYY-MM-DD HH:MM:SS [LEVEL] [CATEGORY] message - IP: x.x.x.x
            try:
                # Split timestamp
                parts = line.split(' ', 2)
                if len(parts) < 3:
                    continue
                
                timestamp = f"{parts[0]} {parts[1]}"
                rest = parts[2]
                
                # Extract level
                if '[' not in rest:
                    continue
                level_start = rest.index('[')
                level_end = rest.index(']', level_start)
                level = rest[level_start+1:level_end]
                rest = rest[level_end+1:].strip()
                
                # Extract category
                if '[' not in rest:
                    continue
                cat_start = rest.index('[')
                cat_end = rest.index(']', cat_start)
                category = rest[cat_start+1:cat_end]
                message = rest[cat_end+1:].strip()
                
                # Only include AUTH and SECURITY events
                if category not in ['AUTH', 'SECURITY']:
                    continue
                
                # Extract IP if present
                ip = None
                if ' - IP: ' in message:
                    parts = message.rsplit(' - IP: ', 1)
                    message = parts[0]
                    ip = parts[1] if len(parts) > 1 else None
                
                events.append(SecurityLogEntry(
                    timestamp=timestamp,
                    level=level,
                    category=category,
                    message=message,
                    ip=ip
                ))
                
                if len(events) >= limit:
                    break
                    
            except (ValueError, IndexError):
                continue
                
    except Exception as e:
        logger.error("SECURITY", f"Error reading log file: {e}")
    
    return events


@router.get("/info", response_model=SecurityInfo)
async def get_security_info(
    current_user: User = Depends(get_current_user)
):
    """Get security information including Fail2Ban status (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return SecurityInfo(
        fail2ban=get_fail2ban_status(),
        recent_auth_events=get_recent_security_events()
    )


@router.post("/unban/{ip}")
async def unban_ip(
    ip: str,
    current_user: User = Depends(get_current_user)
):
    """Unban an IP address from Fail2Ban (admin only)"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Validate IP format (basic check)
    parts = ip.split('.')
    if len(parts) != 4:
        raise HTTPException(status_code=400, detail="Invalid IP address format")
    
    try:
        for part in parts:
            num = int(part)
            if num < 0 or num > 255:
                raise HTTPException(status_code=400, detail="Invalid IP address format")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid IP address format")
    
    # Try to unban the IP
    success, output = run_command(["fail2ban-client", "set", "ectlogger", "unbanip", ip])
    
    if not success:
        raise HTTPException(status_code=500, detail=f"Failed to unban IP: {output}")
    
    logger.info("SECURITY", f"Admin {current_user.email} unbanned IP: {ip}")
    
    return {"message": f"IP {ip} has been unbanned", "ip": ip}
