import { logEvent } from '../services/audit.service.js';

export const auditLogger = (eventType) => {
  return async (req, res, next) => {
    // Capture the original send to intercept the response
    const originalSend = res.send;
    res.send = function (body) {
      res.locals.body = body;
      originalSend.call(this, body);
    };

    res.on('finish', () => {
      // Only log on successful actions if needed, or log all
      const actorId = req.user?.id || req.admin?.id || null;
      const actorType = req.admin ? 'admin' : (req.user ? 'recruiter' : 'public');
      const details = {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
      };

      logEvent(eventType, actorId, actorType, null, null, details, req.ip, req.get('User-Agent'))
        .catch(err => console.error('Audit log failed', err));
    });

    next();
  };
};

export const logAuditEvent = logEvent;
