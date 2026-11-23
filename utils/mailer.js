/* Email through Brevo's HTTPS API. Render's free plan blocks SMTP ports, but HTTPS always works.
   Env vars:  BREVO_API_KEY   (Brevo > SMTP & API > API keys)
              MAIL_FROM       (a sender email verified in Brevo)
              APP_URL         (e.g. https://raktsetu-uzjn.onrender.com)                              */
const Donor = require('../models/Donor');

// recipient group -> donor groups that can give to it
const COMPAT = {
    'A+': ['A+', 'A-', 'O+', 'O-'], 'A-': ['A-', 'O-'],
    'B+': ['B+', 'B-', 'O+', 'O-'], 'B-': ['B-', 'O-'],
    'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], 'AB-': ['A-', 'B-', 'AB-', 'O-'],
    'O+': ['O+', 'O-'], 'O-': ['O-']
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const APP = () => (process.env.APP_URL || '').replace(/\/$/, '');

async function sendMail({ to, subject, html }) {
    if (!process.env.BREVO_API_KEY || !process.env.MAIL_FROM) { console.log('[mail skipped - set BREVO_API_KEY and MAIL_FROM]', subject); return false; }
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { name: 'RaktSetu', email: process.env.MAIL_FROM }, to: [{ email: to }], subject, htmlContent: html })
    });
    if (!r.ok) throw new Error('Mail API ' + r.status + ' ' + (await r.text()));
    return true;
}

const wrap = (title, body) => `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
<div style="background:#0E0F11;color:#fff;padding:14px 20px;font-size:20px;font-weight:700">Rakt<span style="color:#E5202F">Setu</span></div>
<div style="padding:22px"><h2 style="margin:0 0 12px;color:#B00C22">${title}</h2>${body}</div></div>`;

/* 1) Critical / Urgent request posted -> email compatible donors in that area */
async function notifyDonors(r) {
    if (!['Critical', 'Urgent'].includes(r.level)) return { sent: 0 };
    const groups = COMPAT[r.bloodGroup]; if (!groups) return { sent: 0 };
    const words = String(r.location || r.city || '').split(/[,\s]+/).filter(w => w.length > 2).map(rx);
    if (!words.length) return { sent: 0 };
    const place = new RegExp(words.join('|'), 'i'), since = new Date(Date.now() - 90 * 864e5);   // 90-day gap
    const donors = await Donor.find({
        bloodGroup: { $in: groups }, verified: true, available: { $ne: false }, email: { $exists: true, $ne: '' },
        $and: [{ $or: [{ city: place }, { area: place }] }, { $or: [{ lastDonation: null }, { lastDonation: { $exists: false } }, { lastDonation: { $lte: since } }] }]
    }).select('name email').limit(200);
    const by = r.neededOn ? new Date(r.neededOn).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'as soon as possible';
    const html = d => wrap(`${esc(r.level)}: ${esc(r.bloodGroup)} blood needed`,
        `<p>Hi ${esc(String(d.name).split(' ')[0])}, a patient near you needs blood and your group is compatible.</p>
         <p><b>Blood group:</b> ${esc(r.bloodGroup)} (${esc(r.units || 1)} unit)<br><b>Hospital:</b> ${esc(r.hospital)}${r.location ? ', ' + esc(r.location) : ''}<br><b>Needed by:</b> ${by}</p>
         <p><a href="${APP()}/dashboard.html" style="background:#D6112B;color:#fff;padding:11px 20px;border-radius:24px;text-decoration:none;font-weight:700">Open my dashboard &amp; accept</a></p>
         <p style="color:#777;font-size:12px">You get this because you are a verified RaktSetu donor marked available. Turn availability off in your dashboard to stop alerts.</p>`);
    let sent = 0;
    for (let i = 0; i < donors.length; i += 10) {
        const res = await Promise.allSettled(donors.slice(i, i + 10).map(d =>
            sendMail({ to: d.email, subject: `${r.level}: ${r.bloodGroup} blood needed at ${r.hospital}`, html: html(d) })));
        res.forEach(x => { if (x.status === 'fulfilled' && x.value) sent++; else if (x.status === 'rejected') console.error(x.reason.message); });
    }
    return { sent, matched: donors.length };
}

/* 2) Donor accepted -> tell the patient's family */
async function notifyRequester(to, r, donor) {
    if (!to) return false;
    return sendMail({ to, subject: `A donor is ready to help: ${r.bloodGroup} for ${r.patient}`,
        html: wrap('A donor is ready to help',
            `<p>Good news. <b>${esc(donor.name)}</b> (${esc(donor.bloodGroup)}) from ${esc(donor.city || '')} accepted your request for <b>${esc(r.patient)}</b>.</p>
             <p><b>Phone:</b> <a href="tel:+91${esc(donor.phone)}">${esc(donor.phone)}</a></p>
             <p>Please call the donor now and confirm the hospital details.</p>
             <p><a href="${APP()}/dashboard.html" style="background:#D6112B;color:#fff;padding:11px 20px;border-radius:24px;text-decoration:none;font-weight:700">See all donors who accepted</a></p>`) });
}

module.exports = { COMPAT, sendMail, notifyDonors, notifyRequester };
