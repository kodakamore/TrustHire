import crypto from 'crypto';

export const hashJobData = (jobObject) => {
  const { title, description, company_id, location, employment_type, salary_range } = jobObject;
  const dataString = JSON.stringify({ title, description, company_id, location, employment_type, salary_range });
  return crypto.createHash('sha256').update(dataString).digest('hex');
};

export const verifyJobHash = (jobObject, storedHash) => {
  const currentHash = hashJobData(jobObject);
  return currentHash === storedHash;
};
