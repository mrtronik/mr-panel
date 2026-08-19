const crypto = require('crypto');

// Generate CSRF token per session
function generateToken(req, res, next) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    // Make token available in EJS templates
    res.locals.csrfToken = req.session.csrfToken;
    next();
}

// Validate CSRF token on state-changing requests
function validateToken(req, res, next) {
    const token = req.body._csrf || req.headers['x-csrf-token'] || req.query._csrf;
    if (!token || token !== req.session.csrfToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    next();
}

module.exports = { generateToken, validateToken };
