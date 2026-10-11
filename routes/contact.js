// routes/contact.js  (mounted at /api/contact)
//   POST /api/contact   -> saves a message from the Contact page (admins read it in the dashboard)
const router = require('express').Router();
const mongoose = require('mongoose');
require('../models/ContactMessage');
const Msg = mongoose.model('ContactMessage');

const TOPICS = ['General', 'Account or login', 'Donor verification', 'Report a problem', 'Feedback'];
const hits = new Map();                                                     // at most 3 messages per hour from one address
const tooMany = ip => { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 36e5); a.push(now); hits.set(ip, a); return a.length > 3; };

router.post('/', async (req, res) => {
    try {
        const b = req.body || {}, bad = m => res.status(400).json({ error: m });
        if (b.website) return res.status(201).json({ ok: true });            // hidden "website" field: only bots fill it in
        const name = String(b.name || '').trim(), email = String(b.email || '').trim(), message = String(b.message || '').trim();
        if (name.length < 2) return bad('Enter your name');
        if (!/^\S+@\S+\.\S+$/.test(email)) return bad('Enter a valid email address');
        if (message.length < 10) return bad('Please write at least 10 characters');
        if (message.length > 1000) return bad('Message must be 1000 characters or less');
        if (tooMany(req.ip)) return res.status(429).json({ error: 'Too many messages from this device. Please try again in an hour.' });
        await Msg.create({ name, email, topic: TOPICS.includes(b.topic) ? b.topic : 'General', message });
        res.status(201).json({ ok: true });
    } catch (e) { console.error('POST /api/contact failed:', e); res.status(500).json({ error: 'Could not send your message. Please try again.' }); }
});

module.exports = router;