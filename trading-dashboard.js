// Trading Mastery - Real Trading Dashboard
// Manages real-time market data, trading operations, and portfolio updates

class TradingDashboard {
  constructor() {
    this.apiBase = window.LIAN_TRADERS_API_BASE_URL || 'https://lian-traders-api.onrender.com';
    this.token = localStorage.getItem('authToken');
    this.userBalance = 0;
    this.portfolio = [];
    this.trades = [];
    this.marketData = {};
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
    this.init();
  }

  async init() {
    console.log('Initializing Trading Dashboard...');
    
    // Initialize real-time connections
    this.connectWebSocket();
    
    // Load user data
    if (this.token) {
      await this.loadUserData();
      await this.loadTradeHistory();
      await this.startMarketDataFeed();
    }
    
    // Setup UI event listeners
    this.setupUIListeners();
  }

  // WebSocket connection for real-time data
  connectWebSocket() {
    try {
      const wsUrl = `${this.apiBase.replace('https:', 'wss:').replace('http:', 'ws:')}/api/deriv/ws`;
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.updateConnectionStatus(true);
      };
      
      this.ws.onmessage = (event) => {
        this.handleMarketUpdate(JSON.parse(event.data));
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.updateConnectionStatus(false);
      };
      
      this.ws.onclose = () => {
        console.warn('WebSocket closed');
        this.isConnected = false;
        this.reconnect();
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      this.reconnect();
    }
  }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      console.log(`Reconnecting in ${delay}ms...`);
      setTimeout(() => this.connectWebSocket(), delay);
    }
  }

  // Load user portfolio and balance
  async loadUserData() {
    try {
      const response = await fetch(`${this.apiBase}/api/trading/portfolio`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.userBalance = data.balance || 0;
        this.portfolio = data.positions || [];
        this.updateBalanceDisplay();
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }

  // Load trade history
  async loadTradeHistory() {
    try {
      const response = await fetch(`${this.apiBase}/api/trades/history?limit=50`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      if (response.ok) {
        this.trades = await response.json();
        this.updateTradesDisplay();
      }
    } catch (error) {
      console.error('Failed to load trade history:', error);
    }
  }

  // Real-time market data feed
  async startMarketDataFeed() {
    // Update market data every 2 seconds
    setInterval(async () => {
      try {
        const response = await fetch(`${this.apiBase}/api/analysis/technical?symbol=R_10&timeframe=60`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          this.updateMarketData(data);
        }
      } catch (error) {
        console.error('Failed to fetch market data:', error);
      }
    }, 2000);
  }

  // Handle incoming market updates
  handleMarketUpdate(data) {
    this.marketData = data;
    this.animateMarketTicker(data);
  }

  // Execute a buy trade
  async executeBuyTrade(symbol, amount, duration) {
    try {
      const response = await fetch(`${this.apiBase}/api/trading/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ symbol, amount, duration })
      });
      
      if (response.ok) {
        const trade = await response.json();
        this.showNotification('Trade executed successfully!', 'success');
        await this.loadUserData();
        await this.loadTradeHistory();
        return trade;
      } else {
        this.showNotification('Trade execution failed', 'error');
      }
    } catch (error) {
      console.error('Trade execution error:', error);
      this.showNotification('Error executing trade', 'error');
    }
  }

  // Execute a sell trade
  async executeSellTrade(contractId) {
    try {
      const response = await fetch(`${this.apiBase}/api/trading/sell`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ contract_id: contractId })
      });
      
      if (response.ok) {
        this.showNotification('Position closed successfully!', 'success');
        await this.loadUserData();
        await this.loadTradeHistory();
      }
    } catch (error) {
      console.error('Sell error:', error);
      this.showNotification('Error closing position', 'error');
    }
  }

  // Get technical analysis signals
  async getAnalysisSignals() {
    try {
      const response = await fetch(`${this.apiBase}/api/analysis/technical?symbol=R_10&timeframe=60`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      if (response.ok) {
        const analysis = await response.json();
        this.displayAnalysisSignals(analysis);
        return analysis;
      }
    } catch (error) {
      console.error('Failed to get analysis:', error);
    }
  }

  // Bot management
  async configureTradingBot(strategy, parameters) {
    try {
      const response = await fetch(`${this.apiBase}/api/bot/configure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ strategy, parameters, symbol: 'R_10', stake_amount: 1 })
      });
      
      if (response.ok) {
        const config = await response.json();
        this.showNotification(`Bot configured with ${strategy}`, 'success');
        return config;
      }
    } catch (error) {
      console.error('Bot configuration error:', error);
    }
  }

  async startTradingBot() {
    try {
      const response = await fetch(`${this.apiBase}/api/bot/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ strategy: 'trend_following', symbol: 'R_10' })
      });
      
      if (response.ok) {
        this.showNotification('Trading bot started', 'success');
      }
    } catch (error) {
      console.error('Bot start error:', error);
    }
  }

  async stopTradingBot() {
    try {
      const response = await fetch(`${this.apiBase}/api/bot/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        }
      });
      
      if (response.ok) {
        this.showNotification('Trading bot stopped', 'success');
      }
    } catch (error) {
      console.error('Bot stop error:', error);
    }
  }

  // UI Update Methods
  updateBalanceDisplay() {
    const balanceEl = document.getElementById('user-balance');
    if (balanceEl) {
      balanceEl.textContent = `$${this.userBalance.toFixed(2)}`;
      balanceEl.classList.add('counter');
    }
  }

  updateMarketData(data) {
    // Update RSI indicator
    const rsiEl = document.getElementById('rsi-value');
    if (rsiEl && data.indicators.rsi) {
      rsiEl.textContent = data.indicators.rsi.toFixed(2);
      rsiEl.parentElement.classList.add('pulse-animation');
    }

    // Update SMA
    const smaEl = document.getElementById('sma-value');
    if (smaEl && data.indicators.sma_20) {
      smaEl.textContent = data.indicators.sma_20.toFixed(4);
    }

    // Update MACD
    const macdEl = document.getElementById('macd-value');
    if (macdEl && data.indicators.macd) {
      macdEl.textContent = data.indicators.macd.macd.toFixed(6);
    }

    // Display signals
    if (data.signals && data.signals.length > 0) {
      this.displayAnalysisSignals(data);
    }
  }

  updateTradesDisplay() {
    const tradesContainer = document.getElementById('recent-trades');
    if (!tradesContainer) return;

    tradesContainer.innerHTML = '';
    
    this.trades.slice(0, 10).forEach((trade, index) => {
      const tradeEl = document.createElement('div');
      tradeEl.className = 'trade-row stagger-item';
      tradeEl.style.animationDelay = `${index * 0.1}s`;
      
      const profitClass = trade.profit_loss > 0 ? 'profit' : 'loss';
      const profitColor = trade.profit_loss > 0 ? 'green' : 'red';
      
      tradeEl.innerHTML = `
        <div class="trade-info">
          <span class="symbol">${trade.symbol}</span>
          <span class="type">${trade.trade_type}</span>
        </div>
        <div class="trade-amount">$${trade.amount.toFixed(2)}</div>
        <div class="trade-profit ${profitClass}" style="color: ${profitColor}">
          ${trade.profit_loss > 0 ? '+' : ''}$${trade.profit_loss.toFixed(2)}
        </div>
        <div class="trade-time">${new Date(trade.created_at).toLocaleTimeString()}</div>
      `;
      
      tradesContainer.appendChild(tradeEl);
    });
  }

  displayAnalysisSignals(analysis) {
    const signalsContainer = document.getElementById('trading-signals');
    if (!signalsContainer) return;

    signalsContainer.innerHTML = '';
    
    if (analysis.signals && analysis.signals.length > 0) {
      analysis.signals.forEach((signal) => {
        const signalEl = document.createElement('div');
        signalEl.className = `signal ${signal.type.toLowerCase()} grow-in`;
        signalEl.innerHTML = `
          <span class="signal-type">${signal.type}</span>
          <span class="signal-reason">${signal.reason}</span>
          <span class="signal-strength">${signal.strength}</span>
        `;
        signalsContainer.appendChild(signalEl);
      });
    } else {
      signalsContainer.innerHTML = '<p class="no-signals">No trading signals at the moment</p>';
    }
  }

  animateMarketTicker(data) {
    const tickerEl = document.getElementById('market-ticker');
    if (tickerEl) {
      tickerEl.classList.remove('price-ticker');
      setTimeout(() => tickerEl.classList.add('price-ticker'), 10);
    }
  }

  updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
      statusEl.className = connected ? 'status-online' : 'status-offline';
      statusEl.textContent = connected ? '● Online' : '● Offline';
    }
  }

  // UI Event Listeners
  setupUIListeners() {
    // Buy button
    const buyBtn = document.getElementById('buy-btn');
    if (buyBtn) {
      buyBtn.addEventListener('click', () => this.handleBuyClick());
    }

    // Sell button
    const sellBtn = document.getElementById('sell-btn');
    if (sellBtn) {
      sellBtn.addEventListener('click', () => this.handleSellClick());
    }

    // Bot start button
    const botStartBtn = document.getElementById('bot-start-btn');
    if (botStartBtn) {
      botStartBtn.addEventListener('click', () => this.startTradingBot());
    }

    // Bot stop button
    const botStopBtn = document.getElementById('bot-stop-btn');
    if (botStopBtn) {
      botStopBtn.addEventListener('click', () => this.stopTradingBot());
    }

    // Refresh analysis
    const refreshAnalysisBtn = document.getElementById('refresh-analysis-btn');
    if (refreshAnalysisBtn) {
      refreshAnalysisBtn.addEventListener('click', () => this.getAnalysisSignals());
    }
  }

  async handleBuyClick() {
    const amountInput = document.getElementById('trade-amount');
    const durationInput = document.getElementById('trade-duration');
    
    if (amountInput && durationInput) {
      await this.executeBuyTrade('R_10', parseFloat(amountInput.value), parseInt(durationInput.value));
    }
  }

  async handleSellClick() {
    if (this.portfolio.length > 0) {
      const firstPosition = this.portfolio[0];
      await this.executeSellTrade(firstPosition.contract_id);
    } else {
      this.showNotification('No open positions to sell', 'warning');
    }
  }

  showNotification(message, type = 'info') {
    const notificationEl = document.createElement('div');
    notificationEl.className = `notification ${type} notification`;
    notificationEl.textContent = message;
    
    document.body.appendChild(notificationEl);
    
    setTimeout(() => {
      notificationEl.style.opacity = '0';
      setTimeout(() => notificationEl.remove(), 300);
    }, 5000);
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.tradingDashboard = new TradingDashboard();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TradingDashboard;
}
