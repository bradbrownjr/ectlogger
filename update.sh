#!/bin/bash

# ECTLogger Update Checker
# Checks for new versions on GitHub and offers to update

echo "🔄 ECTLogger Update Checker"
echo "============================"
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "✗ Git not found. Please install git to check for updates."
    exit 1
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "✗ Not a git repository. Cannot check for updates."
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Current branch: $CURRENT_BRANCH"

# Get current commit
CURRENT_COMMIT=$(git rev-parse HEAD)
echo "Current commit: ${CURRENT_COMMIT:0:7}"
echo ""

# Fetch latest changes from remote
echo "Checking for updates..."
git fetch origin $CURRENT_BRANCH --quiet

# Get remote commit
REMOTE_COMMIT=$(git rev-parse origin/$CURRENT_BRANCH)

# Compare commits
if [ "$CURRENT_COMMIT" = "$REMOTE_COMMIT" ]; then
    echo "✓ You are running the latest version!"
    exit 0
fi

# Show what's new
echo "📦 New version available!"
echo ""
echo "Changes since your version:"
echo "----------------------------------------"
git log --oneline $CURRENT_COMMIT..$REMOTE_COMMIT | head -10
echo "----------------------------------------"
echo ""

# Check for local changes
HAS_LOCAL_CHANGES=false
if ! git diff-index --quiet HEAD --; then
    HAS_LOCAL_CHANGES=true
    echo "⚠️  Warning: You have uncommitted local changes."
    echo "Local configuration files (.env) will be preserved."
    echo ""
fi

# Offer to update
echo "Would you like to update now? (Y/n)"
read -r response

if [[ "$response" =~ ^[Nn]$ ]]; then
    echo "Update cancelled. You can update later by running: ./update.sh"
    exit 0
fi

echo ""
echo "Updating ECTLogger..."

# Stash local changes if needed
if [ "$HAS_LOCAL_CHANGES" = true ]; then
    echo "Preserving local changes..."
    git stash push -m "Auto-stash before update $(date)" --quiet
fi

# Pull changes
if git pull origin $CURRENT_BRANCH; then
    echo "✓ Code updated successfully"
    
    # Restore local changes
    if [ "$HAS_LOCAL_CHANGES" = true ]; then
        echo "Restoring local changes..."
        if git stash pop --quiet 2>/dev/null; then
            echo "✓ Local changes restored"
        else
            echo "⚠️  Some local changes couldn't be restored automatically."
            echo "   Run 'git stash list' to see stashed changes."
        fi
    fi
    
    # Make scripts executable
    echo "Setting script permissions..."
    chmod +x *.sh 2>/dev/null
    echo "✓ Script permissions updated"
    
    # Check if requirements changed
    if git diff --name-only $CURRENT_COMMIT $REMOTE_COMMIT | grep -q "backend/requirements.txt"; then
        echo ""
        echo "📦 Python dependencies changed. Updating..."
        cd backend
        source venv/bin/activate 2>/dev/null || . venv/bin/activate
        pip install -r requirements.txt --upgrade
        cd ..
        echo "✓ Backend dependencies updated"
    fi
    
    # Check if package.json changed
    if git diff --name-only $CURRENT_COMMIT $REMOTE_COMMIT | grep -q "frontend/package.json"; then
        echo ""
        echo "📦 Frontend dependencies changed. Updating..."
        cd frontend
        npm install
        cd ..
        echo "✓ Frontend dependencies updated"
    fi
    
    echo ""
    echo "✓ Update complete!"
    echo ""
    echo "⚠️  Please restart the application:"
    echo "  1. Stop current servers (Ctrl+C if running)"
    echo "  2. Run: ./start.sh"
    
else
    echo "✗ Update failed. Please resolve any conflicts manually."
    exit 1
fi
