#!/usr/bin/env bash

# Exit on error is removed to allow the script to handle "already exists" warnings gracefully
echo "🚀 Starting MultiChat Setup for Ubuntu..."

PROJECT_DIR="$(pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
SCHEMA_FILE="$BACKEND_DIR/schema.sql"

# Matching your environment
DB_NAME="multichat"
DB_USER="multichat"
DB_PASS="multichatpass"
DB_PORT="5432" 

# [1] System Dependencies for Ubuntu
echo "[1] Updating system and installing Node.js/Postgres..."
sudo apt update
sudo apt install -y curl build-essential postgresql postgresql-contrib

if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi

# [2] Start PostgreSQL
echo "[2] Starting PostgreSQL service..."
sudo systemctl enable postgresql
sudo systemctl start postgresql
sleep 2

# [3] Database & User Setup
echo "[3] Configuring Database..."
sudo -u postgres psql -c "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';" || true
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" || true

# [4] Loading Schema
if [ -f "$SCHEMA_FILE" ]; then
    echo "[4] Loading schema from $SCHEMA_FILE..."
    export PGPASSWORD="$DB_PASS"
    psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCHEMA_FILE"
    unset PGPASSWORD
else
    echo "⚠️ Schema file not found. Skipping import."
fi

# [5] Backend Installation
echo "[5] Installing Backend dependencies..."
cd "$BACKEND_DIR"
sudo chown -R $USER:$USER .
if [ ! -f package.json ]; then npm init -y; fi

# Explicitly install all the modules your backend needs
npm install dotenv express socket.io pg cors jsonwebtoken --save
npm install

# [6] Frontend Installation (SAFE MODE)
echo "[6] Installing Frontend dependencies (Protecting App.jsx)..."
cd "$FRONTEND_DIR"
sudo chown -R $USER:$USER .
if [ ! -f package.json ]; then npm init -y; fi

# Install Vite/React without using 'create vite' (so your files are safe)
npm install vite @vitejs/plugin-react react react-dom socket.io-client --save

# Ensure 'npm run dev' works by adding the script to package.json
node -e "const pkg = require('./package.json'); if (!pkg.scripts.dev) { pkg.scripts.dev = 'vite'; require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2)) }"

echo ""
echo "=========================================="
echo "✅ UBUNTU SETUP COMPLETE!"
echo "=========================================="
echo "Backend:  cd backend && node src/server.js"
echo "Frontend: cd frontend && npm run dev"
echo "=========================================="