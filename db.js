const mongoose = require('mongoose');

// Connect to MongoDB
const connectDB = async () => {
    if (mongoose.connection.readyState >= 1) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');
        
        // Seed default slides if none exist
        const SlideModel = mongoose.models.Slide || mongoose.model('Slide', SlideSchema);
        const count = await SlideModel.countDocuments();
        if (count === 0) {
            console.log('Seeding default slides...');
            await SlideModel.insertMany([
                {
                    title: 'Welcome to Zalren',
                    description: 'Your brand new premium Minecraft community is waiting! Gather resources, build kingdoms, and command the realms.',
                    image_url: 'slide1.png',
                    order: 1
                },
                {
                    title: 'Epic Arenas & Custom PvP',
                    description: 'Engage in fair, custom PvP combat matches. Prove your combat strength and secure rare server rank loot keys.',
                    image_url: 'slide2.png',
                    order: 2
                },
                {
                    title: 'Interactive Community Discord',
                    description: 'Join our Discord community channel to coordinate bases, view developer updates, and check events calendar.',
                    image_url: 'slide3.png',
                    order: 3
                }
            ]);
            console.log('Default slides seeded successfully.');
        }
    } catch (err) {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    }
};

const UserSchema = new mongoose.Schema({
    fname: { type: String, required: true },
    lname: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    is_verified: { type: Number, default: 0 },
    verification_code: { type: String },
    reset_code: { type: String },
    reset_code_expires: { type: Date },
    role: { type: String, default: 'user' },
    session_token: { type: String },
    session_expires: { type: Date },
    minecraft_username: { type: String },
    avatar_url: { type: String },
    created_at: { type: Date, default: Date.now }
});

const StaffSchema = new mongoose.Schema({
    name: { type: String, required: true },
    role_title: { type: String, required: true },
    description: { type: String },
    minecraft_username: { type: String },
    skin_url: { type: String },
    order: { type: Number },
    created_at: { type: Date, default: Date.now }
});

const ForumSchema = new mongoose.Schema({
    title: { type: String, required: true },
    body: { type: String, required: true },
    author: { type: String },
    author_avatar: { type: String },
    image_url: { type: String },
    category: { type: String, default: 'Announcement' },
    pinned: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
});

const HomePostSchema = new mongoose.Schema({
    title: { type: String, required: true },
    body: { type: String, required: true },
    image_url: { type: String },
    author: { type: String },
    pinned: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
});

const SlideSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    image_url: { type: String, required: true },
    order: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
});

const LeaderboardSchema = new mongoose.Schema({
    player: { type: String, required: true },
    score: { type: Number, default: 0 },
    category: { type: String, default: 'Kills' },
    order: { type: Number },
    created_at: { type: Date, default: Date.now }
});

const RulesSchema = new mongoose.Schema({
    rule: { type: String },
    order: { type: Number }
});

const VotesSchema = new mongoose.Schema({
    site: { type: String },
    url: { type: String },
    order: { type: Number }
});

const SettingsSchema = new mongoose.Schema({
    server_ip: { type: String, default: 'play.zalrensmp.fun' },
    server_version: { type: String, default: '1.20.4' },
    hero_banner_url: { type: String }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Staff = mongoose.models.Staff || mongoose.model('Staff', StaffSchema);
const Forum = mongoose.models.Forum || mongoose.model('Forum', ForumSchema);
const HomePost = mongoose.models.HomePost || mongoose.model('HomePost', HomePostSchema);
const Slide = mongoose.models.Slide || mongoose.model('Slide', SlideSchema);
const Leaderboard = mongoose.models.Leaderboard || mongoose.model('Leaderboard', LeaderboardSchema);
const Rules = mongoose.models.Rules || mongoose.model('Rules', RulesSchema);
const Votes = mongoose.models.Votes || mongoose.model('Votes', VotesSchema);
const Settings = mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);

module.exports = {
    connectDB,
    User,
    Staff,
    Forum,
    HomePost,
    Slide,
    Leaderboard,
    Rules,
    Votes,
    Settings
};
