// routes/requests.js  (mounted at /api/requests)
//   POST /api/requests        -> post a blood request (login optional)
//   GET  /api/requests/mine   -> my requests (login required)
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('../models/BloodRequest');
const BloodRequest = mongoose.model('BloodRequest');

const GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'], LEVELS = ['Normal', 'Urgent', 'Critical'];
const who = req => { try { return jwt.verify((req.headers.authorization || '').slice(7), process.env.JWT_SECRET); } catch (e) { return null; } };

// simple spam guard: at most 5 requests per hour from one address
const hits = new Map();
const tooMany = ip => { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 36e5); a.push(now); hits.set(ip, a); return a.length > 5; };

router.post('/', async (req, res) => {
    try {
        const b = req.body || {}, bad = m => res.status(400).json({ error: m });
        const patient = String(b.patient || '').trim(), hospital = String(b.hospital || '').trim(), location = String(b.location || '').trim();
        const contact = String(b.contact || '').trim(), message = String(b.message || '').trim(), units = parseInt(b.units, 10);
        if (patient.length < 2) return bad('Enter the patient name');
        if (!GROUPS.includes(b.bloodGroup)) return bad('Select the blood group required');
        if (!hospital) return bad('Enter the hospital name');
        if (!location) return bad('Enter the hospital location');
        if (!(units >= 1 && units <= 10)) return bad('Units must be between 1 and 10');
        if (!/^[6-9]\d{9}$/.test(contact)) return bad('Enter a valid 10-digit contact number');
        if (message.length > 300) return bad('Message must be 300 characters or less');
        const needed = new Date(b.neededOn), today = new Date(); today.setHours(0, 0, 0, 0);
        if (isNaN(needed)) return bad('Select the date blood is needed');
        if (needed.getTime() < today.getTime() - 864e5) return bad('Required date cannot be in the past');
        if (needed.getTime() > today.getTime() + 90 * 864e5) return bad('Required date must be within the next 90 days');

        if (tooMany(req.ip)) return res.status(429).json({ error: 'Too many requests from this device. Please try again in an hour.' });   // counts only valid submissions
        const u = who(req);
        const doc = await BloodRequest.create({
            requester: u && u.id, patient, bloodGroup: b.bloodGroup, hospital, location, neededOn: needed, units,
            level: LEVELS.includes(b.level) ? b.level : 'Normal', contact, message
        });
        res.status(201).json({ ok: true, id: doc._id });
    } catch (e) { console.error('POST /api/requests failed:', e); res.status(500).json({ error: 'Could not save your request. Please try again.' }); }
});

router.get('/mine', async (req, res) => {
    const u = who(req);
    if (!u) return res.status(401).json({ error: 'Please log in' });
    try { res.json(await BloodRequest.find({ requester: u.id }).sort({ createdAt: -1 }).lean()); }
    catch (e) { console.error('GET /api/requests/mine failed:', e); res.status(500).json({ error: e.message }); }
});

module.exports = router;