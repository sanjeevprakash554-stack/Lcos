const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'lcos_super_secret_jwt_key_2026';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const userRole = req.user.role ? req.user.role.toUpperCase() : '';
    const formattedAllowed = allowedRoles.map(r => r.toUpperCase());
    
    if (!formattedAllowed.includes(userRole) && !formattedAllowed.includes('ALL')) {
      return res.status(403).json({ 
        success: false, 
        message: `Forbidden: Role '${req.user.role}' lacks required permissions.` 
      });
    }
    next();
  };
}

function optionalAuthenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = { id: 'usr_guest', companyId: 'COMP-001', role: 'OWNER' };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = { id: 'usr_guest', companyId: 'COMP-001', role: 'OWNER' };
    } else {
      req.user = user;
    }
    next();
  });
}

module.exports = {
  authenticateToken,
  optionalAuthenticateToken,
  authorizeRoles,
  JWT_SECRET,
};
