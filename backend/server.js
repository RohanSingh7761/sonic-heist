import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import crypto from 'crypto';
import { pool, initDb } from './src/db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Helper for simple password hash
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Sonic Heist Backend' });
});

// 2. Register: Create user & generate brand new empty Base Sepolia wallet
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Generate new Ethereum / Base Sepolia keypair
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const passwordHash = hashPassword(password);

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, wallet_address, private_key)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, wallet_address, private_key, created_at`,
      [username.trim(), passwordHash, account.address, privateKey]
    );

    const user = result.rows[0];
    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: user.id,
        username: user.username,
        walletAddress: user.wallet_address,
        privateKey: user.private_key,
      },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// 3. Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const passwordHash = hashPassword(password);
    const result = await pool.query(
      `SELECT id, username, wallet_address, private_key
       FROM users
       WHERE username = $1 AND password_hash = $2`,
      [username.trim(), passwordHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    res.json({
      message: 'Logged in successfully',
      user: {
        id: user.id,
        username: user.username,
        walletAddress: user.wallet_address,
        privateKey: user.private_key,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// Start server and initialize database
async function start() {
  try {
    await initDb();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Sonic Heist Backend running on http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('Backend startup error:', err);
    process.exit(1);
  }
}

start();
