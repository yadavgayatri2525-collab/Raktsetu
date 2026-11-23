const mongoose = require('mongoose');
// A donor saying "I can help" on a blood request
const s = new mongoose.Schema({
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', required: true },
    donor:   { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });
s.index({ request: 1, donor: 1 }, { unique: true });
module.exports = mongoose.model('Acceptance', s);
