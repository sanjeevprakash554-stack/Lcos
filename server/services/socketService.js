const { Server } = require('socket.io');

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    socket.on('join_company', (companyId) => {
      socket.join(`company_${companyId}`);
      console.log(`[Socket.IO] Client ${socket.id} joined company_${companyId}`);
    });

    socket.on('join_trip', (tripId) => {
      socket.join(`trip_${tripId}`);
      console.log(`[Socket.IO] Client ${socket.id} joined trip_${tripId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  return io;
}

function broadcastGpsUpdate(vehicleData) {
  if (!io) return;
  io.emit('gps_update', vehicleData);
  if (vehicleData.companyId) {
    io.to(`company_${vehicleData.companyId}`).emit('gps_update', vehicleData);
  }
}

function broadcastAlert(alertData) {
  if (!io) return;
  io.emit('alert_created', alertData);
  if (alertData.company_id) {
    io.to(`company_${alertData.company_id}`).emit('alert_created', alertData);
  }
}

function broadcastTripUpdate(tripData) {
  if (!io) return;
  io.emit('trip_updated', tripData);
  if (tripData.id) {
    io.to(`trip_${tripData.id}`).emit('trip_updated', tripData);
  }
}

module.exports = {
  initSocket,
  getIO,
  broadcastGpsUpdate,
  broadcastAlert,
  broadcastTripUpdate,
};
