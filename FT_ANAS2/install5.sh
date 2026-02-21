#!/usr/bin/env bash

set -e

echo "=== MultiChat Auto Setup Script ==="

PROJECT_DIR="$(pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
SCHEMA_FILE="$BACKEND_DIR/schema.sql"

DB_NAME="multichat"
DB_USER="multichat"
DB_PASS="multichatpass"
DB_PORT="5432"

############################################
echo "[0] Checking Node.js and npm..."

if ! command -v node >/dev/null 2>&1; then
    echo "Installing Node.js (20 LTS)..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "Node.js already installed: $(node -v)"
    echo "npm version: $(npm -v)"
fi
############################################

echo "[1] Checking PostgreSQL..."

if ! command -v psql >/dev/null 2>&1; then
    echo "Installing PostgreSQL..."
    sudo apt update
    sudo apt install -y postgresql postgresql-contrib
fi

echo "[2] Starting PostgreSQL service..."
sudo systemctl enable postgresql
sudo systemctl start postgresql

echo "[3] Creating database and user if not exists..."

# Ensure role exists
if ! sudo -u postgres psql -p "$DB_PORT" -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    echo "Creating role $DB_USER..."
    sudo -u postgres psql -p "$DB_PORT" -c "CREATE ROLE $DB_USER LOGIN;"
fi

# Always reset password
echo "Updating password for $DB_USER..."
sudo -u postgres psql -p "$DB_PORT" -c "ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS';"

# Create database if not exists
if ! sudo -u postgres psql -p "$DB_PORT" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    echo "Creating database $DB_NAME..."
    sudo -u postgres psql -p "$DB_PORT" -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
fi

# ... (previous steps up to creating the database)

echo "[4] Enabling UUID extension..."
sudo -u postgres psql -p "$DB_PORT" -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

echo "[5] Loading schema..."
export PGPASSWORD="$DB_PASS"
psql -h 127.0.0.1 -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SCHEMA_FILE"
unset PGPASSWORD

echo "[6] Granting privileges..."
sudo -u postgres psql -p "$DB_PORT" -d "$DB_NAME" <<EOF
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
EOF

echo "[7] Installing backend dependencies..."
cd "$BACKEND_DIR"
sudo chown -R $USER:$USER .
npm install

echo "[8] Installing frontend dependencies..."
cd "$FRONTEND_DIR"
npm install


# ... rest

########################################

# [6] Installing Backend Dependencies
echo "[6] Setting up Backend..."
cd "$BACKEND_DIR"
sudo chown -R $USER:$USER .
if [ ! -f package.json ]; then npm init -y; fi
npm install dotenv express socket.io pg cors jsonwebtoken --save
npm install

# [7] Installing Frontend Dependencies (SAFE MODE)
echo "[7] Setting up Frontend..."
cd "$FRONTEND_DIR"
sudo chown -R $USER:$USER .
if [ ! -f package.json ]; then npm init -y; fi
npm install vite @vitejs/plugin-react react react-dom socket.io-client --save

# Ensure dev script exists
node -e "const pkg = require('./package.json'); if (!pkg.scripts.dev) { pkg.scripts.dev = 'vite'; require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2)) }"
npm install

########################################



echo ""
echo "=================================="
echo "✅ Setup complete!"
echo "=================================="
echo ""
echo "Backend:  cd backend && node src/server.js"
echo "Frontend: cd frontend && npm run dev"
echo ""


