// routes/stats.js  (mounted at /api/stats)
//   GET /api/stats            -> numbers for the home page
//   GET /api/stats/emergency  -> open blood requests (contact number only for logged-in users)
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('../models/Donor');
const Donor = mongoose.model('Donor');                    // works however models/Donor.js exports it
let BloodRequest = null;                                  // optional until the request model exists
try { require('../models/BloodRequest'); BloodRequest = mongoose.model('BloodRequest'); } catch (e) { console.warn('stats: BloodRequest model not loaded:', e.message); }

const safe = async (fn, fallback) => { try { return await fn(); } catch (e) { return fallback; } };
const OPEN = { status: { $in: ['Pending', 'Accepted'] } };
const URGENT = { level: { $in: ['Critical', 'Urgent'] } };

router.get('/', async (req, res) => {
    const [donors, available, requests, fulfilled, urgent, cities, byGroup] = await Promise.all([
        safe(() => Donor.countDocuments({ verified: true }), 0),
        safe(() => Donor.countDocuments({ verified: true, available: true }), 0),
        safe(() => BloodRequest.countDocuments(), 0),
        safe(() => BloodRequest.countDocuments({ status: 'Completed' }), 0),
        safe(() => BloodRequest.countDocuments({ ...OPEN, ...URGENT }), 0),
        safe(async () => (await Donor.distinct('city', { verified: true })).filter(Boolean).length, 0),
        safe(() => Donor.aggregate([{ $match: { verified: true } }, { $group: { _id: '$bloodGroup', n: { $sum: 1 } } }]), [])
    ]);
    res.json({ donors, available, requests, fulfilled, urgent, cities, byGroup });
});

router.get('/emergency', async (req, res) => {
    let loggedIn = false;
    try { jwt.verify((req.headers.authorization || '').slice(7), process.env.JWT_SECRET); loggedIn = true; } catch (e) { }
    const rank = { critical: 0, urgent: 1 };
    const list = await safe(() => BloodRequest.find(OPEN).sort({ createdAt: -1 }).limit(40).lean(), []);
    const yesterday = Date.now() - 864e5;
    res.json(list
        .filter(r => !r.neededOn || new Date(r.neededOn).getTime() >= yesterday)
        .sort((a, b) => (rank[String(a.level).toLowerCase()] ?? 2) - (rank[String(b.level).toLowerCase()] ?? 2))
        .slice(0, 6)
        .map(r => ({
            bloodGroup: r.bloodGroup, level: r.level, units: r.units, hospital: r.hospital, location: r.location,
            neededOn: r.neededOn, message: r.message,
            patient: String(r.patient || r.patientName || 'Patient').split(' ')[0],   // first name only
            contact: loggedIn ? r.contact : undefined                                  // hidden from visitors
        })));
});

module.exports = router;
