import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';
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

// 4. Win/loss record, which sets each player's level. Must match statsMessage in apps/web/src/ui/UiApp.tsx.
const statsMessage = (address, thefts, saves, losses) => `Sonic Heist stats ${address.toLowerCase()} ${thefts} ${saves} ${losses}`;
const STAT_COLUMNS = 'thefts, saves, losses';

app.get('/api/stats/:address', async (req, res) => {
  try {
    const result = await pool.query(`SELECT ${STAT_COLUMNS} FROM users WHERE lower(wallet_address) = lower($1)`, [req.params.address]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Unknown wallet' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Stats read error:', err);
    res.status(500).json({ error: 'Failed to read stats' });
  }
});

// Takes running totals signed by the player's wallet. Totals only ever go up, so a replayed or stale save changes nothing.
app.post('/api/stats', async (req, res) => {
  const { address, thefts, saves, losses, signature } = req.body ?? {};
  const counts = [thefts, saves, losses];
  if (typeof address !== 'string' || typeof signature !== 'string' || !counts.every((n) => Number.isInteger(n) && n >= 0 && n < 1e6)) {
    return res.status(400).json({ error: 'address, signature and whole-number thefts, saves and losses are required' });
  }
  try {
    const found = await pool.query('SELECT wallet_address FROM users WHERE lower(wallet_address) = lower($1)', [address]);
    if (found.rows.length === 0) return res.status(404).json({ error: 'Unknown wallet' });
    const ok = await verifyMessage({ address: found.rows[0].wallet_address, message: statsMessage(address, thefts, saves, losses), signature }).catch(() => false);
    if (!ok) return res.status(401).json({ error: 'Bad signature' });
    const result = await pool.query(
      `UPDATE users SET thefts = GREATEST(thefts, $2), saves = GREATEST(saves, $3), losses = GREATEST(losses, $4)
       WHERE lower(wallet_address) = lower($1) RETURNING ${STAT_COLUMNS}`,
      [address, thefts, saves, losses]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Stats save error:', err);
    res.status(500).json({ error: 'Failed to save stats' });
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
