#!/usr/bin/env bash
# Build script for Render.com deployment

set -o errexit

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Create logs directory if it doesn't exist
mkdir -p logs

# Install Node.js dependencies for Convex
npm install

echo "Build completed successfully!"
