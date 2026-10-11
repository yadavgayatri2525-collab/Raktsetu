const bcrypt = require('bcryptjs');
const User = require('../models/User');

module.exports = async () => {
    const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
    if (!email) return;
    if (await User.findOne({ email })) return console.log('Admin already exists');
    await User.create({
        name: process.env.ADMIN_NAME || 'Admin',
        email,
        phone: process.env.ADMIN_PHONE || '9000000000',
        role: 'admin',
        password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10)
    });
    console.log('Admin created: ' + email);
};