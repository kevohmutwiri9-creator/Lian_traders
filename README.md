# Trading Mastery

A comprehensive trading platform with advanced features including automated trading bots, real-time market data, copy trading, multi-language support, email verification, two-factor authentication, payment integration, referral system, social features, admin dashboard, and analytics.

## Features

### Core Trading Features
- **Automated Trading Bots**: Create and deploy custom trading strategies
- **Real-time Market Data**: Live price updates via WebSocket
- **Manual Trading**: Execute trades manually with real-time data
- **Copy Trading**: Follow and copy successful traders
- **Trading Tools**: Apex Market, Manual Trader, Analysistool, LDP Tool, Charts

### Global User Features
- **Multi-language Support**: 10 languages (English, Spanish, French, German, Chinese, Japanese, Arabic, Portuguese, Russian, Hindi)
- **Email Verification**: Secure email verification system with SendGrid
- **Two-Factor Authentication (2FA)**: Enhanced security with Google Authenticator
- **Payment Integration**: Stripe checkout for premium subscriptions
- **Referral System**: Earn commissions by referring new users
- **Social Features**: Share strategies, follow traders, strategy marketplace
- **Real-time Leaderboard**: Track top traders and rankings
- **Admin Dashboard**: User management and platform analytics
- **API Rate Limiting**: Protect against API abuse
- **Analytics Dashboard**: Track user behavior and platform metrics

## Tech Stack

### Frontend
- HTML5
- CSS3
- Vanilla JavaScript
- WebSocket for real-time data

### Backend
- Node.js
- Express.js
- SQLite3 database
- WebSocket (ws)
- JWT authentication
- bcryptjs for password hashing

### Third-party Services
- SendGrid (email verification)
- Stripe (payment processing)
- Google Authenticator (2FA)

## Quick Start

### Prerequisites
- Node.js 16+ installed
- Git installed

### Installation

1. Clone the repository:
```bash
git clone https://github.com/kevohmutwiri9-creator/Lian_traders.git
cd lian traders
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your API keys
```

4. Run database migration:
```bash
npm run migrate
```

5. Start the server:
```bash
npm start
```

6. Open `index.html` in your browser

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
PORT=3001
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key
FRONTEND_URL=http://localhost:8000
SENDGRID_API_KEY=your-sendgrid-api-key
EMAIL_FROM=noreply@tradingmastery.com
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
```

### API Keys Setup

#### SendGrid (Email Verification)
1. Create account at [sendgrid.com](https://sendgrid.com)
2. Generate API key with "Mail Send" permissions
3. Verify sender email
4. Add API key to `.env`

#### Stripe (Payment Processing)
1. Create account at [stripe.com](https://stripe.com)
2. Get Secret Key from Developers → API Keys
3. Create webhook for `checkout.session.completed`
4. Add keys to `.env`

## API Documentation

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/verify-email` - Verify email address
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

For detailed API documentation, see [API_SETUP.md](API_SETUP.md).

## Deployment

### Backend (Render)
1. Push code to GitHub
2. Create new Web Service on Render
3. Connect repository
4. Add environment variables
5. Deploy

### Frontend (Netlify)
1. Update API_BASE in index.html to production URL
2. Deploy folder to Netlify
3. Update FRONTEND_URL in Render environment variables

For detailed deployment instructions, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

## Database Schema

### Users Table
- `id` - Primary key
- `email` - User email (unique)
- `password` - Hashed password
- `name` - User name
- `balance` - Real trading balance
- `demo_balance` - Demo trading balance
- `is_demo` - Demo mode flag
- `is_verified` - Email verification status
- `verification_token` - Email verification token
- `two_factor_secret` - 2FA secret
- `two_factor_enabled` - 2FA enabled flag
- `referral_code` - User referral code
- `referred_by` - Referrer user ID
- `subscription_tier` - Subscription tier (free/professional/elite)
- `subscription_expires_at` - Subscription expiration
- `profit` - Total profit
- `win_rate` - Win rate percentage
- `total_trades` - Total trades count
- `created_at` - Account creation timestamp
- `updated_at` - Last update timestamp

### Trades Table
- `id` - Primary key
- `user_id` - User ID (foreign key)
- `symbol` - Trading symbol
- `type` - Trade type
- `side` - Trade side (buy/sell)
- `amount` - Trade amount
- `entry_price` - Entry price
- `exit_price` - Exit price
- `profit_loss` - Profit/loss
- `status` - Trade status (open/closed)
- `is_demo` - Demo trade flag
- `created_at` - Trade creation timestamp
- `closed_at` - Trade close timestamp

### Referrals Table
- `id` - Primary key
- `referrer_id` - Referrer user ID
- `referred_user_id` - Referred user ID
- `commission` - Commission amount
- `created_at` - Referral timestamp

### Analytics Table
- `id` - Primary key
- `event_type` - Event type
- `user_id` - User ID
- `metadata` - Event metadata (JSON)
- `created_at` - Event timestamp

### Strategies Table
- `id` - Primary key
- `user_id` - User ID
- `name` - Strategy name
- `description` - Strategy description
- `parameters` - Strategy parameters (JSON)
- `is_public` - Public flag
- `downloads` - Download count
- `rating` - Strategy rating
- `created_at` - Creation timestamp

### Follows Table
- `id` - Primary key
- `follower_id` - Follower user ID
- `following_id` - Following user ID
- `created_at` - Follow timestamp

## Security

- Password hashing with bcryptjs
- JWT token authentication
- Two-Factor Authentication (2FA)
- Email verification
- API rate limiting (100 requests per 15 minutes)
- Environment variables for secrets
- HTTPS in production

## Support

For detailed setup and deployment instructions:
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- [API_SETUP.md](API_SETUP.md)

## License

Proprietary. All rights reserved.

## Contributing

This is a proprietary project. No external contributions are accepted.
