const mongoose = require('mongoose');
// One questionnaire per user (re-submitting updates the same document)
module.exports = mongoose.model('DonorForm', new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },   // all answers from donor-form.html
    deferralFlags: [String],                                        // answers that may cause a temporary deferral
    submittedAt: { type: Date, default: Date.now }
}, { timestamps: true }));
