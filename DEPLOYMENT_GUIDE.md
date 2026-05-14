# Trading Mastery - Deployment Guide

## Overview
This guide covers the complete deployment process for Trading Mastery with all global user features including multi-language support, email verification, two-factor authentication, payment integration, referral system, social features, admin dashboard, API rate limiting, and analytics.

## Prerequisites
- Node.js 16+ installed
- Git installed
- SendGrid account (for email verification)
- Stripe account (for payment processing)
- Render account (for backend hosting)
- Netlify account (for frontend hosting)

## Local Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/kevohmutwiri9-creator/Lian_traders.git
cd lian traders
```

### 2. Install Dependencies
```bash
npm install
```

This will install:
- express
- cors
- ws
- sqlite3
- bcryptjs
- jsonwebtoken
- uuid
- axios
- dotenv
- nodemailer (email verification)
- speakeasy (2FA)
- qrcode (2FA QR codes)
- stripe (payment processing)
- express-rate-limit (API rate limiting)

### 3. Set Up Environment Variables

Create a `.env` file in the project root:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# JWT Secret (generate a secure random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Frontend URL
FRONTEND_URL=http://localhost:8000

# Email Configuration (SendGrid)
SENDGRID_API_KEY=your-sendgrid-api-key
EMAIL_FROM=noreply@tradingmastery.com

# Stripe Configuration
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret

# Database (SQLite - no configuration needed)
# Database file: trading.db
```

### 4. Run Database Migration

```bash
npm run migrate
```

This will:
- Add new columns to the users table
- Create new tables: referrals, analytics, strategies, follows

### 5. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3001`

### 6. Run the Frontend

Open `index.html` in your browser or use a local server:
```bash
npx serve
```

## Production Deployment

### Backend Deployment (Render)

1. **Push Code to GitHub**
   - Ensure all code is pushed to your GitHub repository

2. **Create New Web Service on Render**
   - Go to [render.com](https://render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: trading-mastery-api
     - **Region**: Choose nearest region
     - **Branch**: master
     - **Runtime**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `node server.js`
   
3. **Add Environment Variables**
   In Render dashboard → Environment:
   ```
   PORT=3001
   NODE_ENV=production
   JWT_SECRET=your-production-jwt-secret
   FRONTEND_URL=https://your-frontend-url.netlify.app
   SENDGRID_API_KEY=your-sendgrid-api-key
   EMAIL_FROM=noreply@tradingmastery.com
   STRIPE_SECRET_KEY=your-stripe-live-secret-key
   STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
   ```

4. **Deploy**
   - Click "Deploy Web Service"
   - Wait for deployment to complete
   - Note your backend URL: `https://trading-mastery-api.onrender.com`

5. **Run Database Migration**
   - Connect to Render shell: `ssh -p 10022 render@your-service-url`
   - Run: `node migrate.js`

### Frontend Deployment (Netlify)

1. **Prepare Frontend**
   - Update API_BASE in `index.html` to your production backend URL:
   ```javascript
   const API_BASE = 'https://trading-mastery-api.onrender.com';
   ```

2. **Deploy to Netlify**
   - Go to [netlify.com](https://netlify.com)
   - Drag and drop the `lian traders` folder
   - Or connect to GitHub repository
   - Deploy

3. **Update Environment**
   - Netlify will provide your frontend URL
   - Update FRONTEND_URL in Render environment variables

## Service Setup

### SendGrid Setup (Email Verification)

1. **Create SendGrid Account**
   - Go to [sendgrid.com](https://sendgrid.com)
   - Sign up for free account (100 emails/day)

2. **Create API Key**
   - Settings → API Keys → Create API Key
   - Name: "Trading Mastery"
   - Permissions: Mail Send
   - Copy the API key

3. **Configure Sender**
   - Settings → Sender Authentication
   - Verify your sender email

4. **Add to Environment Variables**
   - Add `SENDGRID_API_KEY` to your `.env` file
   - Add to Render environment variables

### Stripe Setup (Payment Processing)

1. **Create Stripe Account**
   - Go to [stripe.com](https://stripe.com)
   - Sign up and complete verification

2. **Get API Keys**
   - Developers → API Keys
   - Copy Secret Key (sk_live_...)
   - Copy Publishable Key (pk_live_...)

3. **Create Webhook**
   - Developers → Webhooks → Add endpoint
   - URL: `https://trading-mastery-api.onrender.com/api/payment/webhook`
   - Events: `checkout.session.completed`
   - Copy webhook signing secret

4. **Add to Environment Variables**
   - Add `STRIPE_SECRET_KEY` to your `.env` file
   - Add `STRIPE_WEBHOOK_SECRET` to your `.env` file
   - Add to Render environment variables

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration with email verification
- `POST /api/auth/login` - User login with 2FA support
- `POST /api/auth/verify-email` - Email verification
- `POST /api/auth/resend-verification` - Resend verification email
- `POST /api/auth/enable-2fa` - Enable Two-Factor Authentication
- `POST /api/auth/verify-2fa` - Verify 2FA token
- `POST /api/auth/disable-2fa` - Disable 2FA

### Referral System
- `POST /api/referral/apply` - Apply referral code
- `GET /api/referral/stats` - Get referral statistics

### Payment Integration
- `POST /api/payment/create-checkout` - Create Stripe checkout session
- `POST /api/payment/webhook` - Stripe webhook handler

### Social Features
- `POST /api/strategies` - Create trading strategy
- `GET /api/strategies` - Get public strategies
- `POST /api/follow` - Follow a trader
- `DELETE /api/follow/:id` - Unfollow a trader
- `GET /api/following` - Get following list

### Analytics
- `POST /api/analytics/track` - Track analytics event
- `GET /api/leaderboard` - Get leaderboard

### Admin Dashboard
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/user/:id` - Update user
- `GET /api/admin/analytics` - Get platform analytics

## Testing

### Test Email Verification
1. Register a new user
2. Check email for verification link
3. Click verification link
4. Verify user can login

### Test Two-Factor Authentication
1. Login to account
2. Go to Settings → Enable 2FA
3. Scan QR code with Google Authenticator
4. Enter 6-digit code
5. Verify 2FA is enabled
6. Logout and login with 2FA code

### Test Payment Integration
1. Go to Pricing section
2. Click "Subscribe Now" on Professional or Elite plan
3. Complete Stripe checkout (test mode)
4. Verify subscription is activated

### Test Referral System
1. Copy your referral code from dashboard
2. Register new account with referral code
3. Verify referral is recorded
4. Check referral stats

## Troubleshooting

### Email Not Sending
- Verify SendGrid API key is correct
- Check sender email is verified
- Check spam folder
- Verify SendGrid account is not in sandbox mode

### 2FA Not Working
- Verify time is synced on device
- Check Google Authenticator app is working
- Verify secret is stored correctly in database

### Payment Failing
- Verify Stripe API keys are correct
- Check webhook URL is correct
- Verify webhook secret matches
- Check Stripe dashboard for errors

### Database Issues
- Run `npm run migrate` to update schema
- Check `trading.db` file exists
- Verify file permissions

## Security Best Practices

1. **Never commit `.env` file** to Git
2. **Use strong JWT secrets** in production
3. **Enable HTTPS** in production
4. **Rotate API keys** regularly
5. **Monitor logs** for suspicious activity
6. **Implement rate limiting** (already included)
7. **Use environment variables** for all secrets
8. **Keep dependencies updated**

## Support

For issues or questions:
- Check API_SETUP.md for detailed API configuration
- Review server.js for implementation details
- Check migrate.js for database schema
- Review Render logs for backend errors
- Check Netlify logs for frontend errors

## License

This project is proprietary. All rights reserved.
