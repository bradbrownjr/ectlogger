# ECTLogger Environment Reference

This file contains environment information for AI coding agents to reference.

## Development Environments

### Local Development (Windows Laptop)
- **Purpose**: Code editing only - no scripts run locally
- **OS**: Windows
- **Actions**: Git operations, code editing

### Alpha Environment
- **Host**: `bradb@10.6.26.6`
- **OS**: Debian Linux LXC container
- **Python**: 3.13
- **App Path**: `~/ectlogger` (i.e., `/home/bradb/ectlogger`)
- **Frontend URL**: http://10.6.26.6:3000/
- **Backend URL**: http://10.6.26.6:8000/
- **Purpose**: Alpha/feature testing before beta

### Beta Environment
- **Host**: `bradb@10.6.26.3`
- **OS**: Debian Linux LXC container  
- **Python**: 3.13
- **App Path**: `~/ectlogger` (i.e., `/home/bradb/ectlogger`)
- **Frontend URL**: https://ectbeta.lynwood.us/
- **Backend URL**: https://ectbeta.lynwood.us/api/ (proxied)
- **Purpose**: Beta testing / current production

### Production Environment
- **Host**: `ectlogger@app.ectlogger.us`
- **OS**: Debian Linux VPS host 
- **Python**: 3.11.2
- **App Path**: `~/ectlogger`
- **Frontend URL**: http://app.ectlogger.us/
- **Backend URL**: http://app.ectlogger.us/api/ (proxied)
- **Purpose**: Current production

## Workflow

1. Develop and commit on local Windows laptop
2. Push to feature/alpha branch
3. Deploy to alpha environment (10.6.26.6) for dev testing
4. Once validated, merge to main and deploy to beta for beta testers (10.6.26.3)
5. Once approved for production, deploy to production environment (app.ectlogger.us)

## AI Agent SSH Limitations

**IMPORTANT**: The VS Code terminal cannot run interactive commands over SSH. Once an SSH session is established, the agent loses the ability to send input to the remote shell.

### What DOES NOT work:
```bash
# DON'T DO THIS - Agent can't interact after connection
ssh user@host
# Agent is stuck, cannot type commands
```

### What DOES work:
```bash
# Run commands inline via SSH
ssh user@host "cd ~/ectlogger && git pull"

# For non-interactive install (agent can do this)
ssh user@host "curl -fsSL https://raw.githubusercontent.com/bradbrownjr/ectlogger/main/bootstrap.sh | bash -s -- --non-interactive"

# Chain multiple commands
ssh user@host "cd ~/ectlogger && git pull && cd backend && source venv/bin/activate && pip install -r requirements.txt"
```

### For new installations by AI agent:
1. Use `--non-interactive` flag with bootstrap script
2. After install, manually configure `backend/.env` with SMTP settings
3. Or have user run `./configure.sh` interactively themselves

### For new installations by humans:
The bootstrap script now auto-detects when piped (`curl | bash`) and saves itself to a temp file, prompting the user to run it properly for interactive configuration. Users just run:
```bash
curl -fsSL https://raw.githubusercontent.com/bradbrownjr/ectlogger/main/bootstrap.sh | bash
# Then follow the on-screen instructions to run the saved script
```

## Important Notes

- **No scripts are run locally** on the dev laptop
- All testing happens on the Linux LXC containers
- Alpha is for experimental features, beta is user-facing
- AI can not run any commands once an SSH connection is established, commands must be sent as part of the SSH connection. If the session hangs because it's waiting for output that doesn't happen, the user may need to hit control+C to kill the hung command.