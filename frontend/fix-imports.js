import fs from 'fs';
import path from 'path';

function updateImports(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      updateImports(fullPath);
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const updated = content
        .replace(/from '\.\.\/components\//g, "from '../../components/")
        .replace(/from "\.\.\/components\//g, 'from "../../components/')
        .replace(/from '\.\.\/services\//g, "from '../../services/")
        .replace(/from "\.\.\/services\//g, 'from "../../services/');
      if (updated !== content) {
        fs.writeFileSync(fullPath, updated, 'utf8');
        console.log(`Updated imports in: ${fullPath}`);
      }
    }
  }
}

updateImports('./src/pages/recruiter');
updateImports('./src/pages/admin');
console.log('Done normalizing imports.');
