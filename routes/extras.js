/* New RaktSetu endpoints. Mounted in server.js:  app.use('/api', require('./routes/extras'));
   Uses models/BloodRequest.js (poster field = requester, optional email field).   */
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'), Donor = require('../models/Donor'), Request = require('../models/BloodRequest');
const DonorForm = require('../models/DonorForm'), Acceptance = require('../models/Acceptance'), Feedback = require('../models/Feedback');
const { COMPAT, notifyRequester } = require('../utils/mailer');

const auth = (req, res, next) => {
    try { req.auth = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), process.env.JWT_SECRET); next(); }
    catch { res.status(401).json({ error: 'Please log in' }); }
};
const fail = (res, e) => res.status(500).json({ error: e.message });

/* ---------- donor questionnaire & consent ---------- */
router.get('/donor-form', auth, async (req, res) => {
    try { const f = await DonorForm.findOne({ user: req.auth.id }); res.json(f ? { form: f.data, submittedAt: f.submittedAt } : { form: null }); } catch (e) { fail(res, e); }
});
router.post('/donor-form', auth, async (req, res) => {
    try {
        const { form, deferralFlags } = req.body || {};
        if (!form || !form.declaration || !String(form.signature || '').trim()) return res.status(400).json({ error: 'Please accept the declaration and sign the form' });
        if (!/^\d{10}$/.test(form.phone || '')) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
        const doc = await DonorForm.findOneAndUpdate({ user: req.auth.id },
            { data: form, deferralFlags: deferralFlags || [], submittedAt: new Date() }, { upsert: true, new: true, setDefaultsOnInsert: true });
        res.json({ ok: true, submittedAt: doc.submittedAt });
    } catch (e) { fail(res, e); }
});

/* ---------- accept / withdraw a request (donor) ---------- */
router.post('/me/requests/:id/accept', auth, async (req, res) => {
    try {
        const donor = await Donor.findOne({ user: req.auth.id });
        if (!donor) return res.status(403).json({ error: 'Only donors can accept requests' });
        if (!donor.verified) return res.status(403).json({ error: 'Your profile is awaiting admin verification' });
        const r = await Request.findById(req.params.id);
        if (!r || ['Completed', 'Rejected'].includes(r.status)) return res.status(404).json({ error: 'This request is no longer open' });
        if (!(COMPAT[r.bloodGroup] || []).includes(donor.bloodGroup)) return res.status(400).json({ error: 'Your blood group is not compatible with this request' });
        try { await Acceptance.create({ request: r._id, donor: donor._id, user: req.auth.id }); }
        catch (e) { if (e.code === 11000) return res.json({ ok: true, already: true }); throw e; }
        // tell the family: poster's email, else the email stored on the request
        const poster = r.requester ? await User.findById(r.requester).select('email') : null;
        notifyRequester((poster && poster.email) || r.email, r, donor).catch(e => console.error('accept mail:', e.message));
        res.json({ ok: true });
    } catch (e) { fail(res, e); }
});
router.delete('/me/requests/:id/accept', auth, async (req, res) => {
    try { const d = await Donor.findOne({ user: req.auth.id }); if (d) await Acceptance.deleteOne({ request: req.params.id, donor: d._id }); res.json({ ok: true }); } catch (e) { fail(res, e); }
});
router.get('/me/accepted', auth, async (req, res) => {          // request ids this donor accepted
    try { res.json((await Acceptance.find({ user: req.auth.id }).select('request')).map(a => String(a.request))); } catch (e) { fail(res, e); }
});
router.get('/me/requests/accepted', auth, async (req, res) => {  // for the poster: donors who accepted each of my requests
    try {
        const mine = await Request.find({ requester: req.auth.id }).select('_id');
        const list = await Acceptance.find({ request: { $in: mine.map(m => m._id) } }).populate('donor', 'name bloodGroup city area phone');
        const out = {}; list.forEach(a => { if (a.donor) (out[a.request] = out[a.request] || []).push({ name: a.donor.name, bloodGroup: a.donor.bloodGroup, city: a.donor.city, area: a.donor.area, phone: a.donor.phone, at: a.createdAt }); });
        res.json(out);
    } catch (e) { fail(res, e); }
});

/* ---------- feedback (doctor / donor / receiver) ---------- */
router.post('/feedback', auth, async (req, res) => {
    try {
        const { type, about, rating, comment } = req.body || {};
        if (!['doctor', 'donor', 'receiver'].includes(type)) return res.status(400).json({ error: 'Choose a feedback type' });
        if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Choose a rating from 1 to 5' });
        if (String(comment || '').trim().length < 5) return res.status(400).json({ error: 'Please write a few words' });
        await Feedback.create({ user: req.auth.id, role: req.auth.role, type, about: String(about || '').slice(0, 80), rating: +rating, comment: String(comment).slice(0, 1000) });
        res.status(201).json({ ok: true });
    } catch (e) { fail(res, e); }
});
router.get('/feedback', auth, async (req, res) => {              // admin only
    try {
        if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
        res.json(await Feedback.find().sort('-createdAt').limit(200).populate('user', 'name email'));
    } catch (e) { fail(res, e); }
});

/* ---------- donors grouped by blood group (public, no phone numbers) ---------- */
router.get('/groups', async (req, res) => {
    try {
        const since = Date.now() - 90 * 864e5, out = {};
        ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].forEach(g => out[g] = { total: 0, available: 0, donors: [] });
        const donors = await Donor.find({ verified: true }).select('name bloodGroup city area available lastDonation').sort('city name');
        donors.forEach(d => { const g = out[d.bloodGroup]; if (!g) return;
            const ready = d.available !== false && !(d.lastDonation && +new Date(d.lastDonation) > since);
            const p = String(d.name).trim().split(/\s+/);
            g.total++; if (ready) g.available++;
            g.donors.push({ name: p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''), city: d.city, area: d.area, ready }); });
        res.json(out);
    } catch (e) { fail(res, e); }
});

module.exports = router;
