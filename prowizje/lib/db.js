// Prosta baza w pliku JSON: zapis atomowy (plik tymczasowy + rename) i dzienna kopia zapasowa.
import fs from 'node:fs';
import path from 'node:path';

export function openDb(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'db.json');
  const backups = path.join(dir, 'kopie');
  const loaded = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const data = { users: [], sessions: {}, entries: [], parking: {}, settings: null, ...loaded };

  function backup() {
    if (!fs.existsSync(file)) return;
    const day = new Date().toISOString().slice(0, 10);
    const target = path.join(backups, `db-${day}.json`);
    if (fs.existsSync(target)) return;
    fs.mkdirSync(backups, { recursive: true });
    fs.copyFileSync(file, target);
  }

  function save() {
    try { backup(); } catch (e) { console.warn('Kopia zapasowa nie powiodła się:', e.message); }
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    try {
      fs.renameSync(tmp, file);
    } catch {
      // Windows potrafi zablokować rename (np. antywirus) — zapis bezpośredni jako rezerwa
      fs.writeFileSync(file, JSON.stringify(data));
      fs.rmSync(tmp, { force: true });
    }
  }

  return { data, save, file };
}
