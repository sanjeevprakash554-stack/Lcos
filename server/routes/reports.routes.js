const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/reports/dashboard-summary
router.get('/dashboard-summary', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';

    // 1. In Transit count
    const inTransitRes = await db.query(
      `SELECT COUNT(*) FROM trips WHERE (company_id = $1 OR company_id = 'COMP-001' OR company_id IS NULL) AND status = 'IN_TRANSIT'`,
      [companyId]
    );

    // 2. Delayed count
    const delayedRes = await db.query(
      `SELECT COUNT(*) FROM trips WHERE (company_id = $1 OR company_id = 'COMP-001' OR company_id IS NULL) AND status = 'DELAYED'`,
      [companyId]
    );

    // 3. Active Alerts count
    const alertsRes = await db.query(
      `SELECT COUNT(*) FROM alerts WHERE (company_id = $1 OR company_id = 'COMP-001' OR company_id IS NULL) AND status = 'Active'`,
      [companyId]
    );

    // 4. Delivered today
    const deliveredTodayRes = await db.query(
      `SELECT COUNT(*) FROM trips 
       WHERE (company_id = $1 OR company_id = 'COMP-001' OR company_id IS NULL) 
         AND status = 'CLOSED' 
         AND last_update_timestamp >= CURRENT_DATE`,
      [companyId]
    );

    // 5. Driver Performance Leaderboard
    const driversRes = await db.query(
      `SELECT id, name, license_number AS license, phone, experience_years AS experience, performance_score AS performance, warnings_count AS warnings, status
       FROM drivers 
       WHERE company_id = $1 OR company_id = 'COMP-001' OR company_id IS NULL 
       ORDER BY performance_score DESC, experience_years DESC LIMIT 10`,
      [companyId]
    );

    // 6. Branch distribution volume stats
    const branchVolRes = await db.query(
      `SELECT b.name AS branch_name, COUNT(t.id) AS total_trips
       FROM branches b
       LEFT JOIN trips t ON (t.source_branch_id = b.id OR t.destination_branch_id = b.id)
       WHERE b.company_id = $1 OR b.company_id IS NULL
       GROUP BY b.id, b.name
       ORDER BY total_trips DESC`,
      [companyId]
    );

    // 7. Incident delay reasons distribution
    const delayReasonRes = await db.query(
      `SELECT type AS reason, COUNT(*) AS count
       FROM alerts
       WHERE company_id = $1 OR company_id IS NULL
       GROUP BY type
       ORDER BY count DESC`,
      [companyId]
    );

    res.json({
      success: true,
      stats: {
        inTransit: parseInt(inTransitRes.rows[0].count, 10),
        delayed: parseInt(delayedRes.rows[0].count, 10),
        activeAlerts: parseInt(alertsRes.rows[0].count, 10),
        deliveredToday: parseInt(deliveredTodayRes.rows[0].count, 10),
      },
      driverLeaderboard: driversRes.rows,
      branchDistribution: branchVolRes.rows,
      delayReasonDistribution: delayReasonRes.rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
