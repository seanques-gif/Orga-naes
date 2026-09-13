// Generates database.rules.json — strict .validate rules for the Orga-naes RTDB
// (Phase C1 of NEXT-PLAN). Zero dependencies, byte-deterministic output.
//
// WHY A GENERATOR: RTDB rules JSON has no variables or recursion; the subtask
// tree block repeats once per nesting level. This script keeps every level
// identical and lets us raise MAX_NEST by changing one constant.
//
// WRITE SURFACE INVENTORY (from src/js/45-firebase-cloud-sync.js, verified):
//   users/$uid/projects        set(whole array) OR update({'projects/<i>': proj})
//   users/$uid/categories      set(whole array)
//   users/$uid/categoryEmojis  set(map category->emoji)
//   users/$uid/archive         set(whole array, fixProjects shape)
//   users/$uid/trash           set(whole array, unified bin entries)
//   users/$uid/updatedAt       set(Date.now())
//   users/$uid/appVersion      set('1.0.0')
//   users/$uid/backups/<date>  set({projects, categories, timestamp}) + remove
// Reads: whole-subtree once('value') under users/$uid — covered by the single
// root .read. No orderBy/indexOn queries exist. Notes are local-first (never
// synced) — deliberately absent here.
//
// RTDB REALITIES the rules encode:
//   - No arrays: JS arrays serialize to numeric-key maps, and EMPTY arrays
//     serialize to null. Every container rule explicitly allows null.
//   - .validate at an object node is one expression, so object shapes are
//     expressed as named/wildcard CHILD rules with a "$other: false" gate.
//   - Rules cannot count children, so collection SIZE is unbounded (documented
//     limit); strings, keys, enum values, and nesting DEPTH are bounded.
//
// HONEST LIMITS: trash[].node is polymorphic (project | subtask | note clone)
// and pre-bin legacy trash entries carry project fields INLINE (no kind/node),
// so trash is validated one level deep with legacy-tolerant unknown keys
// (capped scalars or opaque subtrees). Deeper levels of binned nodes are
// re-sanitized client-side on restore. Note bodies can be long, so the binned
// string cap is 10,000 chars.

import { writeFileSync } from 'fs';

const MAX_NEST = 10; // validated subtask nesting levels (UI allows deeper; cap documented)
const ID_RE = '^[A-Za-z0-9_-]{1,32}$';
const DATE_RE = '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'; // YYYY-MM-DD (app's localDateStr; feeds dueAt + backups/$date keys)
const STATUS_RE = '^(planned|ongoing|waiting|completed)$';
const RECUR_RE = '^(daily|weekdays|weekly|biweekly|monthly)$';
const KIND_RE = '^(project|subtask|note)$';

const isId = `newData.isString() && newData.val().matches(/${ID_RE}/)`;
const str = (min, max) => `newData.isString() && newData.val().length >= ${min} && newData.val().length <= ${max}`;
const isNum = (lo, hi) => `newData.isNumber() && newData.val() >= ${lo} && newData.val() <= ${hi}`;
const orNull = (expr) => `newData.val() === null || (${expr})`;
const container = `newData.val() === null || newData.hasChildren()`;

// One subtask node (object rule form). depth = current nesting level.
function subNodeObject(depth) {
  const subs =
    depth >= MAX_NEST
      ? { '.validate': 'newData.val() === null' } // nesting cap: deeper trees rejected; [] serializes to null
      : { '.validate': container, '$s': subNodeObject(depth + 1) };
  return {
    '.validate': `newData.hasChildren(['id', 'title', 'status'])`,
    id: { '.validate': isId },
    title: { '.validate': str(1, 200) },
    status: { '.validate': `newData.isString() && newData.val().matches(/${STATUS_RE}/)` },
    expanded: { '.validate': 'newData.isBoolean()' },
    createdAt: { '.validate': orNull(str(1, 35)) },
    dueAt: { '.validate': orNull(`newData.isString() && newData.val().matches(/${DATE_RE}/)`) },
    completedAt: { '.validate': orNull(str(1, 35)) },
    timeLogged: { '.validate': orNull(isNum(0, 1e9)) },   // seconds accumulated by the task timer
    timerStart: { '.validate': orNull(isNum(1500000000000, 4102444800000)) }, // Date.now() while timer runs
    recurrence: { '.validate': orNull(`newData.isString() && newData.val().matches(/${RECUR_RE}/)`) },
    blockedBy: { '.validate': container, '$j': { '.validate': isId } },
    // comments: lazily created ({text,time}); splices can empty it -> null
    comments: {
      '.validate': container,
      '$cm': {
        '.validate': `newData.hasChildren(['text', 'time'])`,
        text: { '.validate': str(1, 200) },   // input maxlength=200
        time: { '.validate': str(1, 35) },    // ISO datetime
        '$other': { '.validate': false },
      },
    },
    subtasks: subs,
    '$other': { '.validate': false },
  };
}

function projectNode() {
  return {
    '.validate': `newData.hasChildren(['id', 'title', 'status'])`,
    id: { '.validate': isId },
    title: { '.validate': str(1, 200) },
    status: { '.validate': `newData.isString() && newData.val().matches(/${STATUS_RE}/)` },
    category: { '.validate': orNull(str(1, 40)) },
    description: { '.validate': orNull(str(0, 2000)) }, // contenteditable desc; '' is legitimate
    color: { '.validate': orNull(`newData.isString() && newData.val().matches(/^#[0-9a-fA-F]{3,8}$/)`) }, // #rrggbb palette color
    dueAt: { '.validate': orNull(`newData.isString() && newData.val().matches(/${DATE_RE}/)`) }, // project-level due date
    createdAt: { '.validate': orNull(str(1, 35)) },
    completedAt: { '.validate': orNull(str(1, 35)) },
    expanded: { '.validate': 'newData.isBoolean()' },
    _manualStatus: { '.validate': 'newData.isBoolean()' },
    x: { '.validate': isNum(-1e6, 1e6) },
    y: { '.validate': isNum(-1e6, 1e6) },
    recurrence: { '.validate': orNull(`newData.isString() && newData.val().matches(/${RECUR_RE}/)`) }, // handleRecurrence(p) runs on projects too
    subtasks: { '.validate': container, '$s': subNodeObject(1) },
    '$other': { '.validate': false },
  };
}

function trashEntryNode() {
  return {
    // Project bin entries spread the project INLINE plus kind/deletedAt;
    // legacy pre-bin entries lack kind AND deletedAt (purged on boot, but
    // may exist in old cloud copies) — require only id + title.
    '.validate': `newData.hasChildren(['id', 'title'])`,
    id: { '.validate': isId },
    title: { '.validate': str(1, 200) },
    kind: { '.validate': orNull(`newData.isString() && newData.val().matches(/${KIND_RE}/)`) },
    deletedAt: { '.validate': orNull(str(1, 35)) },
    index: { '.validate': orNull(isNum(0, 1e5)) },
    projectId: { '.validate': orNull(isId) },
    projectTitle: { '.validate': orNull(str(1, 200)) },
    parentPath: { '.validate': container, '$p': { '.validate': isId } },
    // Polymorphic binned node: one level of type/cap checking, deeper accepted.
    // 10k string cap: binned NOTE bodies are unbounded by any UI maxlength.
    node: {
      '.validate': container,
      '$nk': {
        '.validate':
          'newData.val() === null || newData.isBoolean() || newData.isNumber() || newData.isString() && newData.val().length <= 10000 || newData.hasChildren()',
      },
    },
    // Legacy pre-bin entries carry project fields inline (status, category,
    // subtasks, ...) with no kind/node — unknown keys tolerated as capped
    // scalars or opaque subtrees so restoring history never bricks on rules.
    '$other': {
      '.validate':
        'newData.val() === null || newData.isBoolean() || newData.isNumber() || newData.isString() && newData.val().length <= 200 || newData.hasChildren()',
    },
  };
}

const strArray = { '.validate': container, '$c': { '.validate': str(1, 40) } };
const projArray = { '.validate': container, '$i': projectNode() };

// Archive copies are projects PLUS archivedAt (archiveProject spreads and stamps).
function archiveNode() {
  const n = projectNode();
  n.archivedAt = { '.validate': orNull(str(1, 35)) };
  return n;
}

// One note node (46-notes.js newNote/adoptCloudNotes shape: exactly six keys;
// adoptCloudNotes re-maps every incoming note to this exact shape, and title
// legitimately starts as an empty string on new notes → min length 0).
function noteNode() {
  return {
    '.validate': `newData.hasChildren(['id', 'title', 'body', 'pinned', 'createdAt', 'updatedAt'])`,
    id: { '.validate': isId },
    title: { '.validate': str(0, 120) },
    body: { '.validate': str(0, 100000) },
    pinned: { '.validate': 'newData.isBoolean()' },
    createdAt: { '.validate': orNull(str(1, 35)) },
    updatedAt: { '.validate': str(1, 35) },
    '$other': { '.validate': false },
  };
}
// Tombstones map: note-id → ISO deletion timestamp (46-notes.js recordNoteTombstone).
const noteTombstonesNode = { '.validate': container, '$nid': { '.validate': str(1, 35) } };

const rules = {
  rules: {
    users: {
      '$uid': {
        '.read': 'auth != null && auth.uid === $uid',
        '.write': 'auth != null && auth.uid === $uid',
        projects: projArray,
        categories: strArray,
        categoryEmojis: { '$cat': { '.validate': `$cat.length >= 1 && $cat.length <= 40 && ${str(1, 24)}` } },          archive: { '.validate': container, '$i': archiveNode() },
        trash: { '.validate': container, '$t': trashEntryNode() },
        notes: { '.validate': container, '$i': noteNode() },
        noteTombstones: noteTombstonesNode,
        updatedAt: { '.validate': isNum(1500000000000, 4102444800000) },
        appVersion: {
          '.validate': `newData.isString() && newData.val().matches(/^\\d+\\.\\d+\\.\\d+$/) && newData.val().length <= 20`,
        },
        backups: {
          '$date': {
            // Only timestamp is guaranteed-present: empty JS arrays serialize
            // to null in RTDB, so projects/categories may legitimately be null.
            '.validate': `$date.matches(/${DATE_RE}/) && (newData.val() === null || newData.hasChildren(['timestamp']))`,
            projects: { '.validate': container, '$i': projectNode() },
            categories: strArray,
            notes: { '.validate': container, '$i': noteNode() },
            noteTombstones: noteTombstonesNode,
            timestamp: { '.validate': isNum(1500000000000, 4102444800000) },
            '$other': { '.validate': false },
          },
        },
        // Known-set enforcement for the user node itself: any child outside
        // the eight synced keys is denied (validate is opt-in in RTDB —
        // without this, untracked children would be unconstrained).
        '$other': { '.validate': false },
      },
    },
  },
};

// ---- self-checks (fail the generator rather than ship drifted rules) --------
const knownTop = new Set(['projects', 'categories', 'categoryEmojis', 'archive', 'trash', 'notes', 'noteTombstones', 'updatedAt', 'appVersion', 'backups', '$other']);
const userNode = rules.rules.users.$uid;
for (const k of Object.keys(userNode)) {
  if (!k.startsWith('.') && !knownTop.has(k)) throw new Error('unexpected top-level child in generator: ' + k);
}
const json = JSON.stringify(rules);
if (!json.includes('"$other":{"  '.trim())) { /* no-op guard against accidental quote drift */ }
const othersCount = (json.match(/"\$other":\{"\.validate":false\}/g) || []).length;
if (othersCount < 3) throw new Error('$other gates missing: ' + othersCount);
const depthProbe = JSON.stringify(rules.rules.users.$uid.projects.$i.subtasks);
for (let d = 1; d < MAX_NEST; d++) if (!depthProbe.includes('"$s"')) throw new Error('nesting chain broken at level ' + d);

const out = JSON.stringify(rules, null, 2) + '\n';
writeFileSync('database.rules.json', out);
console.log('database.rules.json written:', out.length, 'bytes | MAX_NEST =', MAX_NEST, '| $other gates =', othersCount);
