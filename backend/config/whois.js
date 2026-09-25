import dotenv from 'dotenv';
dotenv.config();

export const whoisConfig = {
  baseUrl: process.env.WHOIS_BASE_URL || 'https://whoisjson.com/api/v1',
  apiKey: process.env.WHOIS_API_KEY,
};
