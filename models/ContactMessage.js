// models/ContactMessage.js
const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    topic: { type: String, enum: ['General', 'Account or login', 'Donor verification', 'Report a problem', 'Feedback'], default: 'General' },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    read: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.models.ContactMessage || mongoose.model('ContactMessage', contactMessageSchema);