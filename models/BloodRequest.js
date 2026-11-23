// models/BloodRequest.js
const mongoose = require('mongoose');

const bloodRequestSchema = new mongoose.Schema({
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },          // empty if posted without logging in
    patient: { type: String, required: true, trim: true },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'], required: true },
    hospital: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    neededOn: { type: Date, required: true },
    units: { type: Number, min: 1, max: 10, default: 1 },
    level: { type: String, enum: ['Normal', 'Urgent', 'Critical'], default: 'Normal' },
    contact: { type: String, required: true },
    email: { type: String, trim: true, lowercase: true },                       // optional: where to send 'a donor accepted' mail
    message: { type: String, maxlength: 300 },
    status: { type: String, enum: ['Pending', 'Accepted', 'Completed', 'Rejected'], default: 'Pending' }
}, { timestamps: true });

// Automatic email alerts: runs once when a NEW request is saved (only Critical / Urgent send emails).
// This means routes/requests.js needs no change.
const { notifyDonors } = require('../utils/mailer');
bloodRequestSchema.pre('save', function () { this.$locals.wasNew = this.isNew; });
bloodRequestSchema.post('save', function (doc) {
    if (!doc.$locals.wasNew) return;
    notifyDonors(doc).then(r => console.log('Alert emails:', JSON.stringify(r))).catch(e => console.error('Alert email failed:', e.message));
});

module.exports = mongoose.models.BloodRequest || mongoose.model('BloodRequest', bloodRequestSchema);