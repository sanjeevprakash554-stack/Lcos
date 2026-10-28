const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]:', reason);
});

const fs = require('fs');

const { initSocket } = require('./services/socketService');
const { startStoppageDetectorCron } = require('./services/stoppageDetector');

// Route imports
const authRoutes = require('./routes/auth.routes');
const companyRoutes = require('./routes/company.routes');
const userRoutes = require('./routes/user.routes');
const driverRoutes = require('./routes/driver.routes');
const vehicleRoutes = require('./routes/vehicle.routes');
const branchRoutes = require('./routes/branch.routes');
const commodityRoutes = require('./routes/commodity.routes');
const helperRoutes = require('./routes/helper.routes');
const stockRoutes = require('./routes/stock.routes');
const tripRoutes = require('./routes/trip.routes');
const gpsRoutes = require('./routes/gps.routes');
const alertRoutes = require('./routes/alert.routes');
const calllogRoutes = require('./routes/calllog.routes');
const requestRoutes = require('./routes/request.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const paymentRoutes = require('./routes/payment.routes');
const invoiceRoutes = require('./routes/invoice.routes');
const notificationRoutes = require('./routes/notification.routes');
const adminRoutes = require('./routes/admin.routes');
const reportsRoutes = require('./routes/reports.routes');
const auditRoutes = require('./routes/audit.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

// Configure CORS
const allowedOrigins = [
  'https://lcos.onrender.com',
  process.env.RENDER_EXTERNAL_URL,
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5173',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : [])
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.onrender.com') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-razorpay-signature', 'x-hub-signature-256'],
}));

// Enable JSON body parser with rawBody capture for webhook HMAC signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files directly from project root
app.use(express.static(path.join(__dirname, '..')));

// Lightweight Health check endpoints (root & API for Render / uptime monitors)
const healthHandler = (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Logistics Operations Control System (LCOS) Backend API',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
  });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/commodities', commodityRoutes);
app.use('/api/helpers', helperRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/gps', gpsRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/calllogs', calllogRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// Fallback webhook aliases (in case dashboard was configured without /api prefix)
app.use('/whatsapp', whatsappRoutes);
app.use('/payments', paymentRoutes);
app.use('/webhook', (req, res, next) => {
  req.url = '/webhook';
  whatsappRoutes(req, res, next);
});
app.use('/api/webhook', (req, res, next) => {
  req.url = '/webhook';
  whatsappRoutes(req, res, next);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[Backend Error]:', err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Start Background Stoppage Monitoring Cron
startStoppageDetectorCron();

// Optional free-tier keep-alive ping to prevent cold sleep spin-down
if (process.env.ENABLE_KEEP_ALIVE === 'true' && (process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL)) {
  const keepAliveUrl = (process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL).replace(/\/+$/, '') + '/health';
  const PING_INTERVAL_MS = 13 * 60 * 1000;
  console.log(`📡 [Keep-Alive] Self-ping active for ${keepAliveUrl} every 13 mins`);
  setInterval(async () => {
    try {
      const pingRes = await fetch(keepAliveUrl);
      console.log(`[Keep-Alive] Pinged ${keepAliveUrl} - Status: ${pingRes.status}`);
    } catch (e) {
      console.warn(`[Keep-Alive Warning]: ${e.message}`);
    }
  }, PING_INTERVAL_MS);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 LCOS Backend Server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 Socket.IO Real-time Tracking active on port ${PORT}`);
  console.log(`💚 Health Check active at /health and /api/health`);
  console.log(`=======================================================`);
});

module.exports = { app, server };
