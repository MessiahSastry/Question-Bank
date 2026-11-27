'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

class Timestamp {
  constructor(ms) {this.ms = ms;}
  toMillis() {return this.ms;}
  toDate() {return new Date(this.ms);}
  static fromMillis(ms) {return new Timestamp(ms);}
}
function clone(value) {
  if (value instanceof Timestamp) return new Timestamp(value.ms);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}
const fields = {
  serverTimestamp: () => ({op: 'timestamp'}),
  increment: by => ({op: 'increment', by}),
  delete: () => ({op: 'delete'})
};
// Deliberately offline. Transactions stage their writes and commit atomically;
// this models application behaviour, not Firestore's locking implementation.
function memoryDb() {
  const data = new Map();
  let queue = Promise.resolve();
  const db = {data, failNextCommit: null, transactionCount: 0};
  function snapshot(ref) {
    const value = clone(data.get(ref.path));
    return {id: ref.id, ref, exists: value !== undefined,
      data: () => clone(value),
      get: field => field.split('.').reduce((v, k) => v?.[k], value)};
  }
  function apply(writes) {
    if (db.failNextCommit?.(writes)) {
      db.failNextCommit = null;
      throw new Error('Injected commit failure');
    }
    for (const write of writes) {
      const old = data.get(write.ref.path);
      if (write.type === 'create' && old !== undefined) throw Object.assign(new Error('exists'), {code: 6});
      if (write.type === 'delete') {data.delete(write.ref.path); continue;}
      const result = write.merge || write.type === 'update' ? clone(old || {}) : {};
      for (const [key, value] of Object.entries(write.value)) {
        if (value?.op === 'delete') delete result[key];
        else if (value?.op === 'timestamp') result[key] = Timestamp.fromMillis(Date.now());
        else if (value?.op === 'increment') result[key] = (Number(result[key]) || 0) + value.by;
        else result[key] = clone(value);
      }
      data.set(write.ref.path, result);
    }
  }
  function doc(p) {
    return {path: p, id: p.split('/').at(-1),
      collection: name => collection(p + '/' + name), get: async () => snapshot(doc(p)),
      set: async (value, options = {}) => apply([{ref: doc(p), value, ...options}]),
      create: async value => apply([{ref: doc(p), value, type: 'create'}]),
      delete: async () => apply([{ref: doc(p), type: 'delete'}])};
  }
  function collection(p, filters = [], limit = Infinity) {
    const query = {path: p, doc: id => doc(p + '/' + id),
      where: (key, op, value) => {
        if (op !== '==') throw new Error('Unsupported offline query');
        return collection(p, [...filters, [key, value]], limit);
      }, limit: n => collection(p, filters, n),
      get: async () => {
        const docs = [...data.keys()].filter(key => key.startsWith(p + '/') &&
          !key.slice(p.length + 1).includes('/')).map(key => snapshot(doc(key)))
          .filter(snap => filters.every(([key, value]) => snap.get(key) === value)).slice(0, limit);
        return {docs, size: docs.length, empty: !docs.length};
      }};
    return query;
  }
  db.collection = collection;
  db.runTransaction = fn => {
    const result = queue.then(async () => {
      db.transactionCount++;
      const writes = [];
      const tx = {get: ref => ref.get(),
        set: (ref, value, options = {}) => writes.push({ref, value, ...options}),
        update: (ref, value) => writes.push({ref, value, type: 'update'}),
        create: (ref, value) => writes.push({ref, value, type: 'create'})};
      const value = await fn(tx);
      apply(writes);
      return value;
    });
    queue = result.catch(() => {});
    return result;
  };
  return db;
}

function loadBackend(filename, {db = memoryDb(), decoded = {}, getUser, fetch, expose = ''} = {}) {
  const firestore = () => db;
  firestore.Timestamp = Timestamp;
  firestore.FieldValue = fields;
  const admin = {apps: [1], firestore,
    auth: () => ({verifyIdToken: async () => decoded,
      getUser: getUser || (async uid => ({uid, email: 'teacher@example.invalid'}))})};
  const cache = new Map();
  function load(file, extra = '') {
    const absolute = path.resolve(__dirname, '..', file);
    if (cache.has(absolute)) return cache.get(absolute);
    const module = {exports: {}};
    cache.set(absolute, module.exports);
    const context = {module, exports: module.exports, Buffer, URL, URLSearchParams, Date,
      setTimeout, clearTimeout, AbortSignal, fetch: fetch || (() => {throw new Error('Unexpected network request');}),
      console: {error() {}, warn() {}, log() {}},
      require: name => {
        if (name === 'firebase-admin') return admin;
        if (name === 'firebase-admin/app') return {getApps: () => [1], initializeApp() {}};
        if (name === 'firebase-admin/firestore') return {getFirestore: () => db, Timestamp, FieldValue: fields};
        if (name === 'firebase-admin/auth') return {getAuth: () => admin.auth()};
        if (name === 'firebase-functions/v2/https') return {onRequest: (_options, handler) => handler};
        if (name === 'firebase-functions/params') return {defineSecret: key => ({value: () =>
          key === 'ZOOM_TOKEN_ENCRYPTION_KEY' ? Buffer.alloc(32, 7).toString('base64') : 'test-secret'})};
        if (name.startsWith('./')) return load(name.slice(2) + (name.endsWith('.js') ? '' : '.js'));
        return require(name);
      }};
    vm.runInNewContext(fs.readFileSync(absolute, 'utf8') + extra, context, {filename: absolute});
    return module.exports;
  }
  return {exports: load(filename, expose), db};
}

function response() {
  const res = {statusCode: 200, body: null, headers: {},
    set(key, value) {this.headers[key] = value; return this;},
    status(code) {this.statusCode = code; return this;},
    json(value) {this.body = value; return this;},
    end() {return this;}, type() {return this;},
    send(value) {this.body = value; return this;},
    redirect(code, url) {this.statusCode = code; this.body = url; return this;}};
  return res;
}
function signedRequest(body) {
  const rawBody = Buffer.from(JSON.stringify(body)), timestamp = String(Math.floor(Date.now() / 1000));
  const signature = 'v0=' + crypto.createHmac('sha256', 'test-secret')
    .update('v0:' + timestamp + ':' + rawBody).digest('hex');
  const headers = {'x-zm-request-timestamp': timestamp, 'x-zm-signature': signature};
  return {method: 'POST', body, rawBody, headers,
    is: type => type === 'application/json', get: key => headers[key]};
}
module.exports = {Timestamp, memoryDb, loadBackend, response, signedRequest};
