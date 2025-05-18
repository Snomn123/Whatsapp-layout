require('dotenv').config();
const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const db = require('./database');

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use(express.static(path.join(__dirname, '../public')));

// Authentication middleware
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
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
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = db.prepare(`
            INSERT INTO users (username, password_hash) 
            VALUES (?, ?)
        `).run(username, hashedPassword);

        res.status(201).json({ id: result.lastInsertRowid });
    } catch (err) {
        res.status(400).json({ error: 'Registration failed' });
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
                avatar: user.avatar
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        res.json({
            url: `/uploads/${req.file.filename}`,
            name: req.file.originalname,
            type: req.file.mimetype.startsWith('image/') ? 'image' : 'file'
        });
    } catch (err) {
        res.status(500).json({ error: 'File upload failed' });
    }
});

// Get all users except current user
app.get('/api/contacts', authenticate, (req, res) => {
    try {
        const contacts = db.prepare(`
        SELECT id, username, avatar, last_online
        FROM users 
        WHERE id != ?
        ORDER BY username ASC
        `).all(req.user.id);
        res.json(contacts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load contacts' });
    }
});

// Get conversation between two users
app.get('/api/messages', authenticate, (req, res) => {
    try {
        const { contactId } = req.query;
        const messages = db.prepare(`
        SELECT m.*, 
            (SELECT GROUP_CONCAT(emoji) 
            FROM reactions r 
            WHERE r.message_id = m.id) AS reactions
        FROM messages m
        WHERE (m.sender_id = ? AND m.receiver_id = ?)
            OR (m.sender_id = ? AND m.receiver_id = ?)
        ORDER BY m.timestamp ASC
        `).all(req.user.id, contactId, contactId, req.user.id);

        res.json(messages.map(msg => ({
        ...msg,
        reactions: msg.reactions ? msg.reactions.split(',') : []
        })));
    } catch (err) {
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

app.get('/api/user', authenticate, (req, res) => {
    const user = db.prepare('SELECT id, username, avatar FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
});

// Client-side routing fallback
app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// WebSocket Server
const server = app.listen(PORT, () =>
    console.log(`Server running on port ${PORT}`));
const wss = new WebSocket.Server({ server });


// EDITTT
wss.on('connection', (ws) => {
    db.prepare(`
        UPDATE users 
        SET last_online = datetime('now') 
        WHERE id = ?
    `).run(ws.userId);

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            // Handle different message types
            switch(message.type) {
                case 'message':
                    // Store in database
                    const result = db.prepare(`
                        INSERT INTO messages 
                        (sender_id, receiver_id, content, type, status)
                        VALUES (?, ?, ?, ?, ?)
                    `).run(
                        message.senderId,
                        message.receiverId,
                        message.content,
                        message.messageType || 'text',
                        'sent'
                    );

                    // Add generated ID and timestamp to message
                    const newMessage = db.prepare(`
                        SELECT *, datetime(timestamp, 'localtime') AS formatted_time
                        FROM messages WHERE id = ?
                    `).get(result.lastInsertRowid);

                    // Broadcast to all relevant clients
                    const broadcastMessage = {
                        ...newMessage,
                        reactions: []
                    };
                    
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(broadcastMessage));
                        }
                    });
                    break;
                case 'presence':
                    db.prepare(`
                    UPDATE users 
                    SET last_online = datetime('now') 
                    WHERE id = ?
                    `).run(ws.userId);

                    // Notify contact about presence
                    wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN && 
                        client.userId === message.contactId) {
                        client.send(JSON.stringify({
                        type: 'presence',
                        userId: ws.userId,
                        isOnline: true
                        }));
                    }
                    });
                    break;
                // Add cases for other message types (typing, reactions, etc.)
            }
        } catch (err) {
            console.error('WebSocket error:', err);
        }
    });

    ws.on('close', () => {
        db.prepare(`
            UPDATE users 
            SET last_online = datetime('now') 
            WHERE id = ?
        `).run(ws.userId);
    });
});