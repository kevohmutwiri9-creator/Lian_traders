const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const axios = require('axios');

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

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    
    db.run(
      'INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)',
      [userId, email, hashedPassword, name],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already exists' });
          }
          return res.status(500).json({ error: 'Database error' });
        }
        
        const token = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, userId, email, name, message: 'User registered successfully' });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
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
      is_demo: user.is_demo
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
