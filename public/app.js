class ChatApp {
    constructor() {
        this.ws = null;
        this.user = null;
        this.activeContact = null;
        this.typingTimer = null;

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
            searchInput: document.querySelector(".search-container input"),
            contactNames: document.querySelectorAll(".contact-name"),
            lastMessages: document.querySelectorAll(".last-message"),
            timeStamps: document.querySelectorAll(".time"),
            chatItems: document.querySelectorAll(".chat-item")
        };
    }

    async checkAuth() {
        const token = localStorage.getItem("token");
        if (token) {
            try {
                this.user = await this.fetchUser();
                this.initChat();
                this.connectWebSocket();
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
        this.ws = new WebSocket("ws://localhost:3000");

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.loadMessages();
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

        this.elements.chatList.addEventListener("click", (e) => {
            const chatItem = e.target.closest(".chat-item");
            if (chatItem) this.handleChatChange(chatItem);
        });
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

        // Toggle input fields
        [this.elements.searchInput, this.elements.messageInput].forEach(input => 
            safeToggle(input, "dark-mode-input")
        );

        // Toggle text elements
        [
            this.elements.userProfileSpan,
            ...Array.from(this.elements.contactNames),
            ...Array.from(this.elements.lastMessages),
            ...Array.from(this.elements.timeStamps)
        ].forEach(el => safeToggle(el, "dark-mode-text"));

        // Toggle messages
        document.querySelectorAll(".message").forEach(msg => {
            msg.classList.toggle(msg.classList.contains("received") ?
                "dark-mode-received" :
                "dark-mode-sent"
            );
        });

        // Toggle chat items
        if (this.elements.chatItems) {
            Array.from(this.elements.chatItems).forEach(item => 
                safeToggle(item, "dark-mode-chat-item")
            );
        }

        // Update theme toggle icon
        const isDark = this.elements.body.classList.contains("dark-mode");
        if (this.elements.themeToggle) {
            this.elements.themeToggle.innerHTML = isDark ?
                '<img src="light-mode-icon.png" alt="Light Mode">' :
                '<img src="dark-mode-icon.png" alt="Dark Mode">';
        }

        // Save theme preference
        localStorage.setItem("theme", isDark ? "dark" : "light");
    }

    initDarkMode() {
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "dark") this.toggleDarkMode();
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
        if (user.avatar) {
            profileImg.src = user.avatar;
        }
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
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        const contacts = await response.json();
        this.renderContacts(contacts);
        } catch (error) {
        this.showNotification("Failed to load contacts", "error");
        }
    }

    renderContacts(contacts) {
        const chatList = this.elements.chatList;
        chatList.innerHTML = '';
        
        contacts.forEach(contact => {
        const li = document.createElement('li');
        li.className = 'chat-item';
        li.dataset.contactId = contact.id;
        li.innerHTML = `
            <img src="${contact.avatar || 'user-avatar.png'}" alt="${contact.username}">
            <div class="chat-info">
            <span class="contact-name">
                ${contact.username}
                <span class="status-indicator ${contact.last_online ? 'online' : 'offline'}"></span>
            </span>
            <p class="last-message"></p>
            </div>
            <span class="time">${this.formatLastOnline(contact.last_online)}</span>
        `;
        
        li.addEventListener('click', () => this.handleContactSelect(contact));
        chatList.appendChild(li);
        });
    }

    async handleContactSelect(contact) {
        this.activeContact = contact;
        this.updateChatHeader();
        await this.loadMessages();
        
        // Update presence
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
            type: 'presence',
            contactId: contact.id,
            isActive: true
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
        this.addMessage(tempMessage, true);
    }

    handleWSMessage(message) {
        switch (message.type) {
            case "message":
                this.handleIncomingMessage(message);
            break;
            case "presence":
                this.updateContactStatus(message.userId, message.isOnline);
            break;
            case "typing":
                this.showTypingIndicator(message);
            break;
            case "reaction":
                this.addReaction(message);
            break;
        }
    }

    updateContactStatus(userId, isOnline) {
        const contactItem = document.querySelector(`[data-contact-id="${userId}"]`);
        if (contactItem) {
            const statusIndicator = contactItem.querySelector('.status-indicator');
            statusIndicator.classList.toggle('online', isOnline);
            statusIndicator.classList.toggle('offline', !isOnline);
        }
    }

    handleIncomingMessage(message) {
        // Update temp message or add new message
        const tempMsg = this.elements.messageArea.querySelector(`[data-temp-id="${message.tempId}"]`);
        if (tempMsg) {
            tempMsg.dataset.id = message.id;
            tempMsg.querySelector('.status').textContent = '✓✓';
            tempMsg.dataset.tempId = null;
        } else {
            this.addMessage(message, message.senderId === this.user.id);
        }
    }

    addMessage(message, isSent = false) {
        const messageDiv = document.createElement("div");
        messageDiv.className = `message ${isSent ? "sent" : "received"}`;
        messageDiv.dataset.id = message.id;
        
        // Properly handle message timestamps
        const timestamp = new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit'
        });

        messageDiv.innerHTML = `
            ${this.getMessageContent(message)}
            <div class="meta">
            <span class="time">${timestamp}</span>
            ${isSent ? `<span class="status">${this.getStatusIcon(message.status)}</span>` : ''}
            </div>
            ${this.getReactions(message.reactions)}
        `;

        this.elements.messageArea.appendChild(messageDiv);
        this.scrollToBottom();
    }

    getStatusIcon(status) {
        switch(status) {
            case 'sent': return '✓';
            case 'delivered': return '✓✓';
            case 'read': return '✓✓';
            default: return '🕒';
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


    handleChatChange(chatItem) {
        this.activeContact = {
            id: parseInt(chatItem.dataset.contactId), // Ensure numeric ID
            name: chatItem.dataset.contactName,
            status: chatItem.dataset.status,
        };
        this.updateChatHeader();
        this.loadMessages();
    }

    updateChatHeader() {
        const { chatHeader } = this.elements;
        chatHeader.querySelector(".contact-name").textContent =
            this.activeContact.name;
        chatHeader.querySelector(".status").textContent = this.activeContact.status;
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

    showAuth() {
        this.elements.authContainer.style.display = "block";
        this.elements.mainContainer.style.display = "none";
    }

    initChat() {
        this.elements.authContainer.style.display = "none";
        this.elements.mainContainer.style.display = "flex";
        this.loadMessages();
    }

    async loadMessages() {
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
}

// Initialize app
const chatApp = new ChatApp();
