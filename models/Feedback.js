const mongoose = require('mongoose');
module.exports = mongoose.model('Feedback', new mongoose.Schema({
    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role:    String,                                                           // donor / user
    type:    { type: String, enum: ['doctor', 'donor', 'receiver'], required: true },
    about:   { type: String, maxlength: 80 },                                  // optional name
    rating:  { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, maxlength: 1000, required: true }
}, { timestamps: true }));
