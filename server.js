require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const seedAdmin = require('./utils/seed');

const app = express();
app.set('trust proxy', 1);

const loginTries = new Map();
app.use('/api/auth/login', (req, res, next) => {
    if (req.method !== 'POST') return next();
    const now = Date.now(), t = (loginTries.get(req.ip) || []).filter(x => now - x < 15 * 60 * 1000);
    if (t.length >= 20) return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
    t.push(now); loginTries.set(req.ip, t); next();
});
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/donors', require('./routes/donors'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/me', require('./routes/me'));
app.use('/api/contact', require('./routes/contact'));

const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('MongoDB connected');
        await seedAdmin();
        app.listen(PORT, () => console.log('RaktSetu running on http://localhost:' + PORT));
    })
    .catch(err => console.error('MongoDB connection failed:', err.message));