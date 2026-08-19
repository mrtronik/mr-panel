const ServerMonitorService = require('./services/ServerMonitorService');

let monitorIntervals = {};

function initMonitorSocket(io) {
    io.on('connection', (socket) => {
        console.log('[Monitor] Client connected:', socket.id);

        socket.on('monitor:start', async () => {
            console.log('[Monitor] Started for', socket.id);
            if (monitorIntervals[socket.id]) clearInterval(monitorIntervals[socket.id]);
            monitorIntervals[socket.id] = setInterval(async () => {
                try {
                    const stats = await ServerMonitorService.getStats();
                    socket.emit('monitor:stats', stats);
                } catch (e) {
                    console.error('[Monitor] Stats error:', e.message);
                }
            }, 3000);
        });

        socket.on('monitor:stop', () => {
            console.log('[Monitor] Stopped for', socket.id);
            if (monitorIntervals[socket.id]) {
                clearInterval(monitorIntervals[socket.id]);
                delete monitorIntervals[socket.id];
            }
        });

        socket.on('disconnect', () => {
            console.log('[Monitor] Client disconnected:', socket.id);
            if (monitorIntervals[socket.id]) {
                clearInterval(monitorIntervals[socket.id]);
                delete monitorIntervals[socket.id];
            }
        });
    });
}

module.exports = { initMonitorSocket };
