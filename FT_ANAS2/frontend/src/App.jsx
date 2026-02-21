import React, { useState, useEffect } from 'react';
import socket from './socket';

export default function App() {
  const [view, setView] = useState('landing');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [roomId, setRoomId] = useState(null);
  const [user, setUser] = useState(null);
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: '' });
  const [authMode, setAuthMode] = useState('login');
  const [dmTarget, setDmTarget] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [dmInput, setDmInput] = useState('');
  const [unread, setUnread] = useState({});
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);

  const token = () => localStorage.getItem('token');
  const headers = () => ({ Authorization: `Bearer ${token()}` });

  const fetchUnread = () => {
    fetch('http://localhost:3001/api/dm/unread', { headers: headers() })
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        const map = {};
        data.forEach(row => { map[row.sender_id] = row.count; });
        setUnread(map);
      }).catch(() => {});
  };

  const fetchFriends = () => {
    fetch('http://localhost:3001/api/friends', { headers: headers() })
      .then(r => r.json()).then(d => Array.isArray(d) && setFriends(d)).catch(() => {});
    fetch('http://localhost:3001/api/friends/pending', { headers: headers() })
      .then(r => r.json()).then(d => Array.isArray(d) && setPending(d)).catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    fetch('http://localhost:3001/api/auth/users', { headers: headers() })
      .then(r => r.json())
      .then(data => Array.isArray(data) && setUsers(data))
      .catch(() => {});
    fetchUnread();
    fetchFriends();
  }, [user]);

  const dmTargetRef = React.useRef(dmTarget);
  useEffect(() => { dmTargetRef.current = dmTarget; }, [dmTarget]);

  useEffect(() => {
    if (!user) return;
    const handleNewDM = (dm) => {
      setDmMessages(prev => [...prev, dm]);
      if (dm.sender_id !== dmTargetRef.current?.id) {
        setUnread(prev => ({ ...prev, [dm.sender_id]: (prev[dm.sender_id] || 0) + 1 }));
      }
    };
    socket.on('new dm', handleNewDM);
    return () => socket.off('new dm', handleNewDM);
  }, [user]); // ← dmTarget removed from deps


  useEffect(() => {
    const t = token();
    if (t) {
      fetch('http://localhost:3001/api/auth/me', { headers: { Authorization: `Bearer ${t}` } })
        .then(r => r.json())
        .then(data => { if (data.id) setUser(data); })
        .catch(() => localStorage.removeItem('token'));
    }

    const joinRoom = () => {
      fetch('http://localhost:3001/api/rooms/public')
        .then(r => r.json())
        .then(rooms => {
          if (!Array.isArray(rooms)) return;
          const general = rooms.find(r => r.name === 'general');
          if (general) { setRoomId(general.id); socket.emit('join room', general.id); }
        });
    };

    if (socket.connected) joinRoom();
    socket.on('connect', joinRoom);
    socket.on('chat history', (msgs) => setMessages(msgs));
    socket.on('chat message', (msg) => setMessages(prev => [...prev, msg]));

    return () => {
      socket.off('connect', joinRoom);
      socket.off('chat history');
      socket.off('chat message');
    };
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    const url = `http://localhost:3001/api/auth/${authMode}`;
    const body = authMode === 'login'
      ? { email: authForm.email, password: authForm.password }
      : { username: authForm.username, email: authForm.email, password: authForm.password };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('token', data.token);
      setUser(data.user);
      window.location.reload();
    } else { alert(data.error); }
  };

  const sendMessage = () => {
    if (!input.trim() || !roomId) return;
    socket.emit('chat message', { room_id: roomId, content: input });
    setInput('');
  };

  const openDM = (targetUser) => {
  setDmTarget(targetUser);
  setDmMessages([]); // ← clear old messages before loading new ones
  setView('dm');
  setUnread(prev => ({ ...prev, [targetUser.id]: 0 }));
  fetch(`http://localhost:3001/api/dm/${targetUser.id}`, { headers: headers() })
    .then(r => r.json())
    .then(data => Array.isArray(data) && setDmMessages(data));
};
  const sendDM = () => {
    if (!dmInput.trim() || !dmTarget) return;
    socket.emit('send dm', { receiverId: dmTarget.id, content: dmInput });
    setDmInput('');
  };

  const sendRequest = (userId) => {
    fetch(`http://localhost:3001/api/friends/request/${userId}`, {
      method: 'POST', headers: headers()
    }).then(() => fetchFriends());
  };

  const acceptRequest = (userId) => {
    fetch(`http://localhost:3001/api/friends/accept/${userId}`, {
      method: 'POST', headers: headers()
    }).then(() => fetchFriends());
  };

  const removeFriend = (userId) => {
    fetch(`http://localhost:3001/api/friends/${userId}`, {
      method: 'DELETE', headers: headers()
    }).then(() => fetchFriends());
  };

  const getFriendStatus = (userId) => {
    if (friends.find(f => f.id === userId)) return 'friend';
    if (pending.find(p => p.user_id === userId)) return 'pending';
    return 'none';
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    window.location.reload();
  };

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  // ── Auth ────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={{ maxWidth: 400, margin: '100px auto', padding: 20 }}>
        <h2>{authMode === 'login' ? 'Login' : 'Register'}</h2>
        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {authMode === 'register' && (
            <input placeholder="Username" value={authForm.username}
              onChange={e => setAuthForm(p => ({ ...p, username: e.target.value }))} required />
          )}
          <input placeholder="Email" type="email" value={authForm.email}
            onChange={e => setAuthForm(p => ({ ...p, email: e.target.value }))} required />
          <input placeholder="Password" type="password" value={authForm.password}
            onChange={e => setAuthForm(p => ({ ...p, password: e.target.value }))} required />
          <button type="submit">{authMode === 'login' ? 'Login' : 'Register'}</button>
        </form>
        <button onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
          style={{ marginTop: 10 }}>
          {authMode === 'login' ? 'Need an account? Register' : 'Have an account? Login'}
        </button>
      </div>
    );
  }

  // ── Landing ─────────────────────────────────────────────────────────────
  if (view === 'landing') {
    return (
      <div style={{ padding: 20, minHeight: '100vh' }}>
        <div style={{ position: 'fixed', top: 20, right: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
          <div onClick={() => setView('chat')} style={{ cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 36, background: '#f0f4ff', borderRadius: 12,
              padding: '10px 14px', border: '2px solid #d0d8ff' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>🗨️</div>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#666' }}>Chat</p>
          </div>

          <div onClick={() => setView('users')} style={{ cursor: 'pointer', textAlign: 'center' }}>
            <div style={{ fontSize: 36, background: '#fff4f0', borderRadius: 12,
              padding: '10px 14px', border: '2px solid #ffd0c0',
              position: 'relative', display: 'inline-block' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
              💬
              {totalUnread > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 4,
                  background: 'red', color: 'white', borderRadius: '50%',
                  width: 18, height: 18, fontSize: 10, fontWeight: 'bold',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#666' }}>DMs</p>
          </div>

          <button onClick={logout} style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
            Logout
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: '30vh' }}>
          <h1>Welcome, {user.username} 👋</h1>
          <p style={{ color: '#666' }}>Click an icon in the top right to get started.</p>
        </div>
      </div>
    );
  }

  // ── Users + Friends list ─────────────────────────────────────────────────
  if (view === 'users') {
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setView('landing')}>← Back</button>
          <h2 style={{ margin: 0 }}>Users & Friends</h2>
        </div>

        {/* Pending friend requests */}
        {pending.length > 0 && (
          <div style={{ marginBottom: 20, padding: 12,
            background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8 }}>
            <h4 style={{ margin: '0 0 10px' }}>📬 Friend Requests ({pending.length})</h4>
            {pending.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #ffe58f' }}>
                <span style={{ fontWeight: 'bold' }}>{p.username}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => acceptRequest(p.user_id)}
                    style={{ background: '#52c41a', color: 'white', border: 'none',
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                    ✓ Accept
                  </button>
                  <button onClick={() => removeFriend(p.user_id)}
                    style={{ background: '#ff4d4f', color: 'white', border: 'none',
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                    ✕ Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* All users */}
        <h4 style={{ margin: '0 0 10px' }}>All Users</h4>
        {users.length === 0 && <p style={{ color: '#999' }}>No other users yet.</p>}
        {users.map(u => {
          const status = getFriendStatus(u.id);
          return (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '10px 12px', borderRadius: 8,
              border: '1px solid #eee', marginBottom: 8, background: 'white' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%',
                  background: u.avatar_color || '#ccc',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 'bold', fontSize: 14 }}>
                  {u.username[0].toUpperCase()}
                </div>
                <div>
                  <span style={{ fontWeight: 'bold' }}>{u.username}</span>
                  {status === 'friend' && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'green' }}>✓ Friend</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {unread[u.id] > 0 && (
                  <span style={{ background: 'red', color: 'white', borderRadius: '50%',
                    width: 22, height: 22, fontSize: 11, fontWeight: 'bold',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {unread[u.id] > 9 ? '9+' : unread[u.id]}
                  </span>
                )}
                <button onClick={() => openDM(u)}
                  style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                    borderRadius: 6, border: '1px solid #ccc' }}>
                  💬 DM
                </button>
                {status === 'none' && (
                  <button onClick={() => sendRequest(u.id)}
                    style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                      borderRadius: 6, background: '#1890ff', color: 'white', border: 'none' }}>
                    + Add
                  </button>
                )}
                {status === 'friend' && (
                  <button onClick={() => removeFriend(u.id)}
                    style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer',
                      borderRadius: 6, background: '#ff4d4f', color: 'white', border: 'none' }}>
                    Remove
                  </button>
                )}
                {status === 'pending' && (
                  <span style={{ fontSize: 11, color: '#999', fontStyle: 'italic' }}>Pending...</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── DM conversation ──────────────────────────────────────────────────────
  if (view === 'dm' && dmTarget) {
    return (
      <div style={{ maxWidth: 600, margin: '60px auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => { setDmMessages([]); setView('users'); fetchUnread(); }}>← Back</button>
          <h2 style={{ margin: 0 }}>💬 {dmTarget.username}</h2>
        </div>
        <div style={{ border: '1px solid #ccc', minHeight: 300, padding: 10,
          borderRadius: 8, marginBottom: 10 }}>
          {dmMessages.length === 0 && <div style={{ color: '#999' }}>No messages yet...</div>}
          {dmMessages.map((m, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <strong style={{ color: m.sender_avatar_color || '#333' }}>
                {m.sender_username || 'unknown'}:
              </strong>{' '}{m.content}
            </div>
          ))}
        </div>
        <input value={dmInput} onChange={e => setDmInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendDM()}
          placeholder={`Message ${dmTarget.username}...`}
          style={{ width: '80%', padding: 8 }} />
        <button onClick={sendDM} style={{ padding: 8 }}>Send</button>
      </div>
    );
  }

  // ── Chat room ────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => { setView('landing'); fetchUnread(); }}>← Back</button>
          <h2 style={{ margin: 0 }}># general</h2>
        </div>
        <span style={{ color: '#666' }}>👤 {user.username}</span>
      </div>
      <div style={{ border: '1px solid #ccc', minHeight: 400, padding: 10,
        borderRadius: 8, marginBottom: 10 }}>
        {messages.length === 0 && <div style={{ color: '#999' }}>No messages yet...</div>}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            <strong style={{ color: m.avatar_color || '#333' }}>
              {m.username || 'anonymous'}:
            </strong>{' '}{m.content}
          </div>
        ))}
      </div>
      <input value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && sendMessage()}
        placeholder="Type a message..." style={{ width: '80%', padding: 8 }} />
      <button onClick={sendMessage} style={{ padding: 8 }}>Send</button>
    </div>
  );
}
