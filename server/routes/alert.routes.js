const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { broadcastAlert } = require('../services/socketService');
const whatsappService = require('../services/whatsappService');

// GET /api/alerts (List active / historical alerts)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const companyId = req.user.companyId || 'COMP-001';
    const statusFilter = req.query.status || 'Active';

    let query = `SELECT * FROM alerts WHERE company_id = $1 OR company_id = 'COMP-001' OR company_id IS NULL`;
    const params = [companyId];

    if (statusFilter !== 'ALL') {
      params.push(statusFilter);
      query += ` AND status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query(query, params);
    res.json({ success: true, alerts: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/alerts (Create Alert)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { tripId, vehicleId, driverId, type, message, severity } = req.body;
    const companyId = req.user.companyId || 'COMP-001';

    const countRes = await db.query(`SELECT COUNT(*) FROM alerts`);
    const alertId = 'ALT-' + (parseInt(countRes.rows[0].count, 10) + 101);

    const result = await db.query(
      `INSERT INTO alerts (id, company_id, trip_id, vehicle_id, driver_id, type, message, severity, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Active')
       RETURNING *`,
      [alertId, companyId, tripId || null, vehicleId || null, driverId || null, type || 'Incident', message, severity || 'warning']
    );

    broadcastAlert(result.rows[0]);

    // Asynchronously dispatch WhatsApp alert to Driver and Higher Official
    (async () => {
      try {
        let driverPhone = null;
        let driverName = null;
        if (driverId) {
          const dRes = await db.query(`SELECT name, phone FROM drivers WHERE id = $1`, [driverId]);
          if (dRes.rows.length > 0) {
            driverName = dRes.rows[0].name;
            driverPhone = dRes.rows[0].phone;
          }
        } else if (tripId) {
          const tRes = await db.query(
            `SELECT d.name, d.phone FROM trips t JOIN drivers d ON d.id = t.driver_id WHERE t.id = $1`,
            [tripId]
          );
          if (tRes.rows.length > 0) {
            driverName = tRes.rows[0].name;
            driverPhone = tRes.rows[0].phone;
          }
        }

        const higherOfficial = process.env.HIGHER_OFFICIAL_PHONE || '916382897998';
        const cleanOfficialPhone = (higherOfficial || '').replace(/[^0-9]/g, '');
        const cleanDriverPhone = (driverPhone || '').replace(/[^0-9]/g, '');

        // 1. Notify Driver on WhatsApp
        if (driverPhone) {
          await whatsappService.sendTextMessage(
            driverPhone,
            `🚨 *DRIVER URGENT ALERT: ${type || 'Incident'}*\n────────────────────────────\n${message}\n📋 *Trip ID:* ${tripId || 'N/A'}\n🚛 *Vehicle:* ${vehicleId || 'Assigned Lorry'}\n────────────────────────────\n⚠️ Central Operations requires your immediate attention.\nReply *MOVING* if in transit, *DELAY <reason>* if halted, or *SOS* for emergency.`
          ).catch(e => console.warn('Driver alert error:', e.message));
        }

        // 2. Notify Higher Official
        if (higherOfficial) {
          const isStoppage = (type && type.toLowerCase().includes('stoppage')) || (message && message.toLowerCase().includes('halted'));
          if (isStoppage) {
            let routeInfo = { source_name: 'Origin Depot', dest_name: 'Destination Depot' };
            if (tripId) {
              const bRes = await db.query(
                `SELECT sb.name AS source_name, db_br.name AS dest_name 
                 FROM trips t 
                 LEFT JOIN branches sb ON sb.id = t.source_branch_id 
                 LEFT JOIN branches db_br ON db_br.id = t.destination_branch_id 
                 WHERE t.id = $1`,
                [tripId]
              );
              if (bRes.rows.length > 0) routeInfo = bRes.rows[0];
            }
            await whatsappService.sendHigherOfficialStoppageAlert(
              {
                vehicle_id: vehicleId || 'TN-59-EF-9012',
                driver_name: driverName || 'Saravanan K.',
                driver_phone: driverPhone || '916382897998',
                trip_id: tripId || 'TRIP-1002',
                source_name: routeInfo.source_name || 'Coimbatore',
                dest_name: routeInfo.dest_name || 'Chennai',
                current_lat: '11.6455',
                current_lng: '78.1576'
              },
              { stoppage_duration_minutes: 25 },
              higherOfficial
            ).catch(err => console.warn('Higher official stoppage alert error:', err.message));
          } else {
            await whatsappService.sendTextMessage(
              higherOfficial,
              `🚨 *OPERATIONS INCIDENT ALERT*\n────────────────────────────\n📋 *Type:* ${type || 'Incident'} (${severity || 'Warning'})\n📝 *Details:* ${message}\n🚛 *Vehicle:* ${vehicleId || 'N/A'}\n👤 *Driver:* ${driverName || 'N/A'}${driverPhone ? ` (📞 ${driverPhone})` : ''}\n📋 *Trip ID:* ${tripId || 'N/A'}\n────────────────────────────\n_Logistics Operations Control_`
            ).catch(err => console.warn('Higher official alert error:', err.message));
          }
        }
      } catch (waErr) {
        console.warn('⚠️ [WhatsApp Alert Dispatch Error]:', waErr.message);
      }
    })();

    res.status(201).json({ success: true, alert: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/alerts/:id/call-attempt (Execute driver call attempt - 3 strikes flow)
router.post('/:id/call-attempt', authenticateToken, async (req, res) => {
  try {
    const alertId = req.params.id;
    const alertRes = await db.query(`SELECT * FROM alerts WHERE id = $1`, [alertId]);
    if (alertRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Alert not found' });
    const alert = alertRes.rows[0];

    // Fetch call responses count to find attempt number
    const attemptsRes = await db.query(`SELECT COUNT(*) FROM alert_responses WHERE alert_id = $1`, [alertId]);
    const attemptNumber = parseInt(attemptsRes.rows[0].count, 10) + 1;

    // Simulate driver answer logic (or driver input)
    const isUnreachable = alert.type === 'Unreachable';
    let answered = false;
    if (!isUnreachable) {
      if (attemptNumber === 1 && Math.random() > 0.5) answered = true;
      else if (attemptNumber === 2 && Math.random() > 0.3) answered = true;
      else if (attemptNumber >= 3) answered = true;
    } else {
      if (Math.random() > 0.75) answered = true;
    }

    let message = '';
    let strikesExceeded = false;
    let blacklistRecommend = false;

    if (answered) {
      // Alert Resolved
      await db.query(`UPDATE alerts SET status = 'Resolved', resolved_at = NOW() WHERE id = $1`, [alertId]);
      if (alert.trip_id) {
        await db.query(`UPDATE trips SET status = 'IN_TRANSIT', last_update_timestamp = NOW() WHERE id = $1`, [alert.trip_id]);
      }
      message = `Attempt ${attemptNumber}/3: Call Answered by driver! Status updated to IN_TRANSIT, alert resolved.`;
    } else {
      if (attemptNumber >= 3) {
        strikesExceeded = true;
        await db.query(`UPDATE alerts SET status = 'Escalated', escalated = true, escalated_to_role = 'OWNER', escalated_at = NOW() WHERE id = $1`, [alertId]);

        if (alert.driver_id) {
          await db.query(
            `UPDATE drivers 
             SET warnings_count = warnings_count + 1, 
                 performance_score = GREATEST(0, performance_score - 15),
                 status = CASE WHEN warnings_count + 1 >= 3 THEN 'Suspended' ELSE status END
             WHERE id = $1`,
            [alert.driver_id]
          );
        }
        message = `Attempt ${attemptNumber}/3: No Answer. 3 strikes exceeded! Alert escalated to Owner, driver warning issued.`;
      } else {
        message = `Attempt ${attemptNumber}/3: No Answer from driver. Registered attempt.`;
      }
    }

    // Record escalation response log
    await db.query(
      `INSERT INTO alert_responses (alert_id, responder_user_id, action_taken, notes, driver_response, escalation_level)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [alertId, req.user.id, answered ? 'Call Answered' : 'No Answer', message, answered ? 'Driver confirmed safety' : 'Unreachable', attemptNumber]
    );

    // Record Call log
    const callLogId = 'CL-' + Math.floor(1000 + Math.random() * 9000);
    await db.query(
      `INSERT INTO call_logs (id, company_id, trip_id, call_category, caller, recipient, conversation_notes)
       VALUES ($1, $2, $3, 'Escalation Call', 'Admin Office', $4, $5)`,
      [callLogId, req.user.companyId || 'COMP-001', alert.trip_id, `Driver (Attempt ${attemptNumber}/3)`, message]
    );

    res.json({
      success: true,
      answered,
      strikesExceeded,
      attemptNumber,
      message,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/alerts/:id/escalate (Escalate to Owner)
router.post('/:id/escalate', authenticateToken, async (req, res) => {
  try {
    const alertId = req.params.id;
    const result = await db.query(
      `UPDATE alerts 
       SET escalated = true, escalated_to_role = 'OWNER', escalated_at = NOW(), status = 'Escalated'
       WHERE id = $1
       RETURNING *`,
      [alertId]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Alert not found' });

    // Record response
    await db.query(
      `INSERT INTO alert_responses (alert_id, responder_user_id, action_taken, notes, escalation_level)
       VALUES ($1, $2, 'Escalated to Owner', 'Tracking team escalated alert to Owner for executive action.', 2)`,
      [alertId, req.user.id]
    );

    res.json({ success: true, alert: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/alerts/:id/resolve
router.post('/:id/resolve', authenticateToken, async (req, res) => {
  try {
    const alertId = req.params.id;
    const { actionNotes } = req.body;

    const result = await db.query(
      `UPDATE alerts SET status = 'Resolved', resolved_at = NOW() WHERE id = $1 RETURNING *`,
      [alertId]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Alert not found' });
    const alert = result.rows[0];

    // Refresh vehicle heartbeat/ping so it does not immediately re-trigger a stale outage
    if (alert.vehicle_id) {
      await db.query(`UPDATE vehicles SET last_ping_at = NOW(), stoppage_start_time = NULL WHERE id = $1`, [alert.vehicle_id]);
    }

    await db.query(
      `INSERT INTO alert_responses (alert_id, responder_user_id, action_taken, notes)
       VALUES ($1, $2, 'Alert Resolved', $3)`,
      [alertId, req.user.id, actionNotes || 'Alert resolved by user']
    );

    res.json({ success: true, alert: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/alerts/:id/dismiss
router.post('/:id/dismiss', authenticateToken, async (req, res) => {
  try {
    const alertId = req.params.id;
    const { reason, notes, isUnverified } = req.body || {};
    const userRole = (req.user?.role || '').toLowerCase();
    const isHigherOfficial = userRole === 'owner' || userRole === 'branch_manager' || userRole === 'super_admin';

    // Fetch existing alert
    const existingRes = await db.query(`SELECT * FROM alerts WHERE id = $1`, [alertId]);
    if (existingRes.rows.length === 0) return res.status(404).json({ success: false, message: 'Alert not found' });
    const existing = existingRes.rows[0];

    // Determine if this is an unverified dismissal that must route to the Supervisor Review Queue:
    // 1. Operator explicitly chose "Accidental Tap / Mistake" OR selected unverified
    // 2. OR dismissed by tracking team while status was active/stoppage and not an authorized higher official direct close
    const isAccidental = reason && reason.toLowerCase().includes('accidental');
    const isStoppageAwaitingReply = existing.type === 'Stoppage Detected' || (existing.message && existing.message.toLowerCase().includes('halted'));
    
    const shouldRouteToSupervisor = !isHigherOfficial && (isUnverified || isAccidental || isStoppageAwaitingReply || reason === 'Other / Sent to Supervisor');

    const newStatus = shouldRouteToSupervisor ? 'Pending_Supervisor' : 'Dismissed';
    const noteText = `Dismissed by ${req.user?.name || req.user?.role || 'Operator'}. Reason: ${reason || 'General Dismissal'}${notes ? ' - ' + notes : ''}`;

    const result = await db.query(
      `UPDATE alerts 
       SET status = $1, 
           escalated = $2, 
           escalated_to_role = $3, 
           escalated_at = CASE WHEN $2 = TRUE THEN NOW() ELSE escalated_at END 
       WHERE id = $4 RETURNING *`,
      [newStatus, shouldRouteToSupervisor, shouldRouteToSupervisor ? 'SUPERVISOR' : null, alertId]
    );

    // Record response audit trail in alert_responses
    try {
      await db.query(
        `INSERT INTO alert_responses (alert_id, responder_user_id, action_taken, notes)
         VALUES ($1, $2, $3, $4)`,
        [alertId, req.user?.id || null, shouldRouteToSupervisor ? 'Dismissed (Routed to Supervisor Queue)' : 'Alert Dismissed', noteText]
      );
    } catch (e) {
      console.warn('Audit response insert notice:', e.message);
    }

    const updatedAlert = result.rows[0];
    broadcastAlert(updatedAlert);

    res.json({
      success: true,
      alert: updatedAlert,
      routedToSupervisor: shouldRouteToSupervisor,
      message: shouldRouteToSupervisor
        ? 'Alert routed to Supervisor Review Queue for higher official verification.'
        : 'Alert dismissed successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/alerts/:id/reopen (Higher official re-opens alert back to tracking team)
router.post('/:id/reopen', authenticateToken, async (req, res) => {
  try {
    const alertId = req.params.id;
    const { notes } = req.body || {};
    const supervisorName = req.user?.name || req.user?.role || 'Supervisor';

    const result = await db.query(
      `UPDATE alerts 
       SET status = 'Active', 
           escalated = TRUE, 
           escalated_to_role = NULL, 
           severity = 'danger',
           created_at = NOW() 
       WHERE id = $1 RETURNING *`,
      [alertId]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Alert not found' });

    try {
      await db.query(
        `INSERT INTO alert_responses (alert_id, responder_user_id, action_taken, notes)
         VALUES ($1, $2, 'Re-opened by Supervisor', $3)`,
        [alertId, req.user?.id || null, `Re-opened by ${supervisorName}. Note: ${notes || 'Immediate operator verification required'}`]
      );
    } catch (e) {
      console.warn('Audit response insert notice:', e.message);
    }

    const updatedAlert = result.rows[0];
    broadcastAlert(updatedAlert);

    res.json({ success: true, alert: updatedAlert, message: 'Alert re-opened and pushed back to tracking team.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/alerts/:id/supervisor-approve (Higher official permanently approves and resolves alert)
router.post('/:id/supervisor-approve', authenticateToken, async (req, res) => {
  try {
    const alertId = req.params.id;
    const { notes } = req.body || {};
    const supervisorName = req.user?.name || req.user?.role || 'Supervisor';

    const result = await db.query(
      `UPDATE alerts 
       SET status = 'Resolved', 
           resolved_at = NOW(),
           escalated = FALSE,
           escalated_to_role = NULL 
       WHERE id = $1 RETURNING *`,
      [alertId]
    );

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Alert not found' });
    const alert = result.rows[0];

    // Refresh vehicle stoppage so it resets cleanly
    if (alert.vehicle_id) {
      await db.query(`UPDATE vehicles SET last_ping_at = NOW(), stoppage_start_time = NULL WHERE id = $1`, [alert.vehicle_id]);
    }

    try {
      await db.query(
        `INSERT INTO alert_responses (alert_id, responder_user_id, action_taken, notes)
         VALUES ($1, $2, 'Supervisor Approved & Closed', $3)`,
        [alertId, req.user?.id || null, `Approved by ${supervisorName}. Note: ${notes || 'Verified vehicle safe and on route.'}`]
      );
    } catch (e) {
      console.warn('Audit response insert notice:', e.message);
    }

    broadcastAlert(alert);
    res.json({ success: true, alert, message: 'Alert verified and resolved by supervisor.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
