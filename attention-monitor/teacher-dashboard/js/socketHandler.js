export class SocketHandler {
    constructor(serverUrl, onEvent) {
        this.socket = io(`${serverUrl}/teacher`);
        this.onEvent = onEvent;
        this.connected = false;
        
        // Setup base listeners
        this.socket.on('connect', () => {
            this.connected = true;
            this.onEvent('connect', { connected: true });
            this._startPing();
        });
        
        this.socket.on('disconnect', () => {
            this.connected = false;
            this.onEvent('disconnect', { connected: false });
            this._stopPing();
        });

        // Forward teacher events
        const eventsToForward = [
            'session:created', 'session:state', 'session:student-update', 
            'session:class-summary', 'teacher:student-joined', 'teacher:student-disconnected'
        ];

        eventsToForward.forEach(ev => {
            this.socket.on(ev, (data) => this.onEvent(ev, data));
        });

        // No custom pong handler needed — we use socket.connected check instead
    }

    get isConnected() {
        return this.connected;
    }

    startSession() {
        return new Promise((resolve, reject) => {
            this.socket.emit('teacher:start-session', null, (response) => {
                if (response && response.success) resolve(response);
                else reject(new Error(response?.error || 'Failed to start session'));
            });
        });
    }

    joinSession(sessionId) {
        this.socket.emit('teacher:join-session', { sessionId });
    }

    endSession(sessionId) {
        this.socket.emit('teacher:end-session', { sessionId });
    }

    disconnect() {
        this._stopPing();
        this.socket.disconnect();
    }

    _startPing() {
        this.pingInt = setInterval(() => {
            if (!this.socket.connected) {
                this.onEvent('health_warning', { message: 'Connection unstable' });
            }
        }, 15000);
    }

    _stopPing() {
        clearInterval(this.pingInt);
    }
}
