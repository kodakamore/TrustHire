import dotenv from 'dotenv';
dotenv.config();

export const dojahConfig = {
  baseUrl: process.env.DOJAH_BASE_URL || 'https://sandbox.dojah.io',
  appId: process.env.DOJAH_APP_ID,
  secretKey: process.env.DOJAH_SECRET_KEY,
};
