// Usage (in the project root):
//   node resetAdmin.js admin@example.com MyNewPassword123
// Sets (or creates) an admin account with that email and password.
// It uses MONGO_URI from your .env, so make sure it is the SAME database your live site uses.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

(async () => {
    const [email, password] = process.argv.slice(2);
    if (!email || !password || password.length < 6) {
        console.log('Usage: node resetAdmin.js <email> <password (6+ characters)>');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database host:', new URL(process.env.MONGO_URI.replace('mongodb+srv://', 'https://').replace('mongodb://', 'https://')).host);
    const hash = await bcrypt.hash(password, 10);
    const e = email.toLowerCase();
    const u = await User.findOne({ email: e });
    if (u) {
        u.password = hash; u.role = 'admin'; await u.save();
        console.log('Updated existing user as admin:', e);
    } else {
        await User.create({ name: 'Admin', email: e, phone: '9999999999', password: hash, role: 'admin' });
        console.log('Created new admin:', e);
    }
    await mongoose.disconnect();
})().catch(err => { console.error('Failed:', err.message); process.exit(1); });
