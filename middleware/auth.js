const jwt = require('jsonwebtoken');

// protect()            -> any logged-in user
// protect(['admin'])   -> only admins
exports.protect = (roles = []) => (req, res, next) => {
    try {
        const token = (req.headers.authorization || '').replace('Bearer ', '');
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        if (roles.length && !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Not allowed' });
        }
        next();
    } catch {
        res.status(401).json({ error: 'Please log in' });
    }
};