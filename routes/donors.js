// routes/donors.js  (mounted at /api/donors)
//   GET /api/donors?bloodGroup=O%2B&city=Kalyan&area=421301&available=true&compat=1
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('../models/Donor');                // loads and registers the model
const Donor = mongoose.model('Donor');     // works however models/Donor.js exports it

const GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
// who each group can donate red cells to
const DON = {
    'O-': GROUPS, 'O+': ['O+', 'A+', 'B+', 'AB+'], 'A-': ['A-', 'A+', 'AB-', 'AB+'], 'A+': ['A+', 'AB+'],
    'B-': ['B-', 'B+', 'AB-', 'AB+'], 'B+': ['B+', 'AB+'], 'AB-': ['AB-', 'AB+'], 'AB+': ['AB+']
};
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/', async (req, res) => {
    try {
        let loggedIn = false;
        try { jwt.verify((req.headers.authorization || '').slice(7), process.env.JWT_SECRET); loggedIn = true; } catch (e) { }

        const { bloodGroup, city, area, available, compat } = req.query, f = {};
        f.verified = true;                                                         // only admin-verified donors are public
        if (GROUPS.includes(bloodGroup))
            f.bloodGroup = compat === '1' ? { $in: GROUPS.filter(k => DON[k].includes(bloodGroup)) } : bloodGroup;
        if (city && city.trim()) f.city = new RegExp(esc(city.trim()), 'i');
        if (area && area.trim()) { const r = new RegExp(esc(area.trim()), 'i'); f.$or = [{ area: r }, { pincode: r }]; }

        const rows = await Donor.find(f).sort({ updatedAt: -1 }).limit(300).lean();
        const now = Date.now(), rank = { available: 0, resting: 1, unavailable: 2 };

        let out = rows.map(d => {
            const gap = String(d.gender).toLowerCase() === 'female' ? 120 : 90;      // days between whole-blood donations
            const eligibleOn = d.lastDonation ? new Date(new Date(d.lastDonation).getTime() + gap * 864e5) : null;
            const status = d.available === false ? 'unavailable' : (eligibleOn && eligibleOn.getTime() > now ? 'resting' : 'available');
            const phone = String(d.phone || '');
            return {
                id: d._id, name: d.name, bloodGroup: d.bloodGroup, city: d.city, area: d.area, pincode: d.pincode,
                status, eligibleOn: status === 'resting' ? eligibleOn : null,
                phone: loggedIn ? phone : phone.slice(0, 2) + '******' + phone.slice(-2)   // full number only for logged-in users
            };
        });
        if (available === 'true') out = out.filter(d => d.status === 'available');
        out.sort((a, b) => rank[a.status] - rank[b.status]
            || (b.bloodGroup === bloodGroup) - (a.bloodGroup === bloodGroup) || String(a.name).localeCompare(b.name));

        res.json({ loggedIn, total: out.length, results: out.slice(0, 60) });
    } catch (e) { console.error('GET /api/donors failed:', e); res.status(500).json({ error: e.message }); }
});

module.exports = router;