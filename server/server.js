require('dotenv').config();
const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const db = require('./database');
const fs = require('fs');

const app = express();
const upload = multer({ dest: '../uploads/' });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// In-memory presence tracking
const onlineUsers = {}; // { userId: { ws, lastActive: Date } }

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('../uploads', express.static('uploads'));
app.use(express.static(path.join(__dirname, '../public')));

// Authentication middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

// Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

    const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (exists) return res.status(400).json({ error: 'Username taken' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare(`
      INSERT INTO users (username, password_hash) 
      VALUES (?, ?)
    `).run(username, hashedPassword);

    // Fetch the new user info
    const newUser = db.prepare('SELECT id, username, avatar, last_online FROM users WHERE id = ?').get(result.lastInsertRowid);

    // Broadcast to all clients
    broadcastAll({
      type: 'new-contact',
      contact: {
        ...newUser,
        isOnline: false,
        isIdle: false
      }
    });

    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        lastOnline: user.last_online
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/contacts', authenticate, (req, res) => {
  try {
    const contacts = db.prepare(`
      SELECT id, username, avatar, last_online 
      FROM users 
      WHERE id != ?
      ORDER BY last_online DESC
    `).all(req.user.id);

    const now = Date.now();
    res.json(contacts.map(c => {
      const onlineInfo = onlineUsers[c.id];
      let isOnline = false, isIdle = false;
      if (onlineInfo) {
        const diff = now - onlineInfo.lastActive;
        if (diff <= 5 * 60 * 1000) {
          isOnline = true;
        } else {
          isIdle = true;
        }
      }
      return {
        ...c,
        isOnline,
        isIdle
      };
    }));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load contacts' });
  }
});

app.get('/api/messages', authenticate, (req, res) => {
  try {
    const { contactId } = req.query;
    const messages = db.prepare(`
      SELECT m.*, 
        (SELECT GROUP_CONCAT(emoji) FROM reactions WHERE message_id = m.id) AS reactions
      FROM messages m
      WHERE (sender_id = ? AND receiver_id = ?)
        OR (sender_id = ? AND receiver_id = ?)
      ORDER BY timestamp ASC
    `).all(req.user.id, contactId, contactId, req.user.id);

    res.json(messages.map(msg => ({
      ...msg,
      reactions: msg.reactions ? msg.reactions.split(',') : [],
      timestamp: new Date(msg.timestamp).toISOString()
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    res.json({
      url: `../uploads/${req.file.filename}`,
      name: req.file.originalname,
      type: req.file.mimetype.startsWith('image/') ? 'image' : 'file'
    });
  } catch (err) {
    res.status(500).json({ error: 'File upload failed' });
  }
});

app.post('/api/avatar', authenticate, upload.single('avatar'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Get current avatar path from DB
    const user = db.prepare('SELECT avatar FROM users WHERE id = ?').get(req.user.id);
    const oldAvatar = user && user.avatar;

    // Save new avatar
    const avatarUrl = `./uploads/${req.file.filename}`;
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatarUrl, req.user.id);

    // Delete old avatar file if it exists and is not the default
    if (oldAvatar && oldAvatar.startsWith('../uploads/') && oldAvatar !== avatarUrl) {
      const relativePath = oldAvatar.startsWith('/') ? oldAvatar.slice(1) : oldAvatar;
      const oldAvatarPath = path.join(__dirname, '..', relativePath);
      fs.unlink(oldAvatarPath, err => {
        if (err) {
          console.error('Failed to delete old avatar:', oldAvatarPath, err);
        } else {
          console.log('Deleted old avatar:', oldAvatarPath);
        }
      });
    }

    res.json({ avatar: avatarUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});

app.get('/api/user', authenticate, (req, res) => {
  try {
    const user = db.prepare('SELECT id, username, avatar, last_online FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// WebSocket Server
const server = app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`));

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get('token');

  try {
    const user = jwt.verify(token, JWT_SECRET);
    ws.userId = user.id;

    // Mark user as online and set lastActive
    onlineUsers[user.id] = { ws, lastActive: Date.now() };

    db.prepare(`UPDATE users SET last_online = datetime('now') WHERE id = ?`)
      .run(user.id);

    ws.on('message', data => handleMessage(ws, data));
    ws.on('close', () => {
      db.prepare(`UPDATE users SET last_online = datetime('now') WHERE id = ?`).run(ws.userId);
      delete onlineUsers[ws.userId];
      broadcastPresence(ws.userId, false, false);
    });

    // Immediately broadcast online presence
    broadcastPresence(user.id, true, false);

  } catch (err) {
    ws.close(1008, 'Invalid token');
  }
});

function handleMessage(ws, data) {
  try {
    const message = JSON.parse(data);

    // Update lastActive on any message
    if (ws.userId && onlineUsers[ws.userId]) {
      onlineUsers[ws.userId].lastActive = Date.now();
    }

    switch (message.type) {
      case 'message':
        const result = db.prepare(`
          INSERT INTO messages (sender_id, receiver_id, content, type, status)
          VALUES (?, ?, ?, ?, 'sent')
        `).run(message.senderId, message.receiverId, message.content, message.messageType);

        const newMessage = db.prepare(`
          SELECT *, datetime(timestamp, 'localtime') AS formatted_time 
          FROM messages WHERE id = ?
        `).get(result.lastInsertRowid);

        broadcast([message.senderId, message.receiverId], {
          ...newMessage,
          type: 'message',
          reactions: [],
          tempId: message.tempId
        });
        break;

      case 'typing':
        broadcast([message.receiverId], {
          type: 'typing',
          senderId: message.senderId,
          isTyping: message.isTyping
        });
        break;

      case 'activity':
        db.prepare(`UPDATE users SET last_online = datetime('now') WHERE id = ?`)
          .run(ws.userId);
        if (onlineUsers[ws.userId]) {
          onlineUsers[ws.userId].lastActive = Date.now();
        }
        break;

      case 'status-update':
        // Mark messages as read
        db.prepare(`
          UPDATE messages
          SET status = ?
          WHERE sender_id = ? AND receiver_id = ? AND status != 'read'
        `).run('read', message.senderId, message.receiverId);

        // Get updated message IDs
        const updated = db.prepare(`
          SELECT id FROM messages
          WHERE sender_id = ? AND receiver_id = ? AND status = 'read'
        `).all(message.senderId, message.receiverId);

        // Notify sender about read messages
        broadcast([message.senderId], {
          type: 'status-update',
          messageIds: updated.map(m => m.id),
          status: 'read'
        });
        break;
    }
  } catch (err) {
    console.error('WS Error:', err);
  }
}

// Broadcast presence to all clients
function broadcastPresence(userId, isOnline, isIdle) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'presence',
        userId,
        isOnline,
        isIdle
      }));
    }
  });
}

// Broadcast to specific userIds (array)
function broadcast(userIds, message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && userIds.includes(client.userId)) {
      client.send(JSON.stringify(message));
    }
  });
}

function broadcastAll(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Idle detection: check every minute
setInterval(() => {
  const now = Date.now();
  Object.entries(onlineUsers).forEach(([userId, { ws, lastActive }]) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const diff = now - lastActive;
    if (diff > 5 * 60 * 1000) {
      // Idle
      broadcastPresence(Number(userId), false, true);
    } else {
      // Online
      broadcastPresence(Number(userId), true, false);
    }
  });
}, 60000);