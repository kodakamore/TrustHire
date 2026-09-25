import crypto from 'crypto';

export const generatePIN = () => {
  // Excludes 0, O, I, L, 1 to prevent ambiguity
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let pin = '';
  for (let i = 0; i < 8; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    pin += chars[randomIndex];
  }
  return `VRF-${pin.slice(0, 4)}-${pin.slice(4)}`;
};
