-- =============================================
-- MultiChat PostgreSQL Schema
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avatar_color VARCHAR(7) DEFAULT '#4A90D9',
  status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_private BOOLEAN DEFAULT FALSE,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Room members
CREATE TABLE IF NOT EXISTS room_members (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  PRIMARY KEY (room_id, user_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'image')),
  edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Direct messages table
CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  receiver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Friendships table (NEW)
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID REFERENCES users(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, receiver_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender ON direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver ON direct_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_receiver ON friendships(receiver_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

-- Seed default rooms
INSERT INTO rooms (name, description, is_private) VALUES
  ('general', 'General discussion for everyone', FALSE),
  ('random', 'Off-topic conversations', FALSE),
  ('announcements', 'Important updates and news', FALSE)
ON CONFLICT DO NOTHING;

-- -- =============================================
-- -- MultiChat PostgreSQL Schema
-- -- =============================================

-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -- Users table
-- CREATE TABLE IF NOT EXISTS users (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   username VARCHAR(50) UNIQUE NOT NULL,
--   email VARCHAR(255) UNIQUE NOT NULL,
--   password_hash VARCHAR(255) NOT NULL,
--   avatar_color VARCHAR(7) DEFAULT '#4A90D9',
--   status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away')),
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   last_seen TIMESTAMPTZ DEFAULT NOW()
-- );

-- -- Rooms table
-- CREATE TABLE IF NOT EXISTS rooms (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   name VARCHAR(100) NOT NULL,
--   description TEXT,
--   is_private BOOLEAN DEFAULT FALSE,
--   owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- -- Room members
-- CREATE TABLE IF NOT EXISTS room_members (
--   room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
--   user_id UUID REFERENCES users(id) ON DELETE CASCADE,
--   joined_at TIMESTAMPTZ DEFAULT NOW(),
--   role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
--   PRIMARY KEY (room_id, user_id)
-- );

-- -- Messages table
-- CREATE TABLE IF NOT EXISTS messages (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
--   user_id UUID REFERENCES users(id) ON DELETE SET NULL,
--   content TEXT NOT NULL,
--   message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'system', 'image')),
--   edited BOOLEAN DEFAULT FALSE,
--   edited_at TIMESTAMPTZ,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- -- Direct messages table
-- CREATE TABLE IF NOT EXISTS direct_messages (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
--   receiver_id UUID REFERENCES users(id) ON DELETE SET NULL,
--   content TEXT NOT NULL,
--   read BOOLEAN DEFAULT FALSE,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- -- Indexes for performance
-- CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
-- CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
-- CREATE INDEX IF NOT EXISTS idx_direct_messages_sender ON direct_messages(sender_id);
-- CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver ON direct_messages(receiver_id);
-- CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);

-- -- Seed default rooms
-- INSERT INTO rooms (name, description, is_private) VALUES
--   ('general', 'General discussion for everyone', FALSE),
--   ('random', 'Off-topic conversations', FALSE),
--   ('announcements', 'Important updates and news', FALSE)
-- ON CONFLICT DO NOTHING;

