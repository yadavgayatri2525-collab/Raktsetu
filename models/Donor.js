const mongoose = require('mongoose');

const donorSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: String,
    dob: Date,
    gender: String,
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'], required: true },
    phone: String,
    email: String,
    city: String,
    area: String,
    pincode: String,
    lastDonation: Date,
    available: { type: Boolean, default: true },
    verified: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Donor', donorSchema);