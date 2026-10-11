// routes/me.js  (mounted at /api/me)  - everything here needs a logged-in user
//   GET    /api/me                      profile (+ donor profile and donation history if a donor)
//   PUT    /api/me                      update name / phone, and donor city, area, pincode, availability
//   POST   /api/me/donations            record a donation (donors)
//   DELETE /api/me/donations/:id        remove a wrongly entered donation (donors)
//   GET    /api/me/matching             open requests this donor can help with (donors)
//   GET    /api/me/requests             requests I posted
//   PATCH  /api/me/requests/:id/complete   mark my request as fulfilled
//   PUT    /api/me/password             change my password (needs the current one)
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
['User', 'Donor', 'BloodRequest', 'Donation'].forEach(m => require('../models/' + m));
const User = mongoose.model('User'), Donor = mongoose.model('Donor'), BloodRequest = mongoose.model('BloodRequest'), Donation = mongoose.model('Donation');

const GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const DON = {
    'O-': GROUPS, 'O+': ['O+', 'A+', 'B+', 'AB+'], 'A-': ['A-', 'A+', 'AB-', 'AB+'], 'A+': ['A+', 'AB+'],
    'B-': ['B-', 'B+', 'AB-', 'AB+'], 'B+': ['B+', 'AB+'], 'AB-': ['AB-', 'AB+'], 'AB+': ['AB+']
};
const gap = g => (String(g).toLowerCase() === 'female' ? 120 : 90);
const PHONE = /^[6-9]\d{9}$/;

router.use((req, res, next) => {
    try { req.uid = jwt.verify((req.headers.authorization || '').slice(7), process.env.JWT_SECRET).id; next(); }
    catch (e) { res.status(401).json({ error: 'Please log in' }); }
});
const h = fn => (req, res) => fn(req, res).catch(e => { console.error('/api/me failed:', e); res.status(500).json({ error: e.message }); });
const bad = (res, m, c = 400) => res.status(c).json({ error: m });
const myDonor = req => Donor.findOne({ user: req.uid });

async function profile(uid) {
    const user = await User.findById(uid).select('-password').lean();
    if (!user) return null;
    const donor = await Donor.findOne({ user: uid }).lean();
    let history = [], eligibleOn = null;
    if (donor) {
        history = await Donation.find({ donor: donor._id }).sort({ date: -1 }).limit(50).lean();
        if (donor.lastDonation) eligibleOn = new Date(new Date(donor.lastDonation).getTime() + gap(donor.gender) * 864e5);
    }
    return { user, donor, history, eligibleOn };
}

router.get('/', h(async (req, res) => { const p = await profile(req.uid); p ? res.json(p) : bad(res, 'Account not found', 401); }));

router.put('/', h(async (req, res) => {
    const b = req.body || {}, u = await User.findById(req.uid);
    if (!u) return bad(res, 'Account not found', 401);
    if (b.name !== undefined) { const n = String(b.name).trim(); if (n.length < 2) return bad(res, 'Enter your name'); u.name = n; }
    if (b.phone !== undefined) { const p = String(b.phone).trim(); if (!PHONE.test(p)) return bad(res, 'Enter a valid 10-digit mobile number'); u.phone = p; }
    const d = await myDonor(req);
    if (d) {
        if (b.name !== undefined) d.name = u.name;
        if (b.phone !== undefined) d.phone = u.phone;
        if (b.city !== undefined) { const c = String(b.city).trim(); if (!c) return bad(res, 'Enter your city'); d.city = c; }
        if (b.area !== undefined) d.area = String(b.area).trim();
        if (b.pincode !== undefined) { const p = String(b.pincode).trim(); if (p && !/^\d{6}$/.test(p)) return bad(res, 'Pincode must be 6 digits'); d.pincode = p; }
        if (b.available !== undefined) d.available = b.available === true || b.available === 'true';
        await d.save();
    }
    await u.save();
    res.json(await profile(req.uid));
}));

router.post('/donations', h(async (req, res) => {
    const d = await myDonor(req); if (!d) return bad(res, 'Only donors can record donations', 403);
    const b = req.body || {}, date = new Date(b.date), units = parseInt(b.units || 1, 10), hospital = String(b.hospital || '').trim();
    if (isNaN(date)) return bad(res, 'Select the donation date');
    if (date.getTime() > Date.now() + 864e5) return bad(res, 'Donation date cannot be in the future');
    if (date.getFullYear() < 2000) return bad(res, 'Enter a valid donation date');
    if (!(units >= 1 && units <= 2)) return bad(res, 'Units must be 1 or 2');
    if (hospital.length > 100) return bad(res, 'Hospital name is too long');
    await Donation.create({ donor: d._id, date, hospital, units });
    const latest = await Donation.findOne({ donor: d._id }).sort({ date: -1 });
    d.lastDonation = latest.date; await d.save();
    res.status(201).json(await profile(req.uid));
}));

router.delete('/donations/:id', h(async (req, res) => {
    const d = await myDonor(req); if (!d) return bad(res, 'Only donors can do this', 403);
    if (!mongoose.isValidObjectId(req.params.id)) return bad(res, 'Invalid id');
    const x = await Donation.findOneAndDelete({ _id: req.params.id, donor: d._id });
    if (!x) return bad(res, 'Donation not found', 404);
    const latest = await Donation.findOne({ donor: d._id }).sort({ date: -1 });
    d.lastDonation = latest ? latest.date : undefined; await d.save();
    res.json(await profile(req.uid));
}));

router.get('/matching', h(async (req, res) => {
    const d = await myDonor(req); if (!d) return bad(res, 'Only donors can see matching requests', 403);
    const can = GROUPS.filter(k => (DON[d.bloodGroup] || []).includes(k));
    const rank = { critical: 0, urgent: 1 }, yesterday = new Date(Date.now() - 864e5);
    const list = await BloodRequest.find({ bloodGroup: { $in: can }, status: { $in: ['Pending', 'Accepted'] }, neededOn: { $gte: yesterday } }).sort({ createdAt: -1 }).limit(40).lean();
    res.json(list
        .sort((a, b) => (rank[String(a.level).toLowerCase()] ?? 2) - (rank[String(b.level).toLowerCase()] ?? 2) || (b.bloodGroup === d.bloodGroup) - (a.bloodGroup === d.bloodGroup))
        .slice(0, 12)
        .map(r => ({
            id: r._id, bloodGroup: r.bloodGroup, level: r.level, units: r.units, hospital: r.hospital, location: r.location, neededOn: r.neededOn,
            message: r.message, patient: String(r.patient || 'Patient').split(' ')[0], contact: r.contact
        })));
}));

router.get('/requests', h(async (req, res) => res.json(await BloodRequest.find({ requester: req.uid }).sort({ createdAt: -1 }).lean())));

router.patch('/requests/:id/complete', h(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return bad(res, 'Invalid id');
    const r = await BloodRequest.findOneAndUpdate({ _id: req.params.id, requester: req.uid }, { status: 'Completed' }, { new: true });
    r ? res.json(r) : bad(res, 'Request not found', 404);
}));

const pwTries = new Map();                                                   // at most 5 wrong guesses per 15 minutes
router.put('/password', h(async (req, res) => {
    const recent = (pwTries.get(req.uid) || []).filter(t => Date.now() - t < 9e5);
    if (recent.length >= 5) return bad(res, 'Too many attempts. Please try again in 15 minutes.', 429);
    const current = String((req.body || {}).current || ''), next = String((req.body || {}).password || '');
    if (next.length < 6) return bad(res, 'New password must be at least 6 characters');
    if (next.length > 72) return bad(res, 'New password is too long (72 characters at most)');
    const u = await User.findById(req.uid);
    if (!u) return bad(res, 'Account not found', 401);
    if (!(await bcrypt.compare(current, u.password))) { recent.push(Date.now()); pwTries.set(req.uid, recent); return bad(res, 'Current password is wrong'); }
    if (current === next) return bad(res, 'New password must be different from the current one');
    u.password = await bcrypt.hash(next, 10);
    await u.save();
    res.json({ ok: true });
}));

module.exports = router;