// Rules shadow test (Phase C1) — validates the REAL database.rules.json
// against (a) payloads exactly as the app writes them, (b) adversarial
// payloads a malicious writer would try, and (c) the access matrix.
// Uses tests/rules-eval.mjs, a scoped evaluator for the generator's
// expression vocabulary. The Firebase engine remains the final authority;
// this test catches drift and shape gaps BEFORE anything reaches Firebase.
import { readFileSync } from 'fs';
import { validate, writeAllowed } from './rules-eval.mjs';

const rules = JSON.parse(readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8'));
const ROOT = rules.rules;

const pass = [], fail = [];
function check(name, cond, detail) {
  (cond ? pass : fail).push(name + (cond || detail === undefined ? '' : ' — ' + detail));
}
const U = 'users/testuid';
const OK = (r) => r.ok === true;
const DENIED = (r) => r.ok === false;

// ---- realistic client payloads (shapes straight from src/) -------------------
const now = new Date().toISOString();
function mkSub(id, title, status, subs = [], extra = {}) {
  return Object.assign({ id, title, status, expanded: false, createdAt: now, dueAt: null, completedAt: null, recurrence: null, subtasks: subs }, extra);
}
function mkProject(id, title, status, subs = [], extra = {}) {
  return Object.assign({ id, title, status, category: null, createdAt: now, completedAt: null, expanded: false, x: 0, y: 0, subtasks: subs }, extra);
}

const projA = mkProject('pA1x9zQr', 'Kitchen', 'ongoing', [
  mkSub('sA1bbbbbb', 'Demolition', 'completed', [], { completedAt: now, comments: [{ text: 'Done Tuesday', time: now }] }),
  mkSub('sA2cccccc', 'Painting', 'planned', [], { recurrence: 'weekly', blockedBy: ['sA1bbbbbb'] }),
  mkSub('sA3dddddd', 'Parents', 'planned', [mkSub('sA3eeeeee', 'Nested deep', 'ongoing')], { dueAt: '2026-09-30' }),
]);
const projB = mkProject('pB2yyyyyy', 'Garden', 'planned', [], { _manualStatus: true });

check('real: full projects set (whole-array)', OK(validate(ROOT, U + '/projects', [projA, projB])), JSON.stringify(validate(ROOT, U + '/projects', [projA, projB])));
check('real: index-keyed partial update path', OK(validate(ROOT, U + '/projects/0', projA)));
check('real: empty array serializes to null', OK(validate(ROOT, U + '/projects', null)));
check('real: categories set', OK(validate(ROOT, U + '/categories', ['Home', 'Work'])));
check('real: categories emptied to null', OK(validate(ROOT, U + '/categories', null)));
check('real: categoryEmojis map', OK(validate(ROOT, U + '/categoryEmojis', { 'Home': '🏠' })));
check('real: updatedAt (Date.now)', OK(validate(ROOT, U + '/updatedAt', 1789261215842)));
check('real: appVersion', OK(validate(ROOT, U + '/appVersion', '1.0.0')));
check('real: archive entry with archivedAt', OK(validate(ROOT, U + '/archive', [Object.assign({}, projA, { archivedAt: now })])));
check('real: trash project (inline spread)', OK(validate(ROOT, U + '/trash', [Object.assign({}, JSON.parse(JSON.stringify(projA)), { kind: 'project', deletedAt: now })])));
check('real: trash subtask entry', OK(validate(ROOT, U + '/trash', [{
  kind: 'subtask', id: 'sA2cccccc', title: 'Painting', node: mkSub('sA2cccccc', 'Painting', 'planned'),
  projectId: 'pA1x9zQr', projectTitle: 'Kitchen', parentPath: ['pA1x9zQr'], index: 1, deletedAt: now,
}])));
check('real: trash note entry (long body OK)', OK(validate(ROOT, U + '/trash', [{
  kind: 'note', id: 'nA1xxxxxx', title: 'Note', node: { id: 'nA1xxxxxx', title: 'Note', body: 'x'.repeat(9000), pinned: false }, deletedAt: now,
}])));
check('real: legacy trash entry (no kind/deletedAt)', OK(validate(ROOT, U + '/trash', [mkProject('pOld1zzzz', 'Ancient', 'completed')])));

// notes cloud sync (46-notes.js newNote/adoptCloudNotes shape)
function mkNote(id, title, body, extra = {}) {
  return Object.assign({ id, title, body, pinned: false, createdAt: now, updatedAt: now }, extra);
}
const noteA = mkNote('nA1xxxxxx', 'Renovation ideas', 'Kitchen ideas @project:pA1x9zQr and more');
const noteB = mkNote('nB2yyyyyy', '', 'x'.repeat(90000)); // long body within cap
check('real: full notes set (whole-array)', OK(validate(ROOT, U + '/notes', [noteA, noteB])), JSON.stringify(validate(ROOT, U + '/notes', [noteA, noteB]).error || ''));
check('real: index-keyed partial note update', OK(validate(ROOT, U + '/notes/0', noteA)));
check('real: empty notes set serializes to null', OK(validate(ROOT, U + '/notes', null)));
check('real: note with empty title (new note)', OK(validate(ROOT, U + '/notes/0', mkNote('nC3zzzzzz', '', 'just a body'))));
check('real: noteTombstones map', OK(validate(ROOT, U + '/noteTombstones', { nOld12345: now, nOld67890: now })));
check('real: noteTombstones emptied to null', OK(validate(ROOT, U + '/noteTombstones', null)));
check('real: firebase auto-backup snapshot', OK(validate(ROOT, U + '/backups/2026-09-13', {
  projects: [projA, projB], categories: ['Home'], notes: [noteA], noteTombstones: { nOld12345: now }, timestamp: 1789261215842,
})));
check('real: backup in older format (no notes key)', OK(validate(ROOT, U + '/backups/2026-09-12', {
  projects: [projA], categories: [], timestamp: 1789261215842,
})));
check('real: backup day removed (null)', OK(validate(ROOT, U + '/backups/2026-09-13', null)));

// nested subtask depth: MAX_NEST=10 levels must pass, 11 must fail
let deep = mkSub('sDeep' + 10, 'L10', 'planned');
for (let d = 9; d >= 1; d--) deep = mkSub('sDeep' + d, 'L' + d, 'planned', [deep]);
check('real: nesting at cap (10 levels) accepted', OK(validate(ROOT, U + '/projects', [mkProject('pDeep1234', 'Deep', 'planned', [deep])])));
let overDeep = mkSub('sOver' + 11, 'L11', 'planned');
for (let d = 10; d >= 1; d--) overDeep = mkSub('sOver' + d, 'L' + d, 'planned', [overDeep]);
check('real: nesting beyond cap rejected', DENIED(validate(ROOT, U + '/projects', [mkProject('pOver1234', 'Over', 'planned', [overDeep])])));

// ---- adversarial payloads (must all be DENIED) -------------------------------
const deny = (name, path, data) => check('deny: ' + name, DENIED(validate(ROOT, path, data)));
deny('project with unknown key', U + '/projects/0', mkProject('pEvil1aaa', 'X', 'planned', [], { isAdmin: true }));
deny('status enum breakout', U + '/projects/0', mkProject('pEvil2bbb', 'X', 'hacked'));
deny('oversized title', U + '/projects/0', mkProject('pEvil3ccc', 'x'.repeat(201), 'planned'));
deny('bad id charset', U + '/projects/0', mkProject('p;drop--', 'X', 'planned'));
deny('bad dueAt format (ISO datetime in date field)', U + '/projects/0', mkProject('pEvil4ddd', 'X', 'planned', [], { dueAt: '2026-09-13T10:00:00.000Z' }));
deny('bad recurrence value', U + '/projects/0', mkProject('pEvil5eee', 'X', 'planned', [], { recurrence: 'always' }));
deny('string in x coordinate', U + '/projects/0', mkProject('pEvil6fff', 'X', 'planned', [], { x: '999' }));
deny('blockedBy with junk entry', U + '/projects/0', mkProject('pEvil7ggg', 'X', 'planned', [], { blockedBy: ['okid123456', '<script>'] }));
deny('comment oversized text', U + '/projects/0', mkProject('pEvil8hhh', 'X', 'planned', [mkSub('sEvil1aaa', 'S', 'planned', [], { comments: [{ text: 'x'.repeat(201), time: now }] })]));
deny('subtask unknown key', U + '/projects/0', mkProject('pEvil9iii', 'X', 'planned', [mkSub('sEvil2bbb', 'S', 'planned', [], { role: 'admin' })]));
deny('note unknown key', U + '/notes/0', mkNote('nEvil1aaa', 'X', 'body', { isAdmin: true }));
deny('note missing body', U + '/notes/0', { id: 'nEvil2bbb', title: 'X', pinned: false, createdAt: now, updatedAt: now });
deny('note oversized body (100001)', U + '/notes/0', mkNote('nEvil3ccc', 'X', 'x'.repeat(100001)));
deny('note title over 120', U + '/notes/0', mkNote('nEvil4ddd', 'x'.repeat(121), 'b'));
deny('note bad id charset', U + '/notes/0', mkNote('n;drop--', 'X', 'b'));
deny('note pinned as string', U + '/notes/0', mkNote('nEvil5eee', 'X', 'b', { pinned: 'yes' }));
deny('noteTombstones with junk value', U + '/noteTombstones', { nEvil6fff: 'x'.repeat(36) });
deny('noteTombstones scalar', U + '/noteTombstones', 'junk');
deny('top-level unknown child', U + '/isAdmin', true);
check('deny: write access to another uid', !writeAllowed(ROOT, 'users/otheruid/projects', { uid: 'testuid' }));
check('deny: unauthenticated write', !writeAllowed(ROOT, U + '/projects', null));
check('allow: owner write', writeAllowed(ROOT, U + '/projects', { uid: 'testuid' }));
check('allow: owner write nested path', writeAllowed(ROOT, U + '/backups/2026-09-13/projects/0', { uid: 'testuid' }));
deny('updatedAt absurd (0 = forge old timestamp)', U + '/updatedAt', 0);
deny('updatedAt string', U + '/updatedAt', 'not-a-number');
deny('appVersion junk', U + '/appVersion', 'v1; DROP TABLE users');
deny('backup day key not a date', U + '/backups/notadate', { projects: [], categories: [], timestamp: 1789261215842 });
deny('backup with unknown child', U + '/backups/2026-09-13', { projects: [], categories: [], timestamp: 1789261215842, injected: {} });
deny('emoji map junk key (>40 chars)', U + '/categoryEmojis', { ['x'.repeat(41)]: 'x' });
deny('categories with junk member', U + '/categories', ['Home', 'x'.repeat(41)]);
deny('projects scalar instead of list', U + '/projects', 'oops');
deny('array member not an object', U + '/projects', [42]);

// empty-object edge: {} writes null on delete paths — container rule allows null
check('real: whole-subtree delete (projects null)', OK(validate(ROOT, U + '/projects', null)));

// ---- real production export (pre-publish gate, Step 11a) ----------------------
// Replays the ACTUAL cloud export through the rules so a publish can never
// reject something the app has really written. Skips cleanly if no export is
// present (fresh clones); validates every user, collection, and backup date.
try {
  const exportPath = new URL('../orga-naes-default-rtdb-export.json', import.meta.url);
  const exp = JSON.parse(readFileSync(exportPath, 'utf8'));
  let expChecks = 0;
  for (const [uid, u] of Object.entries(exp.users || {})) {
    const RU = 'users/' + uid;
    check('export: stranger cannot write ' + uid.slice(0, 6), !writeAllowed(ROOT, RU + '/projects', { uid: 'stranger' }) && writeAllowed(ROOT, RU + '/projects', { uid }));
    for (const [k, val] of Object.entries(u)) {
      if (k === 'users') { console.log('  (legacy stray users/$uid/users node present — duplicate fragment, delete in console during 11b)'); continue; }
      if (k === 'backups') {
        for (const [date, snap] of Object.entries(val || {})) check('export: backup ' + date, OK(validate(ROOT, RU + '/backups/' + date, snap)));
      } else {
        check('export: ' + k + ' (' + uid.slice(0, 6) + ')', OK(validate(ROOT, RU + '/' + k, val)));
      }
      expChecks++;
    }
  }
  console.log('  (production export replay: ' + expChecks + ' user nodes)');
} catch (e) {
  if (!/ENOENT/.test(String(e))) throw e; // no export present = fine
}

// ---- determinism: regenerate and byte-compare (drift gate) -------------------
import { execFileSync } from 'child_process';
const before = readFileSync(new URL('../database.rules.json', import.meta.url));
execFileSync(process.execPath, ['scripts/gen-rtdb-rules.mjs'], { stdio: 'ignore' });
const after = readFileSync(new URL('../database.rules.json', import.meta.url));
check('gen: byte-deterministic regeneration', before.equals(after));

console.log('Rules shadow suite: ' + pass.length + ' passed, ' + fail.length + ' failed');
if (fail.length) { console.error('FAILURES:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('OK — database.rules.json matches the real write surface, rejects adversarial shapes');
process.exit(0);
