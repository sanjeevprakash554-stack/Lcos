const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

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

// Enable CORS and JSON body parser
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files directly from project root
app.use(express.static(path.join(__dirname, '..')));

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Logistics Operations Control System (LCOS) Backend API',
    timestamp: new Date().toISOString(),
    postgresPort: process.env.DB_PORT || 5434,
  });
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

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 LCOS Backend Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO Real-time Tracking active on port ${PORT}`);
  console.log(`=======================================================`);
});

module.exports = { app, server };
