const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Donor = require('../models/Donor');

const sign = u => jwt.sign({ id: u._id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
const age = d => (Date.now() - new Date(d)) / 31557600000;

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const b = req.body;
        for (const k of ['name', 'email', 'phone', 'password']) {
            if (!b[k]) return res.status(400).json({ error: k + ' is required' });
        }
        if (b.password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
        if (!/^[6-9]\d{9}$/.test(b.phone)) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });

        const isDonor = b.role === 'donor';
        if (isDonor) {
            for (const k of ['dob', 'gender', 'bloodGroup', 'city']) {
                if (!b[k]) return res.status(400).json({ error: k + ' is required' });
            }
            if (age(b.dob) < 18 || age(b.dob) > 65) return res.status(400).json({ error: 'Donors must be 18 to 65 years old' });
        }

        if (await User.findOne({ email: b.email.toLowerCase() })) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const user = await User.create({
            name: b.name, email: b.email, phone: b.phone,
            password: await bcrypt.hash(b.password, 10),
            role: isDonor ? 'donor' : 'user'
        });

        if (isDonor) {
            await Donor.create({
                user: user._id, name: b.name, dob: b.dob, gender: b.gender, bloodGroup: b.bloodGroup,
                phone: b.phone, email: b.email, city: b.city, area: b.area, pincode: b.pincode,
                lastDonation: b.lastDonation || undefined,
                available: b.available !== 'false' && b.available !== false
            });
        }

        res.status(201).json({ token: sign(user), user: { name: user.name, role: user.role } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password, as } = req.body;
        const user = await User.findOne({ email: (email || '').toLowerCase() });
        if (!user || !(await bcrypt.compare(password || '', user.password))) {
            return res.status(401).json({ error: 'Wrong email or password' });
        }
        if (as === 'admin' && user.role !== 'admin') {
            return res.status(403).json({ error: 'This is not an admin account' });
        }
        res.json({ token: sign(user), user: { name: user.name, role: user.role } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;