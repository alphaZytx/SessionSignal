// Requires Socket.io Client CDN loaded in HTML
export class SocketClient {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.isConnected = false;
        
        // Generate UUID or reuse if not supported (fallback logic)
        this.studentId = localStorage.getItem('am_uuid');
        if (!this.studentId) {
            this.studentId = 'uuid-stu-' + Date.now() + '-' + Math.round(Math.random() * 100000);
            localStorage.setItem('am_uuid', this.studentId);
        }

        this.reconnectAttempts = 0;
        this.transmitCount = 0;
        this.lastTransmitTime = null;
        this.payloadQueue = [];

        // UI Element Hooks (to be attached by main file via events or direct DOM manipulation)
        this.onConnectHook = null;
        this.onDisconnectHook = null;
        this.onReconnectAttemptHook = null;
        this.onSessionErrorHook = null;
        this.onTransmitHook = null;

        // Initialize connection with exponential backoff configuration built into socket.io
        this.socket = io(this.serverUrl + '/student', {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000,
            randomizationFactor: 0.5
        });

        this._setupListeners();
    }

    _setupListeners() {
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            console.log('Connected to Attention Monitor Server:', this.socket.id);
            
            // Re-join is handled by onConnectHook in monitor.html
            // No automatic re-join here to avoid double-join race conditions

            // Flush queue if any - NO longer done here; done after joining session successfully
            // this._flushQueue();

            if (this.onConnectHook) this.onConnectHook();
        });

        this.socket.on('disconnect', (reason) => {
            this.isConnected = false;
            console.log('Disconnected:', reason);
            if (this.onDisconnectHook) this.onDisconnectHook();
        });

        this.socket.on('connect_error', (error) => {
            this.isConnected = false;
        });

        this.socket.on('reconnect_attempt', (attempt) => {
            this.reconnectAttempts = attempt;
            if (this.onReconnectAttemptHook) this.onReconnectAttemptHook(attempt);
        });

        this.socket.on('error', (err) => {
            console.error('Session Error:', err);
            if (this.onSessionErrorHook) this.onSessionErrorHook(err);
        });

        this.socket.on('session:ended', (data) => {
            console.log('Session ended by teacher:', data);
            if (this.onSessionEndedHook) this.onSessionEndedHook(data);
        });
    }

    async joinSession(studentName, sessionId) {
        return new Promise((resolve, reject) => {
            if (!this.isConnected) {
                reject(new Error('Cannot join session, socket not connected.'));
                return;
            }

            // Bind one-time response listener
            this.socket.once('student:joined', (response) => {
                if (response.ok || response.success) {
                    this._flushQueue();
                    resolve(response);
                } else {
                    reject(new Error(response.message || 'Failed to join session'));
                }
            });

            // If error arrives instead
            this.socket.once('error', (err) => {
                reject(err);
            });

            this.socket.emit('student:join', { 
                studentId: this.studentId, 
                name: studentName, 
                sessionId 
            });

            // Timeout fallback
            setTimeout(() => reject(new Error('Join session timeout')), 5000);
        });
    }

    sendPayload(payload) {
        if (this.isConnected) {
            this.socket.emit('student:data', payload);
            this.transmitCount++;
            this.lastTransmitTime = new Date();
            if (this.onTransmitHook) this.onTransmitHook({ count: this.transmitCount, time: this.lastTransmitTime });
        } else {
            // Queue payload if disconnected (optional size limit)
            if (this.payloadQueue.length < 100) {
                this.payloadQueue.push(payload);
            }
        }
    }

    _flushQueue() {
        while (this.payloadQueue.length > 0 && this.isConnected) {
            const p = this.payloadQueue.shift();
            // Flag as buffered data if useful for server
            p.isBuffered = true;
            this.socket.emit('student:data', p);
            this.transmitCount++;
        }
    }

    connect() {
        if (this.socket) {
            this.socket.connect();
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}
