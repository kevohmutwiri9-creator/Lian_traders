const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./trading.db', (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    } else {
        console.log('Connected to SQLite database');
        migrateDatabase();
    }
});

function migrateDatabase() {
    db.serialize(() => {
        // Add new columns to users table
        console.log('Adding new columns to users table...');
        
        db.run(`ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding is_verified:', err.message);
            } else {
                console.log('✓ is_verified column added (or already exists)');
            }
        });
        
        db.run(`ALTER TABLE users ADD COLUMN verification_token TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding verification_token:', err.message);
            } else {
                console.log('✓ verification_token column added (or already exists)');
            }
        });
        
        db.run(`ALTER TABLE users ADD COLUMN two_factor_secret TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding two_factor_secret:', err.message);
            } else {
                console.log('✓ two_factor_secret column added (or already exists)');
            }
        });
        
        db.run(`ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER DEFAULT 0`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding two_factor_enabled:', err.message);
            } else {
                console.log('✓ two_factor_enabled column added (or already exists)');
            }
        });
        
        db.run(`ALTER TABLE users ADD COLUMN referral_code TEXT UNIQUE`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding referral_code:', err.message);
            } else {
                console.log('✓ referral_code column added (or already exists)');
            }
        });
        
        db.run(`ALTER TABLE users ADD COLUMN referred_by TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding referred_by:', err.message);
            } else {
                console.log('✓ referred_by column added (or already exists)');
            }
        });
        
        db.run(`ALTER TABLE users ADD COLUMN subscription_tier TEXT DEFAULT 'free'`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding subscription_tier:', err.message);
            } else {
                console.log('✓ subscription_tier column added (or already exists)');
            }
        });
        
        db.run(`ALTER TABLE users ADD COLUMN subscription_expires_at DATETIME`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding subscription_expires_at:', err.message);
            } else {
                console.log('✓ subscription_expires_at column added (or already exists)');
            }
        });
        
        db.run(`ALTER TABLE users ADD COLUMN profit REAL DEFAULT 0`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding profit:', err.message);
            } else {
                console.log('✓ profit column added (or already exists)');
            }
        });
        
        db.run(`ALTER TABLE users ADD COLUMN win_rate REAL DEFAULT 0`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding win_rate:', err.message);
            } else {
                console.log('✓ win_rate column added (or already exists)');
            }
        });
        
        db.run(`ALTER TABLE users ADD COLUMN total_trades INTEGER DEFAULT 0`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding total_trades:', err.message);
            } else {
                console.log('✓ total_trades column added (or already exists)');
            }
        });
        
        db.run(`ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error('Error adding updated_at:', err.message);
            } else {
                console.log('✓ updated_at column added (or already exists)');
            }
        });
        
        // Create new tables
        console.log('\nCreating new tables...');
        
        db.run(`CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id TEXT,
            referred_user_id TEXT,
            commission REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (referrer_id) REFERENCES users(id),
            FOREIGN KEY (referred_user_id) REFERENCES users(id)
        )`, (err) => {
            if (err) {
                console.error('Error creating referrals table:', err.message);
            } else {
                console.log('✓ referrals table created');
            }
        });
        
        db.run(`CREATE TABLE IF NOT EXISTS analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            user_id TEXT,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`, (err) => {
            if (err) {
                console.error('Error creating analytics table:', err.message);
            } else {
                console.log('✓ analytics table created');
            }
        });
        
        db.run(`CREATE TABLE IF NOT EXISTS strategies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            parameters TEXT,
            is_public INTEGER DEFAULT 0,
            downloads INTEGER DEFAULT 0,
            rating REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`, (err) => {
            if (err) {
                console.error('Error creating strategies table:', err.message);
            } else {
                console.log('✓ strategies table created');
            }
        });
        
        db.run(`CREATE TABLE IF NOT EXISTS follows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            follower_id TEXT NOT NULL,
            following_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (follower_id) REFERENCES users(id),
            FOREIGN KEY (following_id) REFERENCES users(id),
            UNIQUE(follower_id, following_id)
        )`, (err) => {
            if (err) {
                console.error('Error creating follows table:', err.message);
            } else {
                console.log('✓ follows table created');
            }
        });
        
        console.log('\n✅ Database migration completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Install new dependencies: npm install');
        console.log('2. Set up environment variables (see API_SETUP.md)');
        console.log('3. Start the server: npm start');
        
        db.close();
    });
}
