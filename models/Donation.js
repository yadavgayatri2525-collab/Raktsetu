// models/Donation.js
const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
    donor: { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
    date: { type: Date, required: true },
    hospital: { type: String, trim: true, maxlength: 100 },
    units: { type: Number, min: 1, max: 2, default: 1 }
}, { timestamps: true });

module.exports = mongoose.models.Donation || mongoose.model('Donation', donationSchema);