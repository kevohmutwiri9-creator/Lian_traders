const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const axios = require('axios');
const nodemailer = require('nodemailer');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const stripe = require('stripe');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'lian-traders-secret-key';

// Global bot status
let botStatus = {
  active: false,
  strategy: 'none',
  symbol: 'R_10',
  trades_today: 0,
  profit_today: 0
};

// Binary/Deriv API Configuration
const DERIV_APP_ID = 70590;
const DERIV_API_URL = 'https://api.derivws.com';

// Middleware
app.use(cors({
  origin: [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'https://lian-traders.netlify.app',
    'https://www.lian-traders.com'
  ],
  credentials: true
}));
app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

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

// Database setup
const db = new sqlite3.Database('./trading.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database');
    initDatabase();
  }
});

function initDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      balance REAL DEFAULT 10000.00,
      demo_balance REAL DEFAULT 100000.00,
      is_demo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Trades table
    db.run(`CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      side TEXT NOT NULL,
      amount REAL NOT NULL,
      entry_price REAL NOT NULL,
      exit_price REAL,
      profit_loss REAL,
      status TEXT DEFAULT 'open',
      is_demo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // Price history table
    db.run(`CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      price REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log('Database tables initialized');
  });
}

// Market data simulation
const symbols = {
  'EUR/USD': { price: 1.0845, volatility: 0.0002 },
  'GBP/USD': { price: 1.2678, volatility: 0.0003 },
  'USD/JPY': { price: 149.32, volatility: 0.05 },
  'USD/CHF': { price: 0.8845, volatility: 0.0002 },
  'AUD/USD': { price: 0.6578, volatility: 0.0003 },
  'USD/CAD': { price: 1.3542, volatility: 0.0003 },
  'BTC/USD': { price: 43567.89, volatility: 50.00 },
  'ETH/USD': { price: 2289.45, volatility: 5.00 },
  'XAU/USD': { price: 2034.56, volatility: 2.00 }
};

// WebSocket server for real-time prices
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');
  
  const interval = setInterval(() => {
    const updates = {};
    for (const [symbol, data] of Object.entries(symbols)) {
      const change = (Math.random() - 0.5) * data.volatility;
      data.price += change;
      updates[symbol] = {
        price: data.price,
        change: change,
        changePercent: (change / data.price * 100).toFixed(4)
      };
    }
    
    ws.send(JSON.stringify({
      type: 'price_update',
      data: updates
    }));
  }, 1000);

  ws.on('close', () => {
    clearInterval(interval);
    console.log('Client disconnected');
  });
});

// JWT middleware
const authenticateToken = (req, res, next) => {
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
};

// Helper Functions
const generateVerificationToken = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

const generateReferralCode = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
};

const sendVerificationEmail = async (email, token) => {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:8000'}/verify-email?token=${token}`;
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

// Email Verification Routes
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

// Two-Factor Authentication Routes
app.post('/api/auth/enable-2fa', authenticateToken, (req, res) => {
    const userId = req.user.userId;
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

app.post('/api/auth/verify-2fa', authenticateToken, (req, res) => {
    const userId = req.user.userId;
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

app.post('/api/auth/disable-2fa', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    
    db.run('UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL WHERE id = ?', [userId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: '2FA disabled successfully' });
    });
});

// Referral System Routes
app.post('/api/referral/apply', authenticateToken, (req, res) => {
    const userId = req.user.userId;
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
    const userId = req.user.userId;
    
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

// Payment Integration Routes
app.post('/api/payment/create-checkout', authenticateToken, async (req, res) => {
    const { tier } = req.body;
    
    const prices = {
        professional: 2900,
        elite: 9900
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
            success_url: `${process.env.FRONTEND_URL || 'http://localhost:8000'}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:8000'}/payment/cancel`,
            metadata: {
                userId: req.user.userId,
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
            expiresAt.setMonth(expiresAt.getMonth() + 1);
            
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

// Social Features Routes
app.post('/api/strategies', authenticateToken, (req, res) => {
    const userId = req.user.userId;
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

app.post('/api/follow', authenticateToken, (req, res) => {
    const followerId = req.user.userId;
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
    const followerId = req.user.userId;
    const followingId = req.params.id;
    
    db.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'User unfollowed successfully' });
    });
});

app.get('/api/following', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    
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

// Leaderboard Route
app.get('/api/leaderboard', (req, res) => {
    db.all('SELECT id, email, profit, win_rate, total_trades FROM users ORDER BY profit DESC LIMIT 50', [], (err, leaderboard) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(leaderboard);
    });
});

// Admin Dashboard Routes
app.get('/api/admin/users', authenticateToken, (req, res) => {
    db.all('SELECT id, email, is_verified, subscription_tier, profit, win_rate, total_trades, created_at FROM users', [], (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(users);
    });
});

app.put('/api/admin/user/:id', authenticateToken, (req, res) => {
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

app.get('/api/admin/analytics', authenticateToken, (req, res) => {
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

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, referralCode } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    const verificationToken = generateVerificationToken();
    const userReferralCode = generateReferralCode();
    
    db.run(
      'INSERT INTO users (id, email, password, name, verification_token, referral_code) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, email, hashedPassword, name, verificationToken, userReferralCode],
      async function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already exists' });
          }
          return res.status(500).json({ error: 'Database error' });
        }
        
        // Handle referral if provided
        if (referralCode) {
          db.get('SELECT id FROM users WHERE referral_code = ?', [referralCode], (err, referrer) => {
            if (!err && referrer) {
              db.run('UPDATE users SET referred_by = ? WHERE id = ?', [referrer.id, userId]);
              db.run('INSERT INTO referrals (referrer_id, referred_user_id) VALUES (?, ?)', [referrer.id, userId]);
            }
          });
        }
        
        // Send verification email
        try {
          await sendVerificationEmail(email, verificationToken);
        } catch (error) {
          console.error('Failed to send verification email:', error);
        }
        
        const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, userId, email, name, message: 'Registration successful. Please check your email to verify your account.', referralCode: userReferralCode });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password, twoFactorToken } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!user) {
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

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      userId: user.id,
      email: user.email,
      name: user.name,
      balance: user.balance,
      demo_balance: user.demo_balance,
      is_demo: user.is_demo,
      is_verified: user.is_verified,
      referral_code: user.referral_code
    });
  });
});

// User routes
app.get('/api/user/profile', authenticateToken, (req, res) => {
  db.get('SELECT id, email, name, balance, demo_balance, is_demo, created_at FROM users WHERE id = ?', 
    [req.user.userId], 
    (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    }
  );
});

app.post('/api/user/switch-mode', authenticateToken, (req, res) => {
  const { is_demo } = req.body;
  
  db.run('UPDATE users SET is_demo = ? WHERE id = ?', [is_demo ? 1 : 0, req.user.userId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to switch mode' });
    }
    res.json({ message: is_demo ? 'Switched to demo mode' : 'Switched to real mode', is_demo });
  });
});

// Trading routes
app.get('/api/market/prices', (req, res) => {
  const prices = {};
  for (const [symbol, data] of Object.entries(symbols)) {
    prices[symbol] = {
      price: data.price,
      bid: data.price - 0.0001,
      ask: data.price + 0.0001,
      change: (Math.random() - 0.5) * data.volatility,
      changePercent: ((Math.random() - 0.5) * 0.5).toFixed(2)
    };
  }
  res.json(prices);
});

app.post('/api/trades/open', authenticateToken, (req, res) => {
  const { symbol, type, side, amount, is_demo } = req.body;
  
  if (!symbol || !side || !amount) {
    return res.status(400).json({ error: 'Missing trade parameters' });
  }

  const symbolData = symbols[symbol];
  if (!symbolData) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  const tradeId = uuidv4();
  const entryPrice = side === 'buy' ? symbolData.ask : symbolData.bid;

  db.get('SELECT balance, demo_balance FROM users WHERE id = ?', [req.user.userId], (err, user) => {
    if (err || !user) {
      return res.status(500).json({ error: 'User not found' });
    }

    const balance = is_demo ? user.demo_balance : user.balance;
    if (amount > balance) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    db.run(
      'INSERT INTO trades (id, user_id, symbol, type, side, amount, entry_price, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [tradeId, req.user.userId, symbol, type || 'market', side, amount, entryPrice, is_demo ? 1 : 0],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to open trade' });
        }

        const newBalance = balance - amount;
        const balanceField = is_demo ? 'demo_balance' : 'balance';
        db.run(`UPDATE users SET ${balanceField} = ? WHERE id = ?`, [newBalance, req.user.userId]);

        res.json({
          tradeId,
          symbol,
          side,
          amount,
          entryPrice,
          status: 'open',
          message: 'Trade opened successfully'
        });
      }
    );
  });
});

app.post('/api/trades/close', authenticateToken, (req, res) => {
  const { tradeId } = req.body;

  db.get('SELECT * FROM trades WHERE id = ? AND user_id = ? AND status = "open"', 
    [tradeId, req.user.userId], 
    (err, trade) => {
      if (err || !trade) {
        return res.status(404).json({ error: 'Trade not found or already closed' });
      }

      const symbolData = symbols[trade.symbol];
      const exitPrice = trade.side === 'buy' ? symbolData.bid : symbolData.ask;
      
      let profitLoss = 0;
      if (trade.side === 'buy') {
        profitLoss = (exitPrice - trade.entry_price) / trade.entry_price * trade.amount;
      } else {
        profitLoss = (trade.entry_price - exitPrice) / trade.entry_price * trade.amount;
      }

      const balanceField = trade.is_demo ? 'demo_balance' : 'balance';
      const returnAmount = trade.amount + profitLoss;

      db.run(
        'UPDATE trades SET status = "closed", exit_price = ?, profit_loss = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [exitPrice, profitLoss, tradeId],
        function(err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to close trade' });
          }

          db.run(`UPDATE users SET ${balanceField} = ${balanceField} + ? WHERE id = ?`, [returnAmount, req.user.userId]);

          res.json({
            tradeId,
            exitPrice,
            profitLoss,
            returnAmount,
            message: profitLoss >= 0 ? 'Trade closed with profit' : 'Trade closed with loss'
          });
        }
      );
    }
  );
});

app.get('/api/trades/open', authenticateToken, (req, res) => {
  db.all('SELECT * FROM trades WHERE user_id = ? AND status = "open" ORDER BY created_at DESC', 
    [req.user.userId], 
    (err, trades) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Calculate current P/L for each trade
      const tradesWithPL = trades.map(trade => {
        const symbolData = symbols[trade.symbol];
        const currentPrice = trade.side === 'buy' ? symbolData.bid : symbolData.ask;
        let currentPL = 0;
        
        if (trade.side === 'buy') {
          currentPL = (currentPrice - trade.entry_price) / trade.entry_price * trade.amount;
        } else {
          currentPL = (trade.entry_price - currentPrice) / trade.entry_price * trade.amount;
        }
        
        return { ...trade, current_price: currentPrice, current_pl: currentPL };
      });
      
      res.json(tradesWithPL);
    }
  );
});

app.get('/api/trades/history', authenticateToken, (req, res) => {
  db.all('SELECT * FROM trades WHERE user_id = ? AND status = "closed" ORDER BY closed_at DESC LIMIT 50', 
    [req.user.userId], 
    (err, trades) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(trades);
    }
  );
});

// Binary/Deriv API proxy endpoints
app.post('/api/deriv/authorize', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    const response = await axios.post(`${DERIV_API_URL}/authorize`, {
      authorize: token,
      app_id: DERIV_APP_ID
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Deriv API error', details: error.message });
  }
});

app.post('/api/deriv/balance', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    const response = await axios.post(`${DERIV_API_URL}/balance`, {
      balance: 1,
      app_id: DERIV_APP_ID
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Deriv API error', details: error.message });
  }
});

app.post('/api/deriv/portfolio', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    const response = await axios.post(`${DERIV_API_URL}/portfolio`, {
      portfolio: 1,
      app_id: DERIV_APP_ID
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Deriv API error', details: error.message });
  }
});

app.post('/api/deriv/buy', authenticateToken, async (req, res) => {
  try {
    const { token, contract_type, symbol, duration, duration_unit, amount, barrier, basis } = req.body;
    const response = await axios.post(`${DERIV_API_URL}/buy`, {
      buy: 1,
      parameters: {
        contract_type,
        symbol,
        duration,
        duration_unit,
        amount,
        barrier,
        basis: basis || 'stake'
      },
      app_id: DERIV_APP_ID
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Deriv API error', details: error.message });
  }
});

app.post('/api/deriv/sell', authenticateToken, async (req, res) => {
  try {
    const { token, contract_id, price } = req.body;
    const response = await axios.post(`${DERIV_API_URL}/sell`, {
      sell: contract_id,
      price: price || 0,
      app_id: DERIV_APP_ID
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Deriv API error', details: error.message });
  }
});

// WebSocket proxy for real-time data
app.get('/api/deriv/ws', (req, res) => {
  res.json({
    ws_url: `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`,
    app_id: DERIV_APP_ID
  });
});

app.get('/api/bot/status', authenticateToken, (req, res) => {
  res.json(botStatus);
});

app.post('/api/bot/start', authenticateToken, (req, res) => {
  const { strategy, symbol } = req.body;
  botStatus = {
    active: true,
    strategy: strategy || 'trend_following',
    symbol: symbol || 'R_10',
    trades_today: 0,
    profit_today: 0,
    started_at: new Date().toISOString()
  };
  res.json({ message: 'Trading bot started', status: botStatus });
});

app.post('/api/bot/stop', authenticateToken, (req, res) => {
  botStatus.active = false;
  res.json({ message: 'Trading bot stopped', status: botStatus });
});

// Binary/Deriv Bot Strategies
const botStrategies = {
  'trend_following': {
    name: 'Trend Following',
    description: 'Follows market trends using moving averages',
    parameters: { fast_ma: 5, slow_ma: 20, risk_percentage: 2 }
  },
  'mean_reversion': {
    name: 'Mean Reversion',
    description: 'Trades against extreme price movements',
    parameters: { lookback_period: 20, deviation_threshold: 2, risk_percentage: 1.5 }
  },
  'breakout': {
    name: 'Breakout Trading',
    description: 'Trades breakouts from consolidation patterns',
    parameters: { consolidation_period: 20, breakout_threshold: 0.5, risk_percentage: 3 }
  },
  'scalping': {
    name: 'Scalping',
    description: 'Quick trades for small profits',
    parameters: { tick_interval: 5, profit_target: 0.5, stop_loss: 0.3 }
  }
};

app.get('/api/bot/strategies', authenticateToken, (req, res) => {
  res.json(botStrategies);
});

app.post('/api/bot/configure', authenticateToken, (req, res) => {
  const { strategy, parameters, symbol, stake_amount } = req.body;
  
  if (!botStrategies[strategy]) {
    return res.status(400).json({ error: 'Invalid strategy' });
  }

  botStatus = {
    active: false,
    strategy,
    parameters: { ...botStrategies[strategy].parameters, ...parameters },
    symbol: symbol || 'R_10',
    stake_amount: stake_amount || 1,
    configured_at: new Date().toISOString()
  };

  res.json({ message: 'Bot configured successfully', config: botStatus });
});

// Market Analysis endpoints
app.get('/api/analysis/technical', authenticateToken, async (req, res) => {
  const { symbol, timeframe } = req.query;
  
  try {
    // Get historical data from Deriv API
    const response = await axios.post(`${DERIV_API_URL}/ticks_history`, {
      ticks_history: symbol || 'R_10',
      count: 100,
      end: 'latest',
      style: 'candles',
      granularity: timeframe || 60,
      app_id: DERIV_APP_ID
    });

    const candles = response.data.candles || [];
    
    // Calculate technical indicators
    const analysis = {
      symbol: symbol || 'R_10',
      timeframe: timeframe || 60,
      indicators: {
        sma_20: calculateSMA(candles, 20),
        rsi: calculateRSI(candles, 14),
        macd: calculateMACD(candles),
        bollinger_bands: calculateBollingerBands(candles, 20)
      },
      signals: generateSignals(candles)
    };

    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: 'Analysis error', details: error.message });
  }
});

// Helper functions for technical analysis
function calculateSMA(candles, period) {
  if (candles.length < period) return null;
  const closes = candles.slice(-period).map(c => c.close);
  return closes.reduce((sum, price) => sum + price, 0) / period;
}

function calculateRSI(candles, period) {
  if (candles.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = candles[candles.length - i].close - candles[candles.length - i - 1].close;
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgGain / avgLoss;
  
  return 100 - (100 / (1 + rs));
}

function calculateMACD(candles) {
  if (candles.length < 26) return null;
  
  const ema12 = calculateEMA(candles, 12);
  const ema26 = calculateEMA(candles, 26);
  const macd = ema12 - ema26;
  const signal = calculateEMA([...candles.slice(-9).map(() => macd)], 9);
  
  return { macd, signal, histogram: macd - signal };
}

function calculateEMA(candles, period) {
  const closes = candles.map(c => c.close);
  const multiplier = 2 / (period + 1);
  let ema = closes[0];
  
  for (let i = 1; i < closes.length; i++) {
    ema = (closes[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

function calculateBollingerBands(candles, period) {
  if (candles.length < period) return null;
  
  const closes = candles.slice(-period).map(c => c.close);
  const sma = closes.reduce((sum, price) => sum + price, 0) / period;
  const variance = closes.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: sma + (2 * stdDev),
    middle: sma,
    lower: sma - (2 * stdDev)
  };
}

function generateSignals(candles) {
  const signals = [];
  
  if (candles.length < 20) return signals;
  
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2];
  const sma20 = calculateSMA(candles, 20);
  
  // Simple trend signals
  if (latest.close > sma20 && previous.close <= sma20) {
    signals.push({ type: 'BUY', reason: 'Price crossed above SMA20', strength: 'medium' });
  } else if (latest.close < sma20 && previous.close >= sma20) {
    signals.push({ type: 'SELL', reason: 'Price crossed below SMA20', strength: 'medium' });
  }
  
  return signals;
}

// Copy trading routes
const topTraders = [
  { id: 'trader1', name: 'CryptoMaster', return_7d: 24.5, risk: 'Medium', copiers: 3200, win_rate: 78 },
  { id: 'trader2', name: 'ForexPro', return_7d: 18.9, risk: 'Low', copiers: 2100, win_rate: 82 },
  { id: 'trader3', name: 'DayTrader99', return_7d: 15.6, risk: 'High', copiers: 1800, win_rate: 71 },
  { id: 'trader4', name: 'SwingKing', return_7d: 12.3, risk: 'Medium', copiers: 1500, win_rate: 75 },
  { id: 'trader5', name: 'ScalpMaster', return_7d: 9.8, risk: 'High', copiers: 980, win_rate: 68 }
];

app.get('/api/copy-trading/top-traders', (req, res) => {
  res.json(topTraders);
});

app.post('/api/copy-trading/copy', authenticateToken, (req, res) => {
  const { traderId, amount } = req.body;
  res.json({ message: `Now copying trader ${traderId} with ${amount}`, traderId, amount });
});

// Trade History and Performance
app.get('/api/trades/history', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { limit = 50, offset = 0 } = req.query;
  
  db.all(`
    SELECT * FROM trades 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `, [userId, limit, offset], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

app.get('/api/trades/performance', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  db.get(`
    SELECT 
      COUNT(*) as total_trades,
      SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
      SUM(CASE WHEN profit_loss < 0 THEN 1 ELSE 0 END) as losing_trades,
      SUM(profit_loss) as total_profit,
      AVG(profit_loss) as avg_profit,
      MAX(profit_loss) as best_trade,
      MIN(profit_loss) as worst_trade
    FROM trades 
    WHERE user_id = ?
  `, [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    const performance = {
      total_trades: row.total_trades || 0,
      winning_trades: row.winning_trades || 0,
      losing_trades: row.losing_trades || 0,
      win_rate: row.total_trades > 0 ? (row.winning_trades / row.total_trades * 100).toFixed(2) : 0,
      total_profit: row.total_profit || 0,
      avg_profit: row.avg_profit || 0,
      best_trade: row.best_trade || 0,
      worst_trade: row.worst_trade || 0
    };
    
    res.json(performance);
  });
});

// Risk Management
app.get('/api/risk/limits', authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    
    const limits = {
      daily_loss_limit: user.daily_loss_limit || 100,
      max_stake: user.max_stake || 50,
      max_trades_per_day: user.max_trades_per_day || 100,
      risk_percentage: user.risk_percentage || 2
    };
    
    res.json(limits);
  });
});

app.post('/api/risk/limits', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { daily_loss_limit, max_stake, max_trades_per_day, risk_percentage } = req.body;
  
  db.run(`
    UPDATE users 
    SET daily_loss_limit = ?, max_stake = ?, max_trades_per_day = ?, risk_percentage = ?
    WHERE id = ?
  `, [daily_loss_limit, max_stake, max_trades_per_day, risk_percentage, userId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Risk limits updated successfully' });
  });
});

// Root and Health Check Routes
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Trading Mastery API',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        verify: 'GET /api/auth/verify'
      },
      trading: {
        balance: 'GET /api/trading/balance',
        buy: 'POST /api/trading/buy',
        sell: 'POST /api/trading/sell',
        portfolio: 'GET /api/trading/portfolio'
      },
      analysis: {
        technical: 'GET /api/analysis/technical',
        signals: 'GET /api/analysis/signals'
      },
      bot: {
        strategies: 'GET /api/bot/strategies',
        status: 'GET /api/bot/status',
        configure: 'POST /api/bot/configure',
        start: 'POST /api/bot/start',
        stop: 'POST /api/bot/stop'
      },
      trades: {
        history: 'GET /api/trades/history',
        performance: 'GET /api/trades/performance'
      }
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Trading Mastery API',
    timestamp: new Date().toISOString(),
    database: 'connected',
    uptime: process.uptime()
  });
});

// Server setup
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Simulate bot trades
setInterval(() => {
  if (botStatus.active) {
    const shouldTrade = Math.random() > 0.7;
    if (shouldTrade) {
      botStatus.trades_today++;
      botStatus.profit_today += (Math.random() - 0.4) * 100;
    }
  }
}, 5000);

console.log('Trading server initialized');
