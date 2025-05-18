class ChatApp {
    constructor() {
        this.ws = null;
        this.user = null;
        this.activeContact = null;
        this.typingState = null;
        this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        this.initDOMElements();
        this.initAuthListeners();
        this.checkAuth();
        this.initEventListeners();
        this.initDarkMode();
    }

    initDOMElements() {
        this.elements = {
            authContainer: document.querySelector('.auth-container'),
            mainContainer: document.querySelector('.container'),
            body: document.body,
            messageArea: document.querySelector('.message-area'),
            messageInput: document.getElementById('message-input'),
            sendButton: document.getElementById('send-button'),
            fileInput: document.getElementById('file-input'),
            themeToggle: document.getElementById('theme-toggle'),
            chatList: document.querySelector('.chat-list'),
            chatHeader: document.querySelector('.chat-header'),
            userProfileSpan: document.querySelector('.user-profile span'),
            sidebar: document.querySelector(".sidebar"),
            sidebarHeader: document.querySelector(".sidebar header"),
            searchContainer: document.querySelector(".search-container"),
            chatArea: document.querySelector(".chat-area"),
            chatFooter: document.querySelector(".chat-footer"),
            searchInput: document.querySelector(".search-container input")
        };
    }

    async checkAuth() {
        const token = localStorage.getItem("token");
        if (token) {
            try {
                this.user = await this.fetchUser();
                this.connectWebSocket(); // Connect first
            } catch {
                this.showAuth();
                localStorage.removeItem('token');
            }
        } else {
            this.showAuth();
        }
    }

    showAuth() {
        this.elements.authContainer.style.display = "flex";
        this.elements.mainContainer.style.display = "none";
    }

    showAuthError(message) {
        document.querySelector('.auth-error').textContent = message;
    }

    connectWebSocket() {
        const token = localStorage.getItem("token");
        // Use the current protocol and host for WebSocket
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const host = window.location.host;
        this.ws = new WebSocket(`${protocol}://${host}?token=${token}`);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.initChat();
        };

        this.ws.onmessage = (event) => this.handleWSMessage(JSON.parse(event.data));
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showNotification('Connection error', 'error');
        };
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.showNotification('Connection lost', 'error');
        };

        setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'activity' }));
            }
        }, 60000);
    }

    initAuthListeners() {
        // Add tab switching
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.auth-tab, .auth-content').forEach(el => {
                    el.classList.remove('active');
                });
                const form = e.target.dataset.form;
                e.target.classList.add('active');
                document.getElementById(`${form}-form`).classList.add('active');
            });
        });

        // Updated login handler
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleAuth({
                username: document.getElementById('login-username').value,
                password: document.getElementById('login-password').value
            }, '/api/login');
        });

        // New registration handler
        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('register-password').value;
            const confirm = document.getElementById('confirm-password').value;
            
            if (password !== confirm) {
                this.showAuthError('Passwords do not match');
                return;
            }

            await this.handleAuth({
                username: document.getElementById('register-username').value,
                password: password
            }, '/api/register');
        });
    }

    async handleAuth(credentials, endpoint) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(credentials)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                if (endpoint === '/api/register') {
                    this.showAuthError('Registration successful! Please login');
                    document.querySelector('[data-form="login"]').click();
                } else {
                    localStorage.setItem('token', data.token);
                    this.user = data.user;
                    this.initChat();
                }
            } else {
                this.showAuthError(data.error || 'Authentication failed');
            }
        } catch (error) {
            this.showAuthError('Connection error');
        }
    }

    initEventListeners() {
        this.elements.sendButton.addEventListener("click", () => this.handleSendMessage());
        this.elements.messageInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") this.handleSendMessage();
        });

        this.elements.fileInput.addEventListener("change", (e) => {
            if (e.target.files[0]) this.handleFileUpload(e.target.files[0]);
        });

        this.elements.messageInput.addEventListener("input", () => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.handleTypingIndicator();
            }
        });
        this.elements.searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase();
            document.querySelectorAll('.chat-item').forEach(item => {
                const name = item.querySelector('.contact-name').textContent.toLowerCase();
                item.style.display = name.includes(query) ? "" : "none";
            });
        });
        this.elements.themeToggle.addEventListener("click", () => this.toggleDarkMode());

        const avatarInput = document.getElementById('avatar-input');
        const changeAvatarBtn = document.getElementById('change-avatar-btn');
        if (changeAvatarBtn && avatarInput) {
            changeAvatarBtn.onclick = () => avatarInput.click();
            avatarInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                    this.showNotification('Please select an image file');
                    return;
                }
                const formData = new FormData();
                formData.append('avatar', file);
                try {
                    const res = await fetch('/api/avatar', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
                        body: formData
                    });
                    if (!res.ok) throw new Error('Upload failed');
                    const data = await res.json();
                    // Update avatar in UI
                    document.getElementById('user-avatar').src = data.avatar;
                    this.user.avatar = data.avatar;
                    this.showNotification('Avatar updated!', 'success');
                } catch {
                    this.showNotification('Failed to update avatar');
                }
            };
        }
        if (avatarInput) {
            avatarInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                    this.showNotification('Please select an image file');
                    return;
                }
                const formData = new FormData();
                formData.append('avatar', file);
                try {
                    const res = await fetch('/api/avatar', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
                        body: formData
                    });
                    if (!res.ok) throw new Error('Upload failed');
                    const data = await res.json();
                    document.getElementById('user-avatar').src = data.avatar;
                    this.user.avatar = data.avatar;
                    this.showNotification('Avatar updated!', 'success');
                } catch {
                    this.showNotification('Failed to update avatar');
                }
            };
        }
    }

    toggleDarkMode() {
        // Safely check elements existence
        const safeToggle = (element, className) => {
            if (element) element.classList.toggle(className);
        };

        // Toggle container elements
        [
            this.elements.body,
            this.elements.mainContainer,
            this.elements.sidebar,
            this.elements.sidebarHeader,
            this.elements.searchContainer,
            this.elements.chatList,
            this.elements.chatArea,
            this.elements.chatHeader,
            this.elements.chatFooter,
            this.elements.messageArea
        ].forEach(el => safeToggle(el, "dark-mode"));

        // Update theme toggle icon
        const isDark = this.elements.body.classList.contains("dark-mode");
        this.setThemeIcon(isDark);
        localStorage.setItem("theme", isDark ? "dark" : "light");
    }

    initDarkMode() {
        const savedTheme = localStorage.getItem("theme");
        const isDark = savedTheme === "dark";
        if (isDark) this.toggleDarkMode();
        this.setThemeIcon(isDark);
    }

    setThemeIcon(isDark) {
        const themeIcon = document.getElementById("theme-icon");
        if (!themeIcon) return;
        themeIcon.innerHTML = isDark
            // White moon for dark mode
            ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" fill="#fff"/></svg>`
            // Black sun for light mode
            : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" fill="#111"/><g stroke="#111" stroke-width="2"><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></g></svg>`;
    }

    async fetchUser() {
        const res = await fetch("/api/user", {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!res.ok) throw new Error("Auth failed");
        const user = await res.json();
        this.updateUserProfile(user);
        return user;
    }

    updateUserProfile(user) {
        const profileSpan = this.elements.userProfileSpan;
        const profileImg = document.querySelector('.user-profile img');
        
        profileSpan.textContent = user.username;
        profileImg.src = user.avatar || 'assets/user-avatar.png';
    }
    
    async handleSendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (message) {
            await this.sendMessage(message);
            this.elements.messageInput.value = "";
        }
    }

    async loadContacts() {
        try {
            const response = await fetch('/api/contacts', {
                headers: { 
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                    'X-Timezone': this.timeZone
                }
            });
            const contacts = await response.json();
            this.renderContacts(contacts);
        } catch (error) {
            this.showNotification("Failed to load contacts", "error");
        }
    }

    renderContacts(contacts) {
        this._contactsCache = contacts; // cache for status updates
        const chatList = this.elements.chatList;
        chatList.innerHTML = '';
        contacts.forEach(contact => {
            const statusClass = this.getStatusClass(contact);
            const li = document.createElement('li');
            li.className = 'chat-item';
            li.dataset.contactId = contact.id;

            // Short status for contact list
            let shortStatus = "Offline";
            if (contact.isOnline) shortStatus = "Online";
            else if (contact.isIdle) shortStatus = "Idle";
            else if (contact.last_online) {
                const last = new Date(contact.last_online);
                const now = new Date();
                const diff = Math.floor((now - last) / 60000);
                if (diff < 60) shortStatus = `${diff}m ago`;
                else if (diff < 1440) shortStatus = `${Math.floor(diff/60)}h ago`;
                else shortStatus = `${Math.floor(diff/1440)}d ago`;
            }

            li.innerHTML = `
                <img src="${contact.avatar || 'assets/user-avatar.png'}" alt="${contact.username}">
                <div class="chat-info">
                    <span class="contact-name">
                        <span class="online-status ${statusClass}"></span>
                        ${contact.username}
                    </span>
                </div>
                <span class="time">${shortStatus}</span>
            `;
            li.addEventListener('click', () => this.handleContactSelect(contact, li));
            chatList.appendChild(li);

            if (this.activeContact && this.activeContact.id === contact.id) {
                li.classList.add('active');
            }
        });
    }

    async handleContactSelect(contact, liElement) {
        this.activeContact = contact;
        // Remove 'active' from all, add to selected
        document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
        if (liElement) liElement.classList.add('active');
        this.updateChatHeader();
        await this.loadMessages();

        // Mark messages as read
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'presence',
                contactId: contact.id,
                isActive: true
            }));

            // Send status update for read messages
            this.ws.send(JSON.stringify({
                type: 'status-update',
                senderId: contact.id, // messages FROM this contact
                receiverId: this.user.id // TO me
            }));
        }
    }

    formatLastOnline(timestamp) {
        if (!timestamp) return 'Offline';
        const now = new Date();
        const lastOnline = new Date(timestamp);
        const diffHours = Math.abs(now - lastOnline) / 36e5;
        
        if (diffHours < 1) return 'Online';
        if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    }

    async sendMessage(content, type = "text", fileInfo = null) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.showNotification("Connection not ready", "error");
            return;
        }

        const tempId = Date.now();
        const message = {
            type: "message",
            senderId: this.user.id,
            receiverId: this.activeContact.id,
            content: fileInfo ? fileInfo.url : content,
            messageType: fileInfo ? fileInfo.type : type,
            timestamp: new Date().toISOString(),
            tempId
        };

        this.ws.send(JSON.stringify(message));
        this.addTempMessage(message, tempId);
    }
    
    addTempMessage(message, tempId) {
        const tempMessage = {
            ...message,
            id: tempId,
            status: 'sending'
        };
        this.addMessage(tempMessage, true, tempId);
    }

    handleWSMessage(message) {
        switch (message.type) {
            case "message":
                this.handleIncomingMessage(message);
                break;
            case "status-update":
                this.updateMessageStatus(message.messageIds, message.status);
                break;
            case "presence":
                this.updateContactStatus(message.userId, message.isOnline, message.isIdle);
                break;
            case "new-contact":
                this.addNewContact(message.contact);
                break;
            case "reaction":
                this.addReaction(message);
                break;
        }
    }

    addNewContact(contact) {
        // Avoid duplicates
        if (this._contactsCache && !this._contactsCache.some(c => c.id === contact.id)) {
            this._contactsCache.push(contact);
            this.renderContacts(this._contactsCache);
        }
    }

    updateMessageStatus(messageIds, status) {
        messageIds.forEach(id => {
            const msgDiv = this.elements.messageArea.querySelector(`[data-id="${id}"]`);
            if (msgDiv) {
                const statusSpan = msgDiv.querySelector('.status');
                if (statusSpan) statusSpan.textContent = this.getStatusIcon(status);
            }
        });
    }

    updateContactStatus(userId, isOnline, isIdle) {
        // Update contact in chat list
        const contactItem = document.querySelector(`[data-contact-id="${userId}"]`);
        if (contactItem) {
            // Update the status dot
            const statusDot = contactItem.querySelector('.online-status');
            if (statusDot) {
                statusDot.classList.remove('online', 'idle', 'offline');
                if (isOnline) statusDot.classList.add('online');
                else if (isIdle) statusDot.classList.add('idle');
                else statusDot.classList.add('offline');
            }
            // Optionally update the "last seen" text
            const contact = this.getContactById(userId);
            if (contact) {
                contact.isOnline = isOnline;
                contact.isIdle = isIdle;
                // Update the time text
                const timeSpan = contactItem.querySelector('.time');
                if (timeSpan) timeSpan.textContent = this.formatLastSeen(contact);
            }
        }

        // Update chat header if this contact is active
        if (this.activeContact && this.activeContact.id === userId) {
            if (isOnline !== undefined) this.activeContact.isOnline = isOnline;
            if (isIdle !== undefined) this.activeContact.isIdle = isIdle;
            this.updateChatHeader();
        }
    }

    // Helper to get contact object by id (from last loaded contacts)
    getContactById(userId) {
        if (!this._contactsCache) return null;
        return this._contactsCache.find(c => c.id === userId);
    }

    handleIncomingMessage(message) {
        // Update temp message or add new message
        const tempMsg = this.elements.messageArea.querySelector(`[data-temp-id="${message.tempId}"]`);
        if (tempMsg) {
            tempMsg.dataset.id = message.id;
            const statusSpan = tempMsg.querySelector('.status');
            if (statusSpan) statusSpan.textContent = this.getStatusIcon(message.status);
            tempMsg.dataset.tempId = null;
            // Optionally update other fields if needed
        } else {
            this.addMessage(message, (message.sender_id ?? message.senderId) === this.user.id);
        }
    }

    addMessage(message, isSent = false, tempId = null) {
        // Store messages in an array for logic
        if (!this._messageCache) this._messageCache = [];
        this._messageCache.push({ ...message, isSent });

        // Clear and re-render all messages for the current chat
        this.elements.messageArea.innerHTML = "";
        let lastSentIndex = -1;
        let lastReplyIndex = -1;

        // Find the last sent message index and last reply index
        this._messageCache.forEach((msg, idx) => {
            if (msg.isSent) lastSentIndex = idx;
            else lastReplyIndex = idx;
        });

        // Render messages
        this._messageCache.forEach((msg, idx) => {
            const sentByMe = msg.isSent;
            const messageDiv = document.createElement("div");
            messageDiv.className = `message ${sentByMe ? "sent" : "received"}`;
            messageDiv.dataset.id = msg.id;
            if (tempId || msg.tempId) {
                messageDiv.dataset.tempId = tempId || msg.tempId;
            }

            // Properly handle message timestamps
            const timestamp = new Date(msg.timestamp).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit'
            });

            // Status logic
            let statusHtml = "";
            if (sentByMe) {
                if (msg.status === "sending") {
                    // Show "sending..." on every sending message
                    statusHtml = `<span class="status status-right">${this.getStatusIcon(msg.status)}</span>`;
                } else if (
                    idx === lastSentIndex &&
                    (lastReplyIndex === -1 || lastSentIndex > lastReplyIndex)
                ) {
                    // Show status only on the last sent message (if not "sending")
                    statusHtml = `<span class="status status-right">${this.getStatusIcon(msg.status)}</span>`;
                }
            }

            messageDiv.innerHTML = `
                ${this.getMessageContent(msg)}
                <div class="meta">
                    <span class="time" style="margin-right:auto;">${timestamp}</span>
                    ${statusHtml}
                </div>
                ${this.getReactions(msg.reactions)}
            `;

            this.elements.messageArea.appendChild(messageDiv);
        });

        this.scrollToBottom();
    }

    getStatusIcon(status) {
        switch(status) {
            case 'sent': return 'sent';
            case 'read': return 'seen';
            default: return 'sending...';
        }
    }

    getMessageContent(message) {
        const sanitize = (text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };

        if (message.messageType === 'file') {
            return `<div class="file-message">
                <i class="fas fa-file"></i>
                <a href="${sanitize(message.content)}" download>
                    ${sanitize(message.name || 'Download File')}
                </a>
            </div>`;
        }
        
        if (message.messageType === 'image') {
            return `<img src="${sanitize(message.content)}" class="message-image" alt="Uploaded image">`;
        }
        
        return `<p>${sanitize(message.content)}</p>`;
    }

    getMessageMeta(message, isSent) {
        const time = new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const status = isSent ? 
            `<span class="status">${message.status === 'sending' ? '🕒' : '✓✓'}</span>` : '';
        
        return `${time}${status}`;
    }

    getReactions(reactions) {
        if (!reactions || !reactions.length) return '';
        return `<div class="reactions">${reactions.map(r => `<span class="reaction">${r}</span>`).join('')}</div>`;
    }

    updateChatHeader() {
        const { chatHeader } = this.elements;
        const statusClass = this.getStatusClass(this.activeContact);
        // Update avatar in chat header
        chatHeader.querySelector(".contact-name").innerHTML =
            `<span class="online-status ${statusClass}"></span> ${this.activeContact.username}`;
        chatHeader.querySelector(".status").textContent =
            this.formatLastSeen(this.activeContact);
    }

    async handleFileUpload(file) {
        // Client-side validation
        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
        
        if (file.size > MAX_SIZE) {
            this.showNotification('File too large (max 10MB)');
            return;
        }
        
        if (!ALLOWED_TYPES.includes(file.type)) {
            this.showNotification('Invalid file type');
            return;
        }

        // Proceed with upload
        const formData = new FormData();
        formData.append("file", file);
        
        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });
            
            if (!res.ok) throw new Error('Upload failed');
            
            const fileInfo = await res.json();
            this.sendMessage(fileInfo.url, "file", fileInfo);
        } catch (error) {
            this.showNotification("File upload failed");
        }
    }

    handleTypingIndicator() {
        clearTimeout(this.typingDebounce);
        this.typingDebounce = setTimeout(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: "typing",
                    senderId: this.user.id,
                    receiverId: this.activeContact.id,
                    typing: false,
                }));
            }
        }, 1000);

        if (!this.typingState) {
            this.typingState = true;
            this.ws.send(JSON.stringify({
                type: "typing",
                senderId: this.user.id,
                receiverId: this.activeContact.id,
                typing: true,
            }));
        }
    }

    showReactionPicker(e, messageId) {
        const picker = document.createElement("div");
        picker.className = "reaction-picker";
        picker.style.left = `${e.clientX}px`;
        picker.style.top = `${e.clientY}px`;

        ["❤️", "😂", "😮", "😢", "👍", "👎"].forEach((emoji) => {
            const span = document.createElement("span");
            span.textContent = emoji;
            span.onclick = () => {
                this.ws.send(
                    JSON.stringify({
                        type: "reaction",
                        messageId,
                        emoji,
                        senderId: this.user.id,
                    })
                );
                picker.remove();
            };
            picker.appendChild(span);
        });

        document.body.appendChild(picker);
    }

    addReaction(reaction) {
        const messageDiv = document.querySelector(
            `[data-message-id="${reaction.messageId}"]`
        );
        if (messageDiv) {
            const reactions =
                messageDiv.querySelector(".reactions") || document.createElement("div");
            reactions.className = "reactions";
            reactions.innerHTML += `<span class="reaction">${reaction.emoji}</span>`;
            messageDiv.appendChild(reactions);
        }
    }

    initChat() {
        this.elements.authContainer.style.display = "none";
        this.elements.mainContainer.style.display = "flex";
        this.loadContacts();
        this.loadMessages();
    }

    async loadMessages() {
        // Clear message cache when switching contacts
        this._messageCache = [];
        try {
            if (!this.activeContact?.id) {
                this.showNotification("No contact selected", "error");
                return;
            }
    
            const response = await fetch(
                `/api/messages?contactId=${this.activeContact.id}`,
                {
                    headers: { 
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            if (!response.ok) throw new Error('Failed to load messages');
            
            const messages = await response.json();
            this.elements.messageArea.innerHTML = "";
            
            messages.forEach((msg) => {
                // Convert SQLite timestamp to JavaScript Date
                msg.timestamp = new Date(msg.timestamp.replace(' ', 'T'));
                this.addMessage(msg, msg.sender_id === this.user.id);
            });
            
            this.scrollToBottom();
        } catch (error) {
            this.showNotification("Failed to load messages", "error");
            console.error("Message load error:", error);
        }
    }

    scrollToBottom() {
        this.elements.messageArea.scrollTop = this.elements.messageArea.scrollHeight;
    }

    showNotification(message, type = "error") {
        const notification = document.createElement("div");
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => notification.remove(), 3000);
    }

    getStatusClass(contact) {
        // Assume contact.last_online is an ISO string and contact.isOnline is set by server
        if (contact.isOnline) return 'online';
        if (contact.isIdle) return 'idle';
        if (contact.last_online) {
            const last = new Date(contact.last_online);
            const diff = (Date.now() - last.getTime()) / 60000;
            if (diff < 5) return 'idle';
        }
        return 'offline';
    }

    formatLastSeen(contact) {
        if (contact.isOnline) return 'Online';
        if (contact.isIdle) return 'Idle';
        if (contact.last_online) {
            const last = new Date(contact.last_online);
            const now = new Date();
            const diff = Math.floor((now - last) / 60000);
            if (diff < 60) return `${diff}m ago`;
            if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
            return `${Math.floor(diff/1440)}d ago`;
        }
        return 'Offline';
    }
}

// Initialize app
const chatApp = new ChatApp();
