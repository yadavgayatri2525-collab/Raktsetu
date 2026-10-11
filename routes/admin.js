// routes/admin.js  (mounted at /api/admin)  - every route needs a logged-in ADMIN
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
['User', 'Donor', 'BloodRequest'].forEach(m => require('../models/' + m));
let Donation = null; try { require('../models/Donation'); Donation = mongoose.model('Donation'); } catch (e) { }
let Msg = null; try { require('../models/ContactMessage'); Msg = mongoose.model('ContactMessage'); } catch (e) { }   // optional: Contact page messages
const User = mongoose.model('User'), Donor = mongoose.model('Donor'), BloodRequest = mongoose.model('BloodRequest');
const STATUSES = ['Pending', 'Accepted', 'Completed', 'Rejected'];

// guard: valid token AND the account is really an admin in the database
router.use(async (req, res, next) => {
    let p; try { p = jwt.verify((req.headers.authorization || '').slice(7), process.env.JWT_SECRET); } catch (e) { return res.status(401).json({ error: 'Please log in as admin' }); }
    try {
        const u = await User.findById(p.id).select('role name');
        if (!u || u.role !== 'admin') return res.status(403).json({ error: 'Admins only' });
        req.admin = u; next();
    } catch (e) { res.status(500).json({ error: e.message }); }
});
const h = fn => (req, res) => fn(req, res).catch(e => { console.error('admin route failed:', e); res.status(500).json({ error: e.message }); });
const validId = (req, res) => { if (mongoose.isValidObjectId(req.params.id)) return true; res.status(400).json({ error: 'Invalid id' }); return false; };

router.get('/overview', h(async (req, res) => {
    const [users, donors, available, unverified, requests, pending, completed, donorList, requestList, userList] = await Promise.all([
        User.countDocuments({ role: { $ne: 'admin' } }), Donor.countDocuments(), Donor.countDocuments({ verified: true, available: true }),
        Donor.countDocuments({ verified: { $ne: true } }), BloodRequest.countDocuments(), BloodRequest.countDocuments({ status: 'Pending' }),
        BloodRequest.countDocuments({ status: 'Completed' }),
        Donor.find().sort({ createdAt: -1 }).limit(200).lean(), BloodRequest.find().sort({ createdAt: -1 }).limit(200).lean(),
        User.find({ role: { $ne: 'admin' } }).select('-password').sort({ createdAt: -1 }).limit(200).lean()
    ]);
    const unreadMessages = Msg ? await Msg.countDocuments({ read: { $ne: true } }) : 0;
    const messages = Msg ? await Msg.find().sort({ createdAt: -1 }).limit(200).lean() : [];
    res.json({ admin: req.admin.name, counts: { users, donors, available, unverified, requests, pending, completed, unreadMessages }, donors: donorList, requests: requestList, users: userList, messages });
}));

router.patch('/donors/:id/verify', h(async (req, res) => {
    if (!validId(req, res)) return;
    const d = await Donor.findByIdAndUpdate(req.params.id, { verified: req.body.verified !== false }, { new: true });
    d ? res.json(d) : res.status(404).json({ error: 'Donor not found' });
}));

router.delete('/donors/:id', h(async (req, res) => {
    if (!validId(req, res)) return;
    const d = await Donor.findByIdAndDelete(req.params.id);
    if (!d) return res.status(404).json({ error: 'Donor not found' });
    if (Donation) await Donation.deleteMany({ donor: d._id });
    await User.updateOne({ _id: d.user, role: 'donor' }, { role: 'user' });        // account stays, donor profile is gone
    res.json({ ok: true });
}));

router.delete('/users/:id', h(async (req, res) => {
    if (!validId(req, res)) return;
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.role === 'admin') return res.status(400).json({ error: 'Admin accounts cannot be deleted here' });
    const ids = (await Donor.find({ user: u._id }).select('_id')).map(d => d._id);
    if (Donation && ids.length) await Donation.deleteMany({ donor: { $in: ids } });
    await Donor.deleteMany({ user: u._id });
    await BloodRequest.updateMany({ requester: u._id }, { $unset: { requester: 1 } }); // keep the request, unlink the person
    await u.deleteOne();
    res.json({ ok: true });
}));

router.post('/users/:id/reset-password', h(async (req, res) => {
    if (!validId(req, res)) return;
    const u = await User.findById(req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.role === 'admin') return res.status(400).json({ error: 'Admin passwords cannot be reset here' });
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';                               // no look-alike characters (0/O, 1/I/l)
    let temp = ''; for (let i = 0; i < 10; i++) temp += A[crypto.randomInt(A.length)];
    u.password = await bcrypt.hash(temp, 10);
    await u.save();
    res.json({ temp, name: u.name, email: u.email });                           // shown to the admin once, never stored in plain text
}));

router.patch('/requests/:id', h(async (req, res) => {
    if (!validId(req, res)) return;
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
    const r = await BloodRequest.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    r ? res.json(r) : res.status(404).json({ error: 'Request not found' });
}));

router.delete('/requests/:id', h(async (req, res) => {
    if (!validId(req, res)) return;
    const r = await BloodRequest.findByIdAndDelete(req.params.id);
    r ? res.json({ ok: true }) : res.status(404).json({ error: 'Request not found' });
}));

router.patch('/messages/:id/read', h(async (req, res) => {
    if (!Msg) return res.status(404).json({ error: 'Messages are not set up' });
    if (!validId(req, res)) return;
    const m = await Msg.findByIdAndUpdate(req.params.id, { read: req.body.read !== false }, { new: true });
    m ? res.json(m) : res.status(404).json({ error: 'Message not found' });
}));

router.delete('/messages/:id', h(async (req, res) => {
    if (!Msg) return res.status(404).json({ error: 'Messages are not set up' });
    if (!validId(req, res)) return;
    const m = await Msg.findByIdAndDelete(req.params.id);
    m ? res.json({ ok: true }) : res.status(404).json({ error: 'Message not found' });
}));

module.exports = router;