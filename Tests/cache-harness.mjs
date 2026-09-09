import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as crypto from 'node:crypto';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiled = new Map();
export const clone = value => JSON.parse(JSON.stringify(value));

function matches(pattern, key) {
    let regex = '^';
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];
        if (ch === '\\') regex += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        else if (ch === '*') regex += '.*';
        else if (ch === '?') regex += '.';
        else regex += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(regex + '$').test(key);
}

export class FakeRedis extends EventEmitter {
    status = 'ready';
    entries = new Map();
    calls = [];
    fail = new Set();
    now = 0;
    scanPages = new Map();
    check(method, args) {
        this.calls.push([method, ...args]);
        if (this.fail.has(method)) throw new Error(`simulated Redis ${method} failure`);
    }
    seed(key, value, ttl = 3600) {
        this.entries.set(key, { value: JSON.stringify(value), ttl, expires: this.now + ttl * 1000 });
    }
    value(key) {
        const entry = this.entries.get(key);
        if (entry?.expires <= this.now) this.entries.delete(key);
        return this.entries.get(key)?.value ?? null;
    }
    async get(key) { this.check('get', [key]); return this.value(key); }
    async incr(key) {
        this.check('incr', [key]);
        const result = Number(this.value(key) || 0) + 1;
        this.entries.set(key, { value: String(result), expires: Infinity });
        return result;
    }
    async eval(script, count, generationKey, key, generation, value, ttl) {
        this.check('eval', [script, count, generationKey, key, generation, value, ttl]);
        if ((this.value(generationKey) || '0') !== generation) return null;
        this.entries.set(key, { value, ttl: Number(ttl), expires: this.now + Number(ttl) * 1000 });
        return 'OK';
    }
    async del(...keys) { this.check('del', keys); keys.forEach(key => this.entries.delete(key)); return keys.length; }
    async scan(cursor, match, pattern, count, batchSize) {
        this.check('scan', [cursor, match, pattern, count, batchSize]);
        if (cursor === '0') this.scanPages.set(pattern, [...this.entries.keys()].filter(key => matches(pattern, key)));
        const all = this.scanPages.get(pattern);
        const start = Number(cursor), end = start + batchSize;
        return [end >= all.length ? '0' : String(end), all.slice(start, end)];
    }
    keys() { throw new Error('KEYS must never be used'); }
}

export const sound = { id: 'sound-1', title: 'Rain', status: 'live', mode: 'sleep', subcategory: 'weather', contains: ['rain'], animals: [], instruments: [], sound_sources: [], sort_score: 10, duration_seconds: 600 };
export const secondSound = { ...sound, id: 'sound-2', title: 'Wind', contains: ['wind'], sort_score: 5 };

export class FakeDb {
    calls = [];
    failAt = null;
    failTable = null;
    version = 1;
    handler = null;
    from(table) { return this.query(table); }
    rpc(name, params) { return this.query(name, params); }
    async execute(query) {
        this.calls.push(query);
        if (this.calls.length === this.failAt || query.table === this.failTable) return { data: null, error: { message: 'simulated database error' } };
        if (this.handler) {
            const result = await this.handler(query);
            if (result !== undefined) return result;
        }
        const eq = field => query.operations.find(op => op[0] === 'eq' && op[1] === field)?.[2];
        const mutation = query.operations.find(op => ['insert', 'update', 'upsert', 'delete'].includes(op[0]));
        const single = query.operations.some(op => op[0] === 'single' || op[0] === 'maybeSingle');
        const userId = eq('auth_user_id') === 'user-b' || eq('user_id') === 2 ? 2 : 1;
        const sounds = [{ ...sound, sort_score: this.version * 10 }, secondSound];
        let rows;
        switch (query.table) {
            case 'users': rows = [{ id: userId }]; break;
            case 'soundscapes': rows = eq('id') ? [sounds.find(s => s.id === eq('id'))].filter(Boolean) : sounds.filter(s => !query.operations.some(op => op[0] === 'neq' && op[1] === 'id' && op[2] === s.id)); break;
            case 'filter_soundscapes': rows = sounds.filter(s => !query.params.p_avoids?.includes(s.contains[0])); break;
            case 'collections': rows = [{ id: 'collection-1', title: 'Weather', is_published: true, sort_order: 1, explore_group: 'nature' }]; break;
            case 'collection_soundscapes': rows = [{ collection_id: 'collection-1', soundscape_id: 'sound-1', sort_order: 1 }]; break;
            case 'help_articles': rows = [{ id: 'article-1', slug: eq('slug') || 'start', category: 'Getting started', title: 'Start', body: 'Help text', sort_order: 1 }]; break;
            case 'user_sound_preferences': rows = [{ user_id: userId, preferred_sounds: [userId === 1 ? 'rain' : 'wind'], excluded_sounds: userId === 1 ? [] : ['rain'] }]; break;
            case 'user_onboarding': rows = [{ user_id: userId, goals: ['sleep'], starting_mode: 'sleep' }]; break;
            case 'user_favourites': rows = [{ id: `favourite-${userId}`, user_id: userId, soundscape_id: 'sound-1', created_at: '2026-09-07T00:00:00Z', soundscape: sounds[0] }]; break;
            case 'user_downloads': rows = [{ id: `download-${userId}`, user_id: userId, soundscape_id: 'sound-1', status: 'queued', soundscape: sounds[0] }]; break;
            case 'user_play_history': rows = [{ id: `play-${userId}-${this.version}`, user_id: userId, soundscape_id: 'sound-1', position_seconds: this.version * 10 * userId, played_at: `2026-09-07T00:00:0${this.version}Z`, soundscape: sounds[0] }]; break;
            case 'user_player_state': rows = [{ user_id: userId, soundscape_id: 'sound-1', position_seconds: 20 }]; break;
            default: rows = [];
        }
        if (mutation && mutation[0] !== 'delete') rows = [{ ...(rows[0] || {}), ...(Array.isArray(mutation[1]) ? mutation[1][0] : mutation[1]) }];
        return { data: clone(single ? rows[0] || null : rows), error: null };
    }
}
// Supabase builders are thenables; each chain retains its own table and filters.
FakeDb.prototype.query = function (table, params) {
    const query = { table, params, operations: [] }, db = this;
    const proxy = new Proxy({}, {
        get(_target, method) {
            if (method === 'then') return (resolve, reject) => db.execute(query).then(resolve, reject);
            return (...args) => { query.operations.push([method, ...args]); return proxy; };
        },
    });
    return proxy;
};

export async function harness({ redis = new FakeRedis(), db = new FakeDb() } = {}) {
    const logs = [];
    const context = vm.createContext({ setTimeout, clearTimeout, console: { warn: (...a) => logs.push(a), error: (...a) => logs.push(a), log() {} }, process: { env: {} } });
    const modules = new Map();
    function synthetic(id, exports) {
        const mod = new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context, identifier: id });
        modules.set(id, mod);
        return mod;
    }
    synthetic(path.join(root, 'Config', 'RedisConnection.ts'), { redis });
    synthetic(path.join(root, 'Config', 'Dbconnection.ts'), { supabaseAdmin: db, supabase: db, supabaseUrlValue: '', supabaseAnonKeyValue: '' });
    synthetic('node:crypto', crypto);
    synthetic('@supabase/supabase-js', { createClient: () => db });
    function getModule(id) {
        if (modules.has(id)) return modules.get(id);
        const file = id;
        if (!compiled.has(file)) compiled.set(file, ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText);
        const mod = new vm.SourceTextModule(compiled.get(file), { context, identifier: id });
        modules.set(id, mod);
        return mod;
    }
    async function load(relative) {
        const mod = getModule(path.join(root, relative));
        if (mod.status === 'unlinked') await mod.link((specifier, parent) => getModule(specifier.startsWith('.') ? path.resolve(path.dirname(parent.identifier), specifier) : specifier));
        if (mod.status === 'linked') await mod.evaluate();
        return mod.namespace;
    }
    async function invoke(file, name, request = {}) {
        const controller = await load('Controller/' + file + '.ts');
        const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = clone(body); this.bytes = JSON.stringify(body); return this; } };
        await controller[name]({ query: {}, params: {}, body: {}, user: { id: 'user-a' }, ...request }, response);
        return response;
    }
    return { redis, db, logs, load, invoke };
}

export const readCases = [
    ['Soundscape', 'GetAllSoundscapes', {}, 'soundscapes:all', 3600],
    ['Soundscape', 'GetSoundscapesByMode', { params: { mode: ' SLEEP ' } }, 'soundscapes:mode:sleep', 3600],
    ['Soundscape', 'GetOneSoundscape', { params: { id: 'sound-1' } }, 'soundscape:sound-1:details', 3600],
    ['Soundscape', 'GetSimilarSoundscapes', { params: { id: 'sound-1' } }, 'soundscape:sound-1:similar', 3600],
    ['Soundscape', 'GetCollections', {}, 'collections:all', 3600],
    ['Soundscape', 'GetPopularCollections', {}, 'collections:popular', 3600],
    ['Soundscape', 'GetOneCollection', { params: { id: 'collection-1' } }, 'collection:collection-1', 3600],
    ['Soundscape', 'GetExploreGroups', {}, 'explore:groups', 3600],
    ['Soundscape', 'GetLibrary', { user: undefined, query: { contains: 'rain,wind' } }, 'library:', 600],
    ['Help', 'GetHelpArticles', {}, 'help:all', 3600],
    ['Help', 'GetHelpArticle', { params: { slug: 'start' } }, 'help:start', 3600],
    ['Home', 'GetContinueListening', {}, 'user:user-a:continue-listening', 60],
    ['Recommendations', 'GetRecommendedNow', {}, 'user:user-a:home-recommended', 60],
    ['Recommendations', 'GetRecommendations', {}, 'user:user-a:recommendations', 60],
    ['Favourites', 'GetFavourites', {}, 'user:user-a:favourites', 60],
    ['PlayHistory', 'GetPlayHistory', {}, 'user:user-a:play-history', 60],
    ['Downloads', 'GetDownloads', {}, 'user:user-a:downloads', 60],
];
