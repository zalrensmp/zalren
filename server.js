const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const multer = require('multer');
require('dotenv').config();

const { connectDB, User, Staff, Forum, Leaderboard, Rules, Votes, Settings, HomePost, Slide } = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
connectDB();

// Detect writable upload dir — /tmp is always writable on Netlify Lambda, local path on dev
let UPLOAD_DIR = path.join(__dirname, 'uploads');
try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) {
    // Fallback to /tmp on read-only filesystems (Netlify, Lambda)
    UPLOAD_DIR = '/tmp/uploads';
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const upload = multer({ dest: UPLOAD_DIR });

// Setup Nodemailer SMTP Transporter
function getTransporter() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
    }
    return null;
}

// Helper to send email or fallback to logging
async function sendAuthEmail(toEmail, subject, htmlContent, consoleLogFallbackText) {

    const transporter = getTransporter();
    if (transporter) {
        try {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || `"Zalren Support" <${process.env.SMTP_USER}>`,
                to: toEmail, subject: subject, html: htmlContent
            });
            return true;
        } catch (error) { console.error('Error sending email via SMTP:', error); }
    }
    
    console.log(`[MOCKED EMAIL SENDING] to ${toEmail}\nSubject: ${subject}\n${consoleLogFallbackText}`);
    return false;
}

function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getBeautifulEmailHtml(title, description, code) {
    return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f1115; color: #ffffff; padding: 40px 20px; text-align: center;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #1a1d24; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.8); border: 1px solid #2a2e38;">
            <img src="https://images.unsplash.com/photo-1607513746994-51f730a44832?q=80&w=800&auto=format&fit=crop" alt="Minecraft Landscape" style="width: 100%; height: 200px; object-fit: cover; display: block;" />
            <div style="padding: 40px 30px;">
                <h1 style="margin: 0 0 15px; font-size: 32px; color: #4ade80; text-transform: uppercase; letter-spacing: 2px; font-weight: 800;">Zalren</h1>
                <h2 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #f8fafc;">${title}</h2>
                <p style="font-size: 16px; line-height: 1.6; color: #94a3b8; margin-bottom: 35px;">
                    ${description}
                </p>
                <div style="background: linear-gradient(135deg, #22c55e, #16a34a); padding: 20px 40px; display: inline-block; border-radius: 12px; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #ffffff; margin-bottom: 35px; box-shadow: 0 4px 15px rgba(34, 197, 94, 0.4);">
                    ${code}
                </div>
                <p style="font-size: 14px; color: #64748b; margin-top: 20px; border-top: 1px solid #2a2e38; padding-top: 25px;">
                    Welcome to the server! If you didn't request this code, you can safely ignore this email.
                </p>
            </div>
        </div>
    </div>
    `;
}

/* ================= AUTHENTICATION ENDPOINTS ================= */

app.post('/api/register', async (req, res) => {
    const { fname, lname, username, email, password } = req.body;
    if (!fname || !lname || !username || !email || !password) return res.status(400).json({ error: 'All fields are required' });

    try {
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) return res.status(400).json({ error: 'Username or Email already registered' });

        const hashedPassword = bcrypt.hashSync(password, 10);
        const verificationCode = generateCode();
        
        const isFirstUser = (await User.countDocuments()) === 0;

        const newUser = new User({
            fname, lname, username, email, password: hashedPassword,
            verification_code: verificationCode,
            role: isFirstUser ? 'owner' : 'user'
        });
        await newUser.save();

        const subject = 'Verify your Zalren Account';
        const emailHtml = getBeautifulEmailHtml('Verify Your Account', 'Thank you for registering at Zalren! Please use the verification code below to activate your account and start your journey.', verificationCode);
        const consoleFallback = `Your code is: ${verificationCode}`;
        await sendAuthEmail(email, subject, emailHtml, consoleFallback);

        res.status(201).json({ message: 'Registration successful! Verification code sent.', email });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/verify', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: 'Email and code are required' });

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.verification_code !== code) return res.status(400).json({ error: 'Invalid code' });

        user.is_verified = 1;
        user.verification_code = null;
        await user.save();
        res.status(200).json({ success: true, message: 'Account verified!' });
    } catch (err) { res.status(500).json({ error: 'Activation failed' }); }
});

app.post('/api/login', async (req, res) => {
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password) return res.status(400).json({ error: 'Username/Email and password required' });

    try {
        const user = await User.findOne({ $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }] });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        if (user.is_verified === 0) return res.status(403).json({ error: 'Account not verified yet.', email: user.email });

        if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });

        const token = crypto.randomBytes(32).toString('hex');
        user.session_token = token;
        user.session_expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await user.save();

        res.status(200).json({ success: true, message: 'Login successful!', token, user: { id: user._id, fname: user.fname, lname: user.lname, username: user.username, email: user.email, role: user.role } });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(200).json({ message: 'If email exists in our records, a code has been sent.' });

        const resetCode = generateCode();
        user.reset_code = resetCode;
        user.reset_code_expires = new Date(Date.now() + 15 * 60 * 1000);
        await user.save();

        const subject = 'Password Reset Request';
        const emailHtml = getBeautifulEmailHtml('Reset Your Password', 'We received a request to reset your password. Use the secure code below to set up a new password for your account.', resetCode);
        await sendAuthEmail(email, subject, emailHtml, `Reset code: ${resetCode}`);
        res.status(200).json({ message: 'If email exists in our records, a code has been sent.' });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

app.post('/api/reset-password', async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ error: 'All fields required' });

    try {
        const user = await User.findOne({ email });
        if (!user || user.reset_code !== code) return res.status(400).json({ error: 'Invalid code' });
        if (user.reset_code_expires < new Date()) return res.status(400).json({ error: 'Code expired' });

        user.password = bcrypt.hashSync(newPassword, 10);
        user.reset_code = null;
        user.reset_code_expires = null;
        user.is_verified = 1;
        await user.save();

        res.status(200).json({ success: true, message: 'Password reset successfully!' });
    } catch (err) { res.status(500).json({ error: 'Database error' }); }
});

/* ================= SESSION MIDDLEWARE ================= */

async function getUserFromRequest(req) {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) return null;

    const user = await User.findOne({ session_token: token });
    if (!user || !user.session_expires || user.session_expires < new Date()) return null;
    return user;
}

async function requireAuth(req, res, next) {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.currentUser = user;
    next();
}

async function requireAdmin(req, res, next) {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (user.role !== 'admin' && user.role !== 'owner' && user.role !== 'webdev') return res.status(403).json({ error: 'Admin access required' });
    req.currentUser = user;
    next();
}

app.get('/api/me', requireAuth, (req, res) => {
    const u = req.currentUser;
    res.json({ id: u._id, fname: u.fname, lname: u.lname, username: u.username, email: u.email, role: u.role, created_at: u.created_at, minecraft_username: u.minecraft_username || '', avatar_url: u.avatar_url || '' });
});

app.put('/api/profile', requireAuth, upload.single('avatar'), async (req, res) => {
    const { fname, lname, username, minecraft_username } = req.body;
    const user = req.currentUser;

    if (fname !== undefined) user.fname = String(fname).trim();
    if (lname !== undefined) user.lname = String(lname).trim();
    if (username !== undefined) user.username = String(username).trim();
    if (minecraft_username !== undefined) user.minecraft_username = String(minecraft_username).trim();
    
    if (req.file) user.avatar_url = '/uploads/' + req.file.filename;

    await user.save();
    res.json({ success: true, user: { id: user._id, fname: user.fname, lname: user.lname, username: user.username, email: user.email, minecraft_username: user.minecraft_username || '', avatar_url: user.avatar_url || '' }});
});

app.post('/api/logout', requireAuth, async (req, res) => {
    const user = req.currentUser;
    user.session_token = null;
    user.session_expires = null;
    await user.save();
    res.json({ success: true, message: 'Logged out' });
});

/* ================= PUBLIC CONTENT ENDPOINTS ================= */

app.get('/api/staff', async (req, res) => { res.json(await Staff.find().sort('order')); });
app.get('/api/forum', async (req, res) => { res.json(await Forum.find().sort({ pinned: -1, created_at: -1 })); });
app.get('/api/leaderboard', async (req, res) => { res.json(await Leaderboard.find().sort('order')); });
app.get('/api/rules', async (req, res) => { res.json(await Rules.find().sort('order')); });
app.get('/api/votes', async (req, res) => { res.json(await Votes.find().sort('order')); });
app.get('/api/settings', async (req, res) => { 
    let settings = await Settings.findOne();
    if (!settings) { settings = new Settings(); await settings.save(); }
    res.json(settings);
});

/* ================= ADMIN: STAFF ================= */

app.post('/api/admin/staff', requireAdmin, upload.single('skin'), async (req, res) => {
    const count = await Staff.countDocuments();
    const item = new Staff({
        name: req.body.name, role_title: req.body.role_title, description: req.body.description,
        minecraft_username: req.body.minecraft_username || req.body.name,
        skin_url: req.file ? '/uploads/' + req.file.filename : null,
        order: count + 1
    });
    await item.save();
    res.status(201).json(item);
});
app.put('/api/admin/staff/:id', requireAdmin, upload.single('skin'), async (req, res) => {
    const item = await Staff.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Staff member not found' });
    Object.assign(item, req.body);
    if (req.file) item.skin_url = '/uploads/' + req.file.filename;
    await item.save();
    res.json(item);
});
app.delete('/api/admin/staff/:id', requireAdmin, async (req, res) => {
    await Staff.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

/* ================= PUBLIC CONTENT ENDPOINTS (ADDITIONAL) ================= */
app.get('/api/homeposts', async (req, res) => {
    res.json(await HomePost.find().sort({ pinned: -1, created_at: -1 }));
});
app.get('/api/slides', async (req, res) => {
    res.json(await Slide.find().sort('order'));
});

/* ================= ADMIN: FORUM ================= */
app.post('/api/admin/forum', requireAdmin, upload.single('image'), async (req, res) => {
    const u = req.currentUser;
    const item = new Forum({ 
        title: req.body.title, 
        body: req.body.body, 
        author: u.username, 
        author_avatar: u.username, 
        category: req.body.category || 'Announcement',
        image_url: req.file ? '/uploads/' + req.file.filename : null
    });
    await item.save();
    res.status(201).json(item);
});
app.put('/api/admin/forum/:id', requireAdmin, upload.single('image'), async (req, res) => {
    const item = await Forum.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Post not found' });
    
    if (req.body.title) item.title = req.body.title;
    if (req.body.body) item.body = req.body.body;
    if (req.body.category) item.category = req.body.category;
    if (req.file) item.image_url = '/uploads/' + req.file.filename;
    
    await item.save();
    res.json(item);
});
app.delete('/api/admin/forum/:id', requireAdmin, async (req, res) => {
    await Forum.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});
app.post('/api/admin/forum/:id/pin', requireAdmin, async (req, res) => {
    const item = await Forum.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Post not found' });
    item.pinned = !item.pinned;
    await item.save();
    res.json({ success: true, pinned: item.pinned });
});

/* ================= ADMIN: HOME POSTS ================= */
app.post('/api/admin/homeposts', requireAdmin, upload.single('image'), async (req, res) => {
    const u = req.currentUser;
    const item = new HomePost({
        title: req.body.title,
        body: req.body.body,
        author: u.username,
        image_url: req.file ? '/uploads/' + req.file.filename : null,
        pinned: req.body.pinned === 'true'
    });
    await item.save();
    res.status(201).json(item);
});
app.put('/api/admin/homeposts/:id', requireAdmin, upload.single('image'), async (req, res) => {
    const item = await HomePost.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Post not found' });
    
    if (req.body.title) item.title = req.body.title;
    if (req.body.body) item.body = req.body.body;
    if (req.body.pinned !== undefined) item.pinned = req.body.pinned === 'true';
    if (req.file) item.image_url = '/uploads/' + req.file.filename;
    
    await item.save();
    res.json(item);
});
app.delete('/api/admin/homeposts/:id', requireAdmin, async (req, res) => {
    await HomePost.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

/* ================= ADMIN: SLIDES ================= */
app.post('/api/admin/slides', requireAdmin, upload.single('image'), async (req, res) => {
    const count = await Slide.countDocuments();
    const item = new Slide({
        title: req.body.title,
        description: req.body.description,
        image_url: req.file ? '/uploads/' + req.file.filename : '',
        order: count + 1
    });
    await item.save();
    res.status(201).json(item);
});
app.put('/api/admin/slides/:id', requireAdmin, upload.single('image'), async (req, res) => {
    const item = await Slide.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Slide not found' });
    
    if (req.body.title) item.title = req.body.title;
    if (req.body.description) item.description = req.body.description;
    if (req.body.order !== undefined) item.order = parseInt(req.body.order);
    if (req.file) item.image_url = '/uploads/' + req.file.filename;
    
    await item.save();
    res.json(item);
});
app.delete('/api/admin/slides/:id', requireAdmin, async (req, res) => {
    await Slide.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

/* ================= ADMIN: SETTINGS ================= */
app.put('/api/admin/settings', requireAdmin, upload.single('banner'), async (req, res) => {
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();
    
    if (req.body.server_ip) settings.server_ip = req.body.server_ip;
    if (req.body.server_version) settings.server_version = req.body.server_version;
    if (req.file) settings.hero_banner_url = '/uploads/' + req.file.filename;
    
    await settings.save();
    res.json(settings);
});

/* ================= ADMIN: OTHERS ================= */
app.post('/api/admin/leaderboard', requireAdmin, async (req, res) => {
    const count = await Leaderboard.countDocuments();
    const item = new Leaderboard({ player: req.body.player, score: req.body.score, category: req.body.category, order: count + 1 });
    await item.save();
    res.status(201).json(item);
});
app.put('/api/admin/leaderboard/:id', requireAdmin, async (req, res) => {
    const item = await Leaderboard.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(item);
});
app.delete('/api/admin/leaderboard/:id', requireAdmin, async (req, res) => {
    await Leaderboard.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    const total_users = await User.countDocuments();
    const verified_users = await User.countDocuments({ is_verified: 1 });
    const admins = await User.countDocuments({ role: { $in: ['admin', 'owner'] } });
    const staff_count = await Staff.countDocuments();
    const forum_count = await Forum.countDocuments();
    res.json({ total_users, verified_users, admins, staff_count, forum_count, leaderboard_count: await Leaderboard.countDocuments(), rules_count: await Rules.countDocuments(), votes_count: await Votes.countDocuments() });
});

// Admin Users Endpoints (simplified)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const users = await User.find().select('-password -session_token');
    res.json(users);
});
app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Not found' });
    
    // Safety check: Prevent modifying a webdev account or assigning the webdev role via API
    if (target.role === 'webdev') {
        return res.status(403).json({ error: 'The Web Dev role cannot be modified via the web interface.' });
    }
    if (req.body.role === 'webdev') {
        return res.status(403).json({ error: 'Cannot assign Web Dev role via the web interface.' });
    }
    
    target.role = req.body.role;
    await target.save();
    res.json({ success: true, role: target.role });
});
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Not found' });
    
    // Safety check: Prevent deleting a webdev account via API
    if (target.role === 'webdev') {
        return res.status(403).json({ error: 'The Web Dev role cannot be deleted.' });
    }
    
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

app.use((err, req, res, next) => { console.error(err.stack); res.status(500).send('Something went wrong!'); });
module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => { console.log(`Server running on http://localhost:${PORT}`); });
}
