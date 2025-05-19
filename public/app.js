const EMOJIS = [
    "😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","😘","🥰","😗","😙","😚","🙂","🤗","🤩","🤔","🤨","😐","😑","😶","🙄","😏","😣","😥","😮","🤐","😯","😪","😫","🥱","😴","😌","😛","😜","😝","🤤","😒","😓","😔","😕","🙃","🤑","😲","☹️","🙁","😖","😞","😟","😤","😢","😭","😦","😧","😨","😩","🤯","😬","😰","😱","🥵","🥶","😳","🤪","😵","🥴","😠","😡","🤬","😷","🤒","🤕","🤢","🤮","🥳","🥺","🤠","😇","🤡","🤥","🤫","🤭","🧐","🤓","😈","👿","👹","👺","💀","👻","👽","🤖","💩"
];

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
            searchInput: document.querySelector(".search-container input"),
            emojiButton: document.getElementById('emoji-gif-button'),
            chatFooter: document.querySelector('.chat-footer'),
            searchAddButton: null, // will be set below
        };
        // Add emoji panel to DOM if not present
        if (!document.getElementById('emoji-panel')) {
            const emojiPanel = document.createElement('div');
            emojiPanel.id = 'emoji-panel';
            emojiPanel.className = 'emoji-gif-container';

            // --- Emoji List Section ---
            const emojiSection = document.createElement('div');
            emojiSection.className = 'emoji-section';
            const emojiList = document.createElement('div');
            emojiList.className = 'emoji-list';

            EMOJIS.forEach(emoji => {
                const span = document.createElement('span');
                span.textContent = emoji;
                span.tabIndex = 0;
                span.setAttribute('role', 'button');
                span.setAttribute('aria-label', emoji);
                emojiList.appendChild(span);
            });

            // Keyboard navigation for emoji list
            emojiList.addEventListener('keydown', e => {
                const focusable = Array.from(emojiList.querySelectorAll('span'));
                const idx = focusable.indexOf(document.activeElement);
                if (e.key === 'ArrowRight' && idx < focusable.length - 1) {
                    focusable[idx + 1].focus();
                    e.preventDefault();
                } else if (e.key === 'ArrowLeft' && idx > 0) {
                    focusable[idx - 1].focus();
                    e.preventDefault();
                } else if (e.key === 'Enter' && idx >= 0) {
                    focusable[idx].click();
                }
            });

            emojiSection.appendChild(emojiList);
            emojiPanel.appendChild(emojiSection);
            document.body.appendChild(emojiPanel);
        }
        this.elements.emojiPanel = document.getElementById('emoji-panel');

        // Add separator between search-container and chat-list if not present
        const sidebar = this.elements.sidebar;
        if (sidebar && !sidebar.querySelector('.search-separator')) {
            const searchContainer = sidebar.querySelector('.search-container');
            const chatList = sidebar.querySelector('.chat-list');
            if (searchContainer && chatList) {
                const separator = document.createElement('div');
                separator.className = 'search-separator';
                sidebar.insertBefore(separator, chatList);
            }
        }

        // Add + button inside the search input wrapper, styled like the emoji icon
        const searchContainer = this.elements.searchContainer;
        if (searchContainer && !searchContainer.querySelector('.input-wrapper')) {
            // Wrap the input in a div.input-wrapper if not already
            const input = this.elements.searchInput;
            const wrapper = document.createElement('div');
            wrapper.className = 'input-wrapper';
            input.parentNode.insertBefore(wrapper, input);
            wrapper.appendChild(input);
        }
        const inputWrapper = searchContainer.querySelector('.input-wrapper');
        if (inputWrapper && !inputWrapper.querySelector('.add-contact-btn')) {
            const addBtn = document.createElement('button');
            addBtn.className = 'add-contact-btn input-icon-btn';
            addBtn.type = 'button';
            addBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="#00a884" stroke-width="2" fill="none"/><line x1="12" y1="8" x2="12" y2="16" stroke="#00a884" stroke-width="2" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke="#00a884" stroke-width="2" stroke-linecap="round"/></svg>`;
            addBtn.style.marginLeft = '6px';
            inputWrapper.appendChild(addBtn);
            this.elements.searchAddButton = addBtn;
        } else if (inputWrapper) {
            this.elements.searchAddButton = inputWrapper.querySelector('.add-contact-btn');
        }
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

        // Attach button triggers file input
        const attachButton = document.getElementById('attach-button');
        if (attachButton) {
            attachButton.addEventListener('click', () => {
                this.elements.fileInput.click();
            });
        }

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

        // Emoji picker logic
        if (this.elements.emojiButton) {
            this.elements.emojiButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const panel = this.elements.emojiPanel;
                if (panel.classList.contains('show')) {
                    panel.classList.remove('show');
                } else {
                    // Position panel above the emoji button
                    const rect = this.elements.emojiButton.getBoundingClientRect();
                    const panelHeight = panel.offsetHeight || 320; // fallback to max-height
                    let top = rect.top - panelHeight - 8; // 8px gap
                    if (top < 8) top = 8; // prevent offscreen
                    panel.style.position = 'absolute';
                    panel.style.left = rect.left + 'px';
                    panel.style.top = top + 'px';
                    panel.classList.add('show');
                }
            });
        }
        // Insert emoji at cursor
        if (this.elements.emojiPanel) {
            this.elements.emojiPanel.addEventListener('click', (e) => {
                if (e.target.tagName === 'SPAN') {
                    this.insertAtCursor(this.elements.messageInput, e.target.textContent);
                    this.elements.emojiPanel.classList.remove('show');
                    this.elements.messageInput.focus();
                }
            });
        }
        // Hide emoji panel on click outside
        document.addEventListener('click', (e) => {
            if (this.elements.emojiPanel && this.elements.emojiPanel.classList.contains('show')) {
                if (!this.elements.emojiPanel.contains(e.target) && e.target !== this.elements.emojiButton) {
                    this.elements.emojiPanel.classList.remove('show');
                }
            }
        });

        // Avatar upload uses avatar section
        const avatarInput = document.getElementById('avatar-input');
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

        // Add contact (+) button logic
        if (this.elements.searchAddButton) {
            this.elements.searchAddButton.addEventListener('click', async () => {
                const username = this.elements.searchInput.value.trim();
                if (!username) {
                    this.showNotification('Enter a username to add', 'error');
                    return;
                }
                if (username === this.user.username) {
                    this.showNotification('You cannot add yourself', 'error');
                    return;
                }
                try {
                    const res = await fetch('/api/add-contact', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${localStorage.getItem("token")}`
                        },
                        body: JSON.stringify({ username })
                    });
                    const data = await res.json();
                    if (res.ok) {
                        this.showNotification('Contact added!', 'success');
                        this.elements.searchInput.value = '';
                        // Optionally, reload contacts
                        await this.loadContacts();
                    } else {
                        this.showNotification(data.error || 'Could not add contact', 'error');
                    }
                } catch (e) {
                    this.showNotification('Failed to add contact', 'error');
                }
            });
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
            ? `<svg width="22" height="22" viewBox="0  0 24 24" fill="none"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" fill="#fff"/></svg>`
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
                <button class="remove-contact-btn" title="Remove contact">&times;</button>
            `;
            li.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-contact-btn')) return;
                this.handleContactSelect(contact, li);
            });
            // Remove contact button
            li.querySelector('.remove-contact-btn').addEventListener('click', async (e) => {
                e.stopPropagation();
                this.showConfirm(`Remove ${contact.username} from your contacts?`, async () => {
                    await this.removeContact(contact.id);
                });
            });
            chatList.appendChild(li);

            if (this.activeContact && this.activeContact.id === contact.id) {
                li.classList.add('active');
            }
        });
    }

    async removeContact(contactId) {
        try {
            const res = await fetch('/api/remove-contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem("token")}`
                },
                body: JSON.stringify({ contactId })
            });
            const data = await res.json();
            if (res.ok) {
                this.showNotification('Contact removed', 'success');
                await this.loadContacts();
            } else {
                this.showNotification(data.error || 'Could not remove contact', 'error');
            }
        } catch (e) {
            this.showNotification('Failed to remove contact', 'error');
        }
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
            case "avatar-update":
                this.handleAvatarUpdate(message);
                break;
        }
    }

    handleAvatarUpdate(message) {
        // Update avatar in contact list and chat header if relevant
        const contact = this.getContactById(message.userId);
        if (contact) {
            contact.avatar = message.avatar;
            // Update contact list UI
            const contactItem = document.querySelector(`[data-contact-id="${message.userId}"]`);
            if (contactItem) {
                const img = contactItem.querySelector('img');
                if (img) img.src = message.avatar;
            }
            // Update chat header if this contact is active
            if (this.activeContact && this.activeContact.id === message.userId) {
                this.activeContact.avatar = message.avatar;
                const chatHeaderImg = document.querySelector('.chat-header .user-avatar');
                if (chatHeaderImg) chatHeaderImg.src = message.avatar;
            }
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
        } 
        // Always update/add the message in the cache and re-render
        this.addMessage(message, (message.sender_id ?? message.senderId) === this.user.id);
    }

    addMessage(message, isSent = false, tempId = null) {
        // Store messages in an array for logic
        if (!this._messageCache) this._messageCache = [];
        // Check if message with same id or tempId exists, update it instead of pushing
        let updated = false;
        let didAddNew = false;
        for (let i = 0; i < this._messageCache.length; i++) {
            const m = this._messageCache[i];
            if ((message.id && m.id === message.id) || (message.tempId && m.tempId === message.tempId)) {
                this._messageCache[i] = { ...m, ...message, isSent };
                updated = true;
                break;
            }
        }
        if (!updated) {
            this._messageCache.push({ ...message, isSent });
            didAddNew = true;
        }

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
            `;

            this.elements.messageArea.appendChild(messageDiv);
        });

        // Only scroll if a new message was added
        if (didAddNew) {
            setTimeout(() => this.scrollToBottom(), 0);
        }
    }

    getStatusIcon(status) {
        switch(status) {
            case 'sent': return 'sent';
            case 'read': return 'seen';
            case 'sending': return 'sending...';
            default: return '';
        }
    }

    getMessageContent(message) {
        const sanitize = (text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };

        if (message.type === 'file' || message.messageType === 'file') {
            // If it's an image file, display as image
            const url = sanitize(message.content || message.url);
            const name = sanitize(message.name || 'Download File');
            const ext = (name.split('.').pop() || '').toLowerCase();
            if (["jpg","jpeg","png","gif","bmp","webp"].includes(ext)) {
                return `<img src="${url}" class="message-image" alt="${name}">`;
            }
            return `<div class="file-message">
                <i class="fas fa-file"></i>
                <a href="${url}" download>
                    ${name}
                </a>
            </div>`;
        }
        if (message.type === 'image' || message.messageType === 'image') {
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
            `<span class="status">${this.getStatusIcon(message.status)}</span>` : '';
        return `${time}${status}`;
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
        if (file.size > MAX_SIZE) {
            this.showNotification('File too large (max 10MB)');
            return;
        }
        // --- Robust deduplication: check by name and size using a backend endpoint ---
        try {
            const res = await fetch(`/api/file-exists?name=${encodeURIComponent(file.name)}&size=${file.size}`);
            if (res.ok) {
                const data = await res.json();
                if (data.exists && data.url) {
                    await this.sendMessage(data.url, data.type, { url: data.url, name: file.name, type: data.type });
                    this.showNotification('File already uploaded, using existing.', 'success');
                    return;
                }
            }
        } catch (e) {
            // If check fails, fallback to upload
        }
        // Proceed with upload
        const formData = new FormData();
        formData.append("file", file);
        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
                body: formData,
            });
            if (!res.ok) throw new Error('Upload failed');
            const fileInfo = await res.json();
            const type = fileInfo.type === 'image' ? 'image' : 'file';
            await this.sendMessage(fileInfo.url, type, fileInfo);
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
            
            // Wait for images to load before scrolling to bottom
            const images = this.elements.messageArea.querySelectorAll('img.message-image');
            if (images.length > 0) {
                let loaded = 0;
                images.forEach(img => {
                    if (img.complete) {
                        loaded++;
                    } else {
                        img.addEventListener('load', () => {
                            loaded++;
                            if (loaded === images.length) {
                                this.scrollToBottom();
                            }
                        });
                        img.addEventListener('error', () => {
                            loaded++;
                            if (loaded === images.length) {
                                this.scrollToBottom();
                            }
                        });
                    }
                });
                if (loaded === images.length) {
                    this.scrollToBottom();
                }
            } else {
                this.scrollToBottom();
            }
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

    // Show a custom confirmation modal
    showConfirm(message, onConfirm, onCancel) {
        // Remove any existing modal
        const existing = document.getElementById('confirm-modal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'confirm-modal';
        modal.innerHTML = `
            <div class="confirm-box">
                <div class="confirm-message">${message}</div>
                <div class="confirm-actions">
                    <button class="confirm-btn confirm" id="confirm-remove-btn">Remove</button>
                    <button class="confirm-btn cancel" id="cancel-remove-btn">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        document.getElementById('confirm-remove-btn').onclick = () => {
            modal.remove();
            if (onConfirm) onConfirm();
        };
        document.getElementById('cancel-remove-btn').onclick = () => {
            modal.remove();
            if (onCancel) onCancel();
        };
        // Allow closing with Escape key
        const escListener = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escListener);
                if (onCancel) onCancel();
            }
        };
        document.addEventListener('keydown', escListener);
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

    // Insert emoji at cursor position in input
    insertAtCursor(input, text) {
        // Insert text at cursor position in input
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const value = input.value;
        input.value = value.slice(0, start) + text + value.slice(end);
        // Move cursor after inserted emoji
        input.selectionStart = input.selectionEnd = start + text.length;
    }
}

// Initialize app
const chatApp = new ChatApp();
