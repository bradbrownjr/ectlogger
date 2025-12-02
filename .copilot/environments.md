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

## Important Notes

- **No scripts are run locally** on the dev laptop
- All testing happens on the Linux LXC containers
- Alpha is for experimental features, beta is user-facing
