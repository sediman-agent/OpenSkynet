#!/bin/bash

# Stop Script - Kills all running processes for the OpenSkynet project

echo "Stopping OpenSkynet processes..."

# Kill Electron app
echo "Stopping Electron app..."
pkill -f "Electron.*packages/app" 2>/dev/null && echo "  ✓ Electron stopped" || echo "  - Electron not running"

# Kill server
echo "Stopping server..."
pkill -f "bun.*server.*index.ts" 2>/dev/null && echo "  ✓ Server stopped" || echo "  - Server not running"

# Kill any process on port 3001
echo "Clearing port 3001..."
lsof -ti:3001 | xargs kill -9 2>/dev/null && echo "  ✓ Port 3001 cleared" || echo "  - Port 3001 already clear"

# Kill any process on port 9222 (CDP)
echo "Clearing port 9222..."
lsof -ti:9222 | xargs kill -9 2>/dev/null && echo "  ✓ Port 9222 cleared" || echo "  - Port 9222 already clear"

# Remove socket files
rm -f /tmp/sediman-python.sock /tmp/sediman.sock 2>/dev/null

echo ""
echo "All OpenSkynet processes stopped."
echo "You can now restart with: npm run electron:dev"
