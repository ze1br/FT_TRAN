# MultiChat

Real-time multi-room chat built with Express.js + Socket.io + React + PostgreSQL.

---
Frontend: React
Backend: Express.js + Socket.io
Database: PostgreSQL
Driver: pg (node-postgres)

## Stack

| Layer     | Tech                          |
|-----------|-------------------------------|
| Backend   | Node.js / Express.js          |
| Realtime  | Socket.io (WebSocket)         |
| Database  | PostgreSQL                    |
| Auth      | JWT (jsonwebtoken) + bcryptjs |
| Frontend  | React 18 + Socket.io-client   |

---

## Project Structure

```
multichat/
├── backend/
│   ├── src/
│   │   ├── server.js            # Express + Socket.io entry
│   │   ├── db.js                # pg Pool wrapper
│   │   ├── auth.js              # JWT middleware
│   │   ├── socketHandlers.js    # All Socket.io events
│   │   └── routes/
│   │       ├── authRoutes.js    # /api/auth/*
│   │       ├── roomRoutes.js    # /api/rooms/*
│   │       └── dmRoutes.js      # /api/dm/*
│   ├── schema.sql               # PostgreSQL schema + seed data
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── App.jsx              # Root + routing logic
    │   ├── hooks/
    │   │   ├── useAuth.js       # Auth context + axios API
    │   │   └── useSocket.js     # Socket context + helpers
    │   └── components/
    │       ├── AuthPage.jsx     # Login / Register UI
    │       ├── Sidebar.jsx      # Room list + DM list
    │       ├── ChatRoom.jsx     # Room view + history
    │       ├── DirectMessage.jsx # DM conversation view
    │       ├── MessageList.jsx  # Message renderer
    │       └── MessageInput.jsx # Input + typing indicator
    ├── public/index.html
    └── package.json
```

---

## Setup

### 1. PostgreSQL

```bash
createdb multichat
psql multichat < backend/schema.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_SECRET, CLIENT_ORIGIN
npm install
npm run dev
# Runs on http://localhost:3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm start
# Runs on http://localhost:3000
```

---

## API Endpoints

### Auth
| Method | Path              | Auth | Description          |
|--------|-------------------|------|----------------------|
| POST   | /api/auth/register | No  | Register new user     |
| POST   | /api/auth/login    | No  | Login, receive JWT    |
| GET    | /api/auth/me       | Yes | Get current user      |

### Rooms
| Method | Path                       | Auth | Description           |
|--------|----------------------------|------|-----------------------|
| GET    | /api/rooms                 | Yes  | List all rooms        |
| POST   | /api/rooms                 | Yes  | Create a room         |
| POST   | /api/rooms/:id/join        | Yes  | Join a room           |
| GET    | /api/rooms/:id/messages    | Yes  | Get room history      |
| GET    | /api/rooms/:id/members     | Yes  | Get room members      |

### Direct Messages
| Method | Path               | Auth | Description              |
|--------|--------------------|------|--------------------------|
| GET    | /api/dm            | Yes  | List DM conversations    |
| GET    | /api/dm/:userId    | Yes  | Get DM history with user |

---

## Socket.io Events

### Client → Server
| Event          | Payload                          | Description             |
|----------------|----------------------------------|-------------------------|
| join_room      | { roomId }                       | Subscribe to room       |
| leave_room     | { roomId }                       | Unsubscribe             |
| send_message   | { roomId, content }              | Send to room            |
| send_dm        | { receiverId, content }          | Send direct message     |
| typing_start   | { roomId }                       | Broadcast typing        |
| typing_stop    | { roomId }                       | Stop typing             |
| dm_typing_start| { receiverId }                   | DM typing indicator     |
| dm_typing_stop | { receiverId }                   | Stop DM typing          |
| edit_message   | { messageId, content, roomId }   | Edit own message        |
| delete_message | { messageId, roomId }            | Delete own message      |

### Server → Client
| Event            | Description                       |
|------------------|-----------------------------------|
| new_message      | New room message                  |
| new_dm           | New direct message                |
| message_edited   | Message was edited                |
| message_deleted  | Message was deleted               |
| user_typing      | User started typing in room       |
| user_stop_typing | User stopped typing               |
| dm_user_typing   | User typing in DM                 |
| online_users     | Updated list of online user IDs   |
| user_joined      | User joined a room                |
| user_left        | User left a room                  |

---

## Features

- JWT-based authentication (register / login / persistent session)
- Multi-room chat with channel creation
- Direct messaging (1:1)
- Real-time online presence tracking
- Typing indicators (rooms + DMs)
- Message edit / delete (own messages)
- Cursor-based pagination for message history
- Auto-join to seeded rooms (general, random, announcements)
- Graceful disconnect handling

---

## Optional Enhancements (not implemented)

- `/api/users` endpoint to list all users (add for full DM list in sidebar)
- File/image uploads (add multer + S3)
- Message reactions
- Notification badges per room
- Push notifications (web-push)
- Rate limiting (express-rate-limit)
- Helmet.js security headers
