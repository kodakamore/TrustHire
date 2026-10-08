import 'dotenv/config';
import { query } from '../config/database.js';

const main = async () => {
  const e = await query(`SELECT COUNT(*) AS n FROM recruiters WHERE email LIKE 'e2e-%' OR email LIKE 'wf-%'`);
  const a = await query(`SELECT COUNT(*) AS n FROM admins WHERE email LIKE 'e2e-%' OR email LIKE 'wf-%'`);
  const w = await query(`SELECT COUNT(*) AS n FROM job_advertisements WHERE title = 'Workflow Test Role'`);
  const c = await query(`SELECT COUNT(*) AS n FROM verification_checks vc
     WHERE NOT EXISTS (SELECT 1 FROM recruiters r WHERE r.id = vc.target_id)
       AND vc.target_type = 'recruiter'`);
  const m = await query(`SELECT COUNT(*) AS n FROM media_objects mo
     WHERE NOT EXISTS (SELECT 1 FROM recruiters r WHERE r.id = mo.owner_id)`);
  console.log(`stray test recruiters: ${e.rows[0].n}`);
  console.log(`stray test admins:     ${a.rows[0].n}`);
  console.log(`stray wf jobs:         ${w.rows[0].n}`);
  console.log(`orphan checks:         ${c.rows[0].n}`);
  console.log(`orphan media objects:  ${m.rows[0].n}`);
  const bad = [e, a, w, c, m].some((r) => Number(r.rows[0].n) > 0);
  console.log(bad ? '\n⚠️  FIXTURES LEFT BEHIND' : '\n✅ No test fixtures left behind');
  process.exit(bad ? 1 : 0);
};
main().catch((err) => { console.error(err.message); process.exit(1); });
