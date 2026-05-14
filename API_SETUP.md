# Trading Mastery API Setup Guide

## API Placement and Configuration

### Where to Put Your API Keys

#### 1. Deriv API Token (Required for Trading)
**Location:** User Dashboard → Settings → API Configuration
**How to Get:**
- Visit https://deriv.com
- Create account
- Go to Settings → API Token
- Generate token with "Read" and "Trade" scopes
- Copy token and paste in Trading Mastery dashboard

**Frontend Storage:**
```javascript
// Stored in localStorage after user connects
localStorage.setItem('derivToken', 'your_token_here');
```

**Backend Environment Variables:**
```env
DERIV_APP_ID=1089  # Default Deriv app ID
DERIV_API_URL=https://api.deriv.com
```

#### 2. Email Service API (For Email Verification)
**Location:** Backend server.js
**Recommended Services:**
- SendGrid (Free tier: 100 emails/day)
- Mailgun (Free tier: 5,000 emails/month)
- AWS SES (Pay as you go)

**Environment Variables:**
```env
SENDGRID_API_KEY=your_sendgrid_key
EMAIL_FROM=noreply@tradingmastery.com
```

#### 3. Payment Gateway API (For Premium Features)
**Location:** Backend server.js
**Recommended Services:**
- Stripe (Best for global payments)
- PayPal
- Razorpay (Best for India)

**Environment Variables:**
```env
STRIPE_SECRET_KEY=sk_live_your_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

#### 4. Two-Factor Authentication API
**Location:** Backend server.js
**Recommended Services:**
- Google Authenticator (TOTP - Free)
- Authy (Free)
- Twilio Verify (SMS-based)

**Environment Variables:**
```env
TOTP_SECRET=your_secret_key
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890
```

#### 5. Analytics API (Optional)
**Location:** Frontend index.html
**Recommended Services:**
- Google Analytics (Free)
- Mixpanel (Free tier)
- Plausible (Privacy-focused)

**Frontend:**
```html
<!-- Add to head section -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
```

## Current API Configuration

### Backend API (Render.com)
**URL:** https://lian-traders-api.onrender.com
**Base URL:** Used in frontend for all API calls

### Frontend API Configuration
```javascript
const API_BASE = window.location.origin.includes('localhost')
    ? 'http://localhost:3001'
    : 'https://lian-traders-api.onrender.com';
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-email` - Email verification
- `POST /api/auth/enable-2fa` - Enable 2FA
- `POST /api/auth/verify-2fa` - Verify 2FA code

### User Management
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `GET /api/user/trades` - Get user trades
- `POST /api/user/deriv-token` - Save Deriv token

### Trading
- `POST /api/trade/execute` - Execute trade
- `GET /api/trade/history` - Get trade history
- `POST /api/bot/create` - Create trading bot
- `POST /api/bot/start` - Start bot
- `POST /api/bot/stop` - Stop bot

### Admin
- `GET /api/admin/users` - Get all users (admin only)
- `PUT /api/admin/user/:id` - Update user (admin only)
- `GET /api/admin/analytics` - Get platform analytics (admin only)

### Payments
- `POST /api/payment/create-checkout` - Create payment session
- `POST /api/payment/webhook` - Payment webhook handler

### Referral
- `GET /api/referral/code` - Get referral code
- `POST /api/referral/apply` - Apply referral code
- `GET /api/referral/stats` - Get referral stats

## Security Best Practices

1. **Never commit API keys to GitHub** - Use environment variables
2. **Use .env file** for local development
3. **Use Render Environment Variables** for production
4. **Rotate API keys regularly**
5. **Use HTTPS only** for production
6. **Implement rate limiting** to prevent abuse
7. **Validate all inputs** on both frontend and backend

## Environment Variables Template

Create `.env` file in backend directory:

```env
# Server
PORT=3001
NODE_ENV=production

# Database
DATABASE_PATH=./database.sqlite

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d

# Deriv API
DERIV_APP_ID=1089
DERIV_API_URL=https://api.deriv.com

# Email Service (SendGrid)
SENDGRID_API_KEY=your_sendgrid_key
EMAIL_FROM=noreply@tradingmastery.com

# Payment (Stripe)
STRIPE_SECRET_KEY=sk_live_your_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# 2FA (Google Authenticator)
TOTP_SECRET=your_totp_secret

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
```

## Next Steps

1. Set up SendGrid account for email verification
2. Set up Stripe account for payments
3. Configure Google Authenticator for 2FA
4. Update backend server.js with new API integrations
5. Test all API endpoints locally
6. Deploy to Render with environment variables
