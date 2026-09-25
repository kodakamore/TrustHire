import QRCode from 'qrcode';
import { generatePIN } from '../utils/pinGenerator.js';
import path from 'path';
import fs from 'fs';

export const generateVerificationCode = async (jobAdId, expiresAt) => {
  const pin = generatePIN();
  
  // URL pointing to public verifier page on consolidated port 3000
  const baseUrl = process.env.FRONTEND_URL || process.env.FRONTEND_RECRUITER_URL || 'http://localhost:3000';
  const qrCodeUrl = `${baseUrl}/v/${pin}`;
  
  // Save QR code image
  const qrcodesDir = path.join(process.cwd(), 'public', 'qrcodes');
  if (!fs.existsSync(qrcodesDir)) {
    fs.mkdirSync(qrcodesDir, { recursive: true });
  }

  const fileName = `qr_${pin}.png`;
  const filePath = path.join(qrcodesDir, fileName);
  const relativePath = `/public/qrcodes/${fileName}`;
  
  await QRCode.toFile(filePath, qrCodeUrl, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 300,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });

  return { pin, qrCodeUrl, qrCodeImagePath: relativePath };
};
