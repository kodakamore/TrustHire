import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { query } from '../config/database.js';
dotenv.config();

export const authenticateRecruiter = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Contains id and email

    // Account-level sanctions apply to EXISTING sessions too — a token
    // minted before suspension must not keep working for its full 7-day
    // lifetime. Checked here so every recruiter route is covered.
    const r = await query('SELECT account_status FROM recruiters WHERE id = $1', [decoded.id]);
    if (r.rowCount === 0) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Account not found' });
    }
    const status = r.rows[0].account_status || 'active';
    if (status !== 'active') {
      return res.status(403).json({
        success: false,
        error:
          status === 'removed'
            ? 'This TrustHire account has been permanently removed.'
            : 'This TrustHire account has been suspended. Please contact support@trusthire.ng if you believe this is a mistake.',
        accountStatus: status,
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
};
