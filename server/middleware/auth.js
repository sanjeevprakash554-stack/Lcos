const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const PLACEHOLDER_SECRETS = ['change-me-long-random', 'lcos_super_secret_jwt_key_2026'];

let resolvedSecret = process.env.JWT_SECRET;
const nodeEnv = process.env.NODE_ENV || 'development';

if (!resolvedSecret || PLACEHOLDER_SECRETS.includes(resolvedSecret.trim())) {
  resolvedSecret = crypto.randomBytes(32).toString('hex');
  process.env.JWT_SECRET = resolvedSecret;
  if (nodeEnv === 'production') {
    console.warn(`\n⚠️  [SECURITY WARNING] Running in 'production' mode without a configured JWT_SECRET.`);
    console.warn('   Generated a secure 256-bit ephemeral secret for this session.');
    console.warn('   👉 Please configure a persistent JWT_SECRET in your Render Dashboard to keep user sessions valid across redeploys.\n');
  } else {
    console.warn(`\n⚠️  [SECURITY WARNING] Running in '${nodeEnv}' mode without a configured JWT_SECRET.`);
    console.warn('   Generated an ephemeral random secret for this process session.\n');
  }
}

const JWT_SECRET = resolvedSecret;

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. Missing Bearer token.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session token.' });
    }
    req.user = user;
    next();
  });
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const userRole = req.user.role ? req.user.role.toUpperCase() : '';
    const formattedAllowed = allowedRoles.map(r => r.toUpperCase());
    
    if (userRole === 'SUPER_ADMIN' || formattedAllowed.includes(userRole) || formattedAllowed.includes('ALL')) {
      return next();
    }
    return res.status(403).json({ success: false, message: 'Forbidden: Insufficient role permissions.' });
  };
}

/**
 * Strict authentication & authorization middleware with NO fallback.
 * Requires a valid JWT and verifies user role matches allowedRoles.
 */
function requireRealAuth(...allowedRoles) {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
      }

      req.user = user;

      if (allowedRoles && allowedRoles.length > 0) {
        const userRole = (user.role || '').toUpperCase();
        const formattedAllowed = allowedRoles.map(r => r.toUpperCase());
        if (!formattedAllowed.includes(userRole) && !formattedAllowed.includes('ALL')) {
          return res.status(403).json({
            success: false,
            message: `Forbidden: Role '${user.role}' lacks required permissions`,
          });
        }
      }

      next();
    });
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
  requireRealAuth,
  JWT_SECRET,
};
