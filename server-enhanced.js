const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const stripe = require('stripe');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Database Setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Database connection error:', err);
    else console.log('Connected to SQLite database');
});

// Create Tables
db.serialize(() => {
    // Users table with enhanced fields
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        is_verified BOOLEAN DEFAULT 0,
        verification_token TEXT,
        two_factor_secret TEXT,
        two_factor_enabled BOOLEAN DEFAULT 0,
        referral_code TEXT UNIQUE,
        referred_by TEXT,
        subscription_tier TEXT DEFAULT 'free',
        subscription_expires_at DATETIME,
        profit REAL DEFAULT 0,
        win_rate REAL DEFAULT 0,
        total_trades INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Referrals table
    db.run(`CREATE TABLE IF NOT EXISTS referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_id INTEGER,
        referred_user_id INTEGER,
        commission REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referrer_id) REFERENCES users(id),
        FOREIGN KEY (referred_user_id) REFERENCES users(id)
    )`);

    // Analytics table
    db.run(`CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        user_id INTEGER,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Strategies table for social features
    db.run(`CREATE TABLE IF NOT EXISTS strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        parameters TEXT,
        is_public BOOLEAN DEFAULT 0,
        downloads INTEGER DEFAULT 0,
        rating REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Follows table
    db.run(`CREATE TABLE IF NOT EXISTS follows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        follower_id INTEGER NOT NULL,
        following_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (follower_id) REFERENCES users(id),
        FOREIGN KEY (following_id) REFERENCES users(id),
        UNIQUE(follower_id, following_id)
    )`);
});

// Email Configuration
const transporter = nodemailer.createTransport({
    service: 'SendGrid',
    auth: {
        user: process.env.SENDGRID_API_KEY,
        pass: process.env.SENDGRID_API_KEY
    }
});

// Stripe Configuration
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper Functions
const generateVerificationToken = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const generateReferralCode = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
};

const sendVerificationEmail = async (email, token) => {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
    await transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@tradingmastery.com',
        to: email,
        subject: 'Verify Your Trading Mastery Account',
        html: `
            <h1>Welcome to Trading Mastery!</h1>
            <p>Please verify your email address by clicking the link below:</p>
            <a href="${verificationUrl}">Verify Email</a>
            <p>This link will expire in 24 hours.</p>
        `
    });
};

// API Routes

// Email Verification
app.post('/api/auth/verify-email', async (req, res) => {
    const { token } = req.body;
    
    db.get('SELECT * FROM users WHERE verification_token = ?', [token], (err, user) => {
        if (err || !user) {
            return res.status(400).json({ error: 'Invalid or expired verification token' });
        }
        
        db.run('UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?', [user.id], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Email verified successfully' });
        });
    });
});

// Resend Verification Email
app.post('/api/auth/resend-verification', async (req, res) => {
    const { email } = req.body;
    
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (user.is_verified) {
            return res.status(400).json({ error: 'Email already verified' });
        }
        
        const token = generateVerificationToken();
        db.run('UPDATE users SET verification_token = ? WHERE id = ?', [token, user.id], async (err) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            try {
                await sendVerificationEmail(email, token);
                res.json({ message: 'Verification email sent' });
            } catch (error) {
                res.status(500).json({ error: 'Failed to send email' });
            }
        });
    });
});

// Two-Factor Authentication Setup
app.post('/api/auth/enable-2fa', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const secret = speakeasy.generateSecret({ length: 20 });
    
    db.run('UPDATE users SET two_factor_secret = ? WHERE id = ?', [secret.base32, userId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        qrcode.toDataURL(secret.otpauth_url, (err, qrCode) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to generate QR code' });
            }
            res.json({ secret: secret.base32, qrCode });
        });
    });
});

// Verify 2FA
app.post('/api/auth/verify-2fa', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { token } = req.body;
    
    db.get('SELECT two_factor_secret FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user || !user.two_factor_secret) {
            return res.status(400).json({ error: '2FA not set up' });
        }
        
        const verified = speakeasy.totp.verify({
            secret: user.two_factor_secret,
            encoding: 'base32',
            token: token
        });
        
        if (verified) {
            db.run('UPDATE users SET two_factor_enabled = 1 WHERE id = ?', [userId], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }
                res.json({ message: '2FA enabled successfully' });
            });
        } else {
            res.status(400).json({ error: 'Invalid token' });
        }
    });
});

// Disable 2FA
app.post('/api/auth/disable-2fa', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    db.run('UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?', [userId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: '2FA disabled successfully' });
    });
});

// Referral System
app.post('/api/referral/apply', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { referralCode } = req.body;
    
    db.get('SELECT * FROM users WHERE referral_code = ?', [referralCode], (err, referrer) => {
        if (err || !referrer) {
            return res.status(404).json({ error: 'Invalid referral code' });
        }
        
        if (referrer.id === userId) {
            return res.status(400).json({ error: 'Cannot refer yourself' });
        }
        
        db.run('UPDATE users SET referred_by = ? WHERE id = ?', [referrer.id, userId], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            // Create referral record
            db.run('INSERT INTO referrals (referrer_id, referred_user_id) VALUES (?, ?)', [referrer.id, userId], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Database error' });
                }
                res.json({ message: 'Referral applied successfully' });
            });
        });
    });
});

app.get('/api/referral/stats', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    db.all('SELECT * FROM referrals WHERE referrer_id = ?', [userId], (err, referrals) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        const totalCommission = referrals.reduce((sum, r) => sum + (r.commission || 0), 0);
        res.json({
            totalReferrals: referrals.length,
            totalCommission: totalCommission,
            referrals: referrals
        });
    });
});

// Payment Integration
app.post('/api/payment/create-checkout', authenticateToken, async (req, res) => {
    const { tier } = req.body; // 'professional' or 'elite'
    
    const prices = {
        professional: 2900, // $29.00
        elite: 9900 // $99.00
    };
    
    const price = prices[tier];
    if (!price) {
        return res.status(400).json({ error: 'Invalid subscription tier' });
    }
    
    try {
        const session = await stripeClient.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `Trading Mastery ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan`,
                    },
                    unit_amount: price,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
            metadata: {
                userId: req.user.id,
                tier: tier
            }
        });
        
        res.json({ url: session.url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const sig = req.headers['stripe-signature'];
    
    try {
        const event = stripeClient.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const { userId, tier } = session.metadata;
            
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 month subscription
            
            db.run('UPDATE users SET subscription_tier = ?, subscription_expires_at = ? WHERE id = ?', 
                [tier, expiresAt.toISOString(), userId], (err) => {
                if (err) {
                    console.error('Database error:', err);
                }
            });
        }
        
        res.json({ received: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Admin Dashboard Routes
app.get('/api/admin/users', authenticateToken, checkAdmin, (req, res) => {
    db.all('SELECT id, email, is_verified, subscription_tier, profit, win_rate, total_trades, created_at FROM users', [], (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(users);
    });
});

app.put('/api/admin/user/:id', authenticateToken, checkAdmin, (req, res) => {
    const { id } = req.params;
    const { subscription_tier, is_verified } = req.body;
    
    db.run('UPDATE users SET subscription_tier = ?, is_verified = ? WHERE id = ?', 
        [subscription_tier, is_verified, id], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'User updated successfully' });
    });
});

app.get('/api/admin/analytics', authenticateToken, checkAdmin, (req, res) => {
    db.all('SELECT event_type, COUNT(*) as count, created_at FROM analytics GROUP BY event_type ORDER BY created_at DESC LIMIT 100', [], (err, analytics) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        db.get('SELECT COUNT(*) as total_users FROM users', [], (err, userCount) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            res.json({
                analytics: analytics,
                totalUsers: userCount.total_users
            });
        });
    });
});

// Social Features - Share Strategy
app.post('/api/strategies', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { name, description, parameters, is_public } = req.body;
    
    db.run('INSERT INTO strategies (user_id, name, description, parameters, is_public) VALUES (?, ?, ?, ?, ?)',
        [userId, name, description, JSON.stringify(parameters), is_public], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ id: this.lastID, message: 'Strategy created successfully' });
    });
});

app.get('/api/strategies', (req, res) => {
    db.all('SELECT s.*, u.email FROM strategies s JOIN users u ON s.user_id = u.id WHERE s.is_public = 1 ORDER BY s.downloads DESC', [], (err, strategies) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(strategies);
    });
});

// Social Features - Follow Traders
app.post('/api/follow', authenticateToken, (req, res) => {
    const followerId = req.user.id;
    const { followingId } = req.body;
    
    if (followerId === followingId) {
        return res.status(400).json({ error: 'Cannot follow yourself' });
    }
    
    db.run('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)', [followerId, followingId], (err) => {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'Already following this user' });
            }
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'User followed successfully' });
    });
});

app.delete('/api/follow/:id', authenticateToken, (req, res) => {
    const followerId = req.user.id;
    const followingId = req.params.id;
    
    db.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'User unfollowed successfully' });
    });
});

app.get('/api/following', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    db.all(`SELECT u.id, u.email, u.profit, u.win_rate FROM follows f 
            JOIN users u ON f.following_id = u.id 
            WHERE f.follower_id = ?`, [userId], (err, following) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(following);
    });
});

// Analytics Tracking
app.post('/api/analytics/track', (req, res) => {
    const { event_type, user_id, metadata } = req.body;
    
    db.run('INSERT INTO analytics (event_type, user_id, metadata) VALUES (?, ?, ?)',
        [event_type, user_id, JSON.stringify(metadata)], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'Analytics tracked successfully' });
    });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
    db.all('SELECT id, email, profit, win_rate, total_trades FROM users ORDER BY profit DESC LIMIT 50', [], (err, leaderboard) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(leaderboard);
    });
});

// Enhanced Registration with Referral
app.post('/api/auth/register', async (req, res) => {
    const { email, password, referralCode } = req.body;
    
    // Check if user exists
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (user) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Generate verification token and referral code
        const verificationToken = generateVerificationToken();
        const userReferralCode = generateReferralCode();
        
        db.run('INSERT INTO users (email, password, verification_token, referral_code) VALUES (?, ?, ?, ?)',
            [email, hashedPassword, verificationToken, userReferralCode], async function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            
            // Handle referral if provided
            if (referralCode) {
                db.get('SELECT id FROM users WHERE referral_code = ?', [referralCode], (err, referrer) => {
                    if (!err && referrer) {
                        db.run('UPDATE users SET referred_by = ? WHERE id = ?', [referrer.id, this.lastID]);
                        db.run('INSERT INTO referrals (referrer_id, referred_user_id) VALUES (?, ?)', [referrer.id, this.lastID]);
                    }
                });
            }
            
            // Send verification email
            try {
                await sendVerificationEmail(email, verificationToken);
                res.json({ message: 'Registration successful. Please check your email to verify your account.' });
            } catch (error) {
                res.status(500).json({ error: 'Failed to send verification email' });
            }
        });
    });
});

// Enhanced Login with 2FA check
app.post('/api/auth/login', (req, res) => {
    const { email, password, twoFactorToken } = req.body;
    
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Check 2FA if enabled
        if (user.two_factor_enabled) {
            if (!twoFactorToken) {
                return res.status(200).json({ requiresTwoFactor: true });
            }
            
            const verified = speakeasy.totp.verify({
                secret: user.two_factor_secret,
                encoding: 'base32',
                token: twoFactorToken
            });
            
            if (!verified) {
                return res.status(401).json({ error: 'Invalid 2FA token' });
            }
        }
        
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, email: user.email, is_verified: user.is_verified } });
    });
});

// Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

function checkAdmin(req, res, next) {
    // For demo, allow all authenticated users as admin
    // In production, check user role in database
    next();
}

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
