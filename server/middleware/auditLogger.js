const db = require('../config/db');

async function logAudit(companyId, userId, userRole, action, resource, details, ipAddress) {
  try {
    await db.query(
      `INSERT INTO audit_logs (company_id, user_id, user_role, action, resource, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [companyId || null, userId || null, userRole || null, action, resource, JSON.stringify(details || {}), ipAddress || '127.0.0.1']
    );
  } catch (err) {
    console.error('Audit Log Error:', err);
  }
}

function auditMiddleware(action, resource) {
  return (req, res, next) => {
    const originalSend = res.send;
    res.send = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const companyId = req.user ? req.user.companyId : null;
        const userId = req.user ? req.user.id : null;
        const userRole = req.user ? req.user.role : null;
        const ip = req.ip || req.connection.remoteAddress;

        logAudit(companyId, userId, userRole, action, resource, { body: req.body, query: req.query, params: req.params }, ip);
      }
      return originalSend.apply(res, arguments);
    };
    next();
  };
}

module.exports = {
  logAudit,
  auditMiddleware,
};
