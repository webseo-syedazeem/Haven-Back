import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, FakeRedis, clone, readCases, sound } from './cache-harness.mjs';

for (const [file, name, request, keyPrefix, ttl] of readCases) {
    test(`${name}: cold DB read, Redis hit, TTL expiry, and Redis failure fallback`, async () => {
        const h = await harness();
        const cold = await h.invoke(file, name, request);
        assert.equal(cold.statusCode, 200);
        assert.equal(cold.body.success, true);
        const queries = h.db.calls.length;
        assert.ok(queries > 0);
        const key = [...h.redis.entries.keys()].find(key => key.startsWith(keyPrefix));
        assert.ok(key, `missing ${keyPrefix}`);
        assert.equal(h.redis.entries.get(key).ttl, ttl);
        assert.equal('success' in JSON.parse(h.redis.value(key)), false, 'only DATA is cached');
        const hot = await h.invoke(file, name, request);
        assert.equal(hot.bytes, cold.bytes);
        assert.equal(h.db.calls.length, queries, 'a warm GET must skip all controller DB queries');
        h.redis.now += ttl * 1000 + 1;
        await h.invoke(file, name, request);
        assert.ok(h.db.calls.length > queries);
        for (const failure of ['get', 'eval']) {
            const failing = await harness();
            failing.redis.fail.add(failure);
            const response = await failing.invoke(file, name, request);
            assert.equal(response.statusCode, 200);
            assert.equal(response.bytes, cold.bytes);
            assert.ok(failing.db.calls.length > 0);
            assert.equal(failing.redis.value(key), null);
        }
    });
    test(`${name}: errors at every DB step never populate the cache`, async () => {
        const control = await harness();
        await control.invoke(file, name, request);
        for (let failAt = 1; failAt <= control.db.calls.length; failAt++) {
            const h = await harness();
            h.db.failAt = failAt;
            await h.invoke(file, name, request);
            assert.equal([...h.redis.entries.keys()].filter(key => key !== 'cache:read-generation').length, 0, `cached partial result at query ${failAt}`);
        }
    });
}

test('all six personalized GETs isolate two users and ignore spoofed query/body IDs', async () => {
    for (const [file, name, request, prefix] of readCases.filter(row => row[3].startsWith('user:'))) {
        const h = await harness();
        const a = await h.invoke(file, name, { ...request, query: { userId: 'user-b' }, body: { user_id: 'user-b' } });
        const b = await h.invoke(file, name, { ...request, user: { id: 'user-b' } });
        assert.notEqual(a.bytes, b.bytes, name);
        assert.ok(h.redis.value(prefix));
        assert.ok(h.redis.value(prefix.replace('user-a', 'user-b')));
        const count = h.db.calls.length;
        assert.equal((await h.invoke(file, name, request)).bytes, a.bytes);
        assert.equal(h.db.calls.length, count);
    }
});

test('anonymous recommendations bypass Redis; recommendation counts have distinct keys', async () => {
    const h = await harness();
    for (const name of ['GetRecommendations', 'GetRecommendedNow']) {
        for (const id of [undefined, '']) await h.invoke('Recommendations', name, { user: id === undefined ? undefined : { id } });
    }
    assert.equal(h.redis.entries.size, 0);
    await h.invoke('Recommendations', 'GetRecommendations');
    const noAlternatives = await h.invoke('Recommendations', 'GetRecommendations', { query: { count: '0' } });
    assert.deepEqual(noAlternatives.body.data.alternatives, []);
    assert.ok(h.redis.value('user:user-a:recommendations'));
    assert.ok(h.redis.value('user:user-a:recommendations:count:0'));
    const helper = await h.load('Utils/CacheHelper.ts');
    await helper.invalidatePreferences('user-a');
    assert.equal(h.redis.value('user:user-a:recommendations:count:0'), null);
});

test('library reuses normalized filter sets but echoes this request and preserves SQL case sensitivity', async () => {
    const h = await harness();
    const request = { user: undefined, query: { contains: 'Rain,wind,Rain', modes: 'sleep,focus', sort: 'a_z' } };
    const first = await h.invoke('Soundscape', 'GetLibrary', request);
    const count = h.db.calls.length;
    const second = await h.invoke('Soundscape', 'GetLibrary', { user: undefined, query: { modes: 'focus,sleep', contains: ['wind', 'rain'], sort: 'a_z' } });
    assert.equal(h.db.calls.length, count);
    assert.deepEqual(second.body.data.soundscapes, first.body.data.soundscapes);
    assert.deepEqual(second.body.data.applied_filters.contains, ['wind', 'rain']);
    assert.deepEqual(first.body.data.applied_filters.contains, ['Rain', 'wind']);
    const helper = await h.load('Utils/CacheHelper.ts');
    assert.notEqual(helper.libraryCacheKey({ modes: ['SLEEP'] }), helper.libraryCacheKey({ modes: ['sleep'] }));
    assert.notEqual(helper.libraryCacheKey({ detail_levels: ['RICH'] }), helper.libraryCacheKey({ detail_levels: ['rich'] }));
    assert.notEqual(helper.libraryCacheKey({ min_duration: 1 }), helper.libraryCacheKey({ min_duration: 2 }));
    assert.notEqual(helper.libraryCacheKey({ sort: 'a_z' }), helper.libraryCacheKey({ sort: 'most_saved' }));
});

test('library includes effective exclusions and preferences are resolved afresh on every request', async () => {
    const h = await harness();
    const a = await h.invoke('Soundscape', 'GetLibrary');
    const b = await h.invoke('Soundscape', 'GetLibrary', { user: { id: 'user-b' } });
    assert.notDeepEqual(a.body.data.soundscapes, b.body.data.soundscapes);
    const rpcCalls = h.db.calls.filter(q => q.table === 'filter_soundscapes').length;
    await h.invoke('Soundscape', 'GetLibrary', { user: { id: 'user-b' } });
    assert.equal(h.db.calls.filter(q => q.table === 'filter_soundscapes').length, rpcCalls);
    h.db.handler = q => q.table === 'user_sound_preferences' ? { data: { excluded_sounds: ['wind'] }, error: null } : undefined;
    const changed = await h.invoke('Soundscape', 'GetLibrary', { user: { id: 'user-b' } });
    assert.deepEqual(changed.body.data.applied_filters.avoids, ['wind']);
    assert.equal(h.db.calls.filter(q => q.table === 'filter_soundscapes').length, rpcCalls + 1);
});

test('search/suggestions/help search remain uncached and help slug all cannot collide with the list', async () => {
    const h = await harness();
    for (const [file, name] of [['Soundscape', 'SearchSoundscapes'], ['Soundscape', 'GetSearchSuggestions'], ['Help', 'GetHelpArticles']]) {
        await h.invoke(file, name, { query: { q: 'rain' } });
        await h.invoke(file, name, { query: { q: 'wind' } });
    }
    assert.equal(h.redis.entries.size, 0);
    await h.invoke('Help', 'GetHelpArticles');
    const article = await h.invoke('Help', 'GetHelpArticle', { params: { slug: 'all' } });
    assert.equal(article.body.data.article.slug, 'all');
    assert.ok(h.redis.value('help:all'));
    assert.ok(h.redis.value('help:article:all'));
});

const userWrites = [
    ['Favourites', 'AddFavourite', { body: { soundscape_id: 'sound-1' } }, ['favourites', 'recommendations', 'home-recommended']],
    ['Favourites', 'RemoveFavourite', { params: { soundscapeId: 'sound-1' } }, ['favourites', 'recommendations', 'home-recommended']],
    ['PlayHistory', 'AddPlayHistory', { body: { soundscape_id: 'sound-1' } }, ['play-history', 'continue-listening', 'recommendations', 'home-recommended']],
    ['Player', 'UpsertPlayerState', { body: { soundscape_id: 'sound-1', position_seconds: 20 } }, ['continue-listening']],
    ['Downloads', 'CreateDownload', { body: { soundscape_id: 'sound-1' } }, ['downloads']],
    ['Downloads', 'UpdateDownloadStatus', { params: { soundscapeId: 'sound-1' }, body: { status: 'completed' } }, ['downloads']],
    ['Downloads', 'DeleteDownload', { params: { soundscapeId: 'sound-1' } }, ['downloads']],
    ['Downloads', 'DeleteAllDownloads', {}, ['downloads']],
    ['Preferences', 'UpdateSoundPreferences', { body: { excluded_sounds: ['rain'] } }, ['recommendations', 'home-recommended', 'continue-listening']],
    ['Onboarding', 'PostOnboarding', { body: { goals: ['sleep'], starting_mode: 'sleep', excluded_sounds: ['rain'] } }, ['recommendations', 'home-recommended', 'continue-listening']],
];
for (const [file, name, request, suffixes] of userWrites) {
    test(`${name}: invalidate the writing user's keys before response, keep other users`, async () => {
        const h = await harness();
        if (name === 'AddFavourite') h.db.handler = q => q.table === 'user_favourites' && !q.operations.some(op => op[0] === 'insert') ? { data: null, error: null } : undefined;
        for (const suffix of suffixes) for (const user of ['user-a', 'user-b']) {
            h.redis.seed(`user:${user}:${suffix}`, { stale: true });
            h.redis.seed(`user:${user}:${suffix}:count:0`, { stale: true });
        }
        const response = await h.invoke(file, name, request);
        assert.equal(response.body.success, true, response.bytes);
        for (const suffix of suffixes) {
            assert.equal(h.redis.value(`user:user-a:${suffix}`), null);
            assert.equal(h.redis.value(`user:user-a:${suffix}:count:0`), null);
            assert.ok(h.redis.value(`user:user-b:${suffix}`));
        }
    });
}

test('recording a play clears BOTH histories, then reopening refetches and recaches the new play', async () => {
    const h = await harness();
    const original = await h.invoke('Home', 'GetContinueListening');
    await h.invoke('PlayHistory', 'GetPlayHistory');
    h.db.version = 2;
    await h.invoke('PlayHistory', 'AddPlayHistory', { body: { soundscape_id: 'sound-1', position_seconds: 20 } });
    assert.equal(h.redis.value('user:user-a:continue-listening'), null);
    assert.equal(h.redis.value('user:user-a:play-history'), null);
    const reopened = await h.invoke('Home', 'GetContinueListening');
    assert.notEqual(reopened.bytes, original.bytes);
    assert.equal(reopened.body.data.items[0].position_seconds, 20);
    await h.invoke('PlayHistory', 'GetPlayHistory');
    const count = h.db.calls.length;
    assert.equal((await h.invoke('Home', 'GetContinueListening')).bytes, reopened.bytes);
    await h.invoke('PlayHistory', 'GetPlayHistory');
    assert.equal(h.db.calls.length, count);
});

test('SCAN traverses multiple pages; prefix deletion does not touch unrelated keys', async () => {
    const h = await harness(), helper = await h.load('Utils/CacheHelper.ts');
    for (let i = 0; i < 450; i++) h.redis.seed(`library:${i}`, { i });
    h.redis.seed('unrelated', { keep: true });
    await helper.deleteByPrefix('library:');
    assert.equal([...h.redis.entries.keys()].filter(key => key.startsWith('library:')).length, 0);
    assert.ok(h.redis.calls.filter(call => call[0] === 'scan').length >= 3);
    assert.ok(h.redis.value('unrelated'));
});

test('an in-flight cold read cannot restore stale data after another process invalidates', async () => {
    const redis = new FakeRedis();
    const reader = await harness({ redis }), writer = await harness({ redis });
    const a = await reader.load('Utils/CacheHelper.ts'), b = await writer.load('Utils/CacheHelper.ts');
    let release, started;
    const began = new Promise(resolve => { started = resolve; });
    const oldRead = a.remember('soundscapes:all', 3600, () => { started(); return new Promise(resolve => { release = resolve; }); });
    await began;
    await b.invalidateSoundscapes();
    release({ old: true });
    await oldRead;
    assert.equal(redis.value('soundscapes:all'), null);
    assert.deepEqual(clone(await a.remember('soundscapes:all', 3600, async () => ({ fresh: true }))), { fresh: true });
});

test('failed deletion bypasses stale cache and retries on recovery; Redis errors never fail writes', async () => {
    const h = await harness();
    await h.invoke('Home', 'GetContinueListening');
    h.redis.fail.add('del');
    h.db.version = 2;
    const write = await h.invoke('Player', 'UpsertPlayerState', { body: { soundscape_id: 'sound-1', position_seconds: 20 } });
    assert.equal(write.statusCode, 200);
    const fresh = await h.invoke('Home', 'GetContinueListening');
    assert.equal(fresh.body.data.items[0].position_seconds, 20);
    h.redis.fail.clear();
    const recovered = await h.invoke('Home', 'GetContinueListening');
    assert.equal(recovered.bytes, fresh.bytes);
    const count = h.db.calls.length;
    await h.invoke('Home', 'GetContinueListening');
    assert.equal(h.db.calls.length, count);
});

test('corrupt JSON, offline Redis, and a hung command all fall back to DB', async () => {
    const h = await harness();
    h.redis.entries.set('soundscapes:all', { value: '{bad', expires: Infinity });
    assert.equal((await h.invoke('Soundscape', 'GetAllSoundscapes')).statusCode, 200);
    h.redis.status = 'reconnecting';
    assert.equal((await h.invoke('Soundscape', 'GetAllSoundscapes')).statusCode, 200);
    h.redis.status = 'ready';
    h.redis.get = () => new Promise(() => {});
    const start = Date.now();
    assert.equal((await h.invoke('Soundscape', 'GetAllSoundscapes')).statusCode, 200);
    assert.ok(Date.now() - start < 1500, 'request must not wait for reconnect retries');
});

const soundscapeKeys = ['soundscapes:all', 'soundscapes:mode:sleep', 'soundscapes:mode:focus', 'soundscape:sound-1:details', 'soundscape:sound-2:similar', 'library:filters', 'collections:all', 'collections:popular', 'collection:collection-1', 'explore:groups', 'user:user-a:favourites', 'user:user-b:continue-listening', 'user:user-b:home-recommended', 'user:user-a:recommendations:count:0', 'user:user-a:play-history', 'user:user-a:downloads'];
const collectionKeys = ['collections:all', 'collections:popular', 'collection:collection-1', 'explore:groups'];
const helpKeys = ['help:all', 'help:start', 'help:old-slug', 'help:new-slug'];
const adminWrites = [
    ['Admin', 'CreateAdminSoundscape', { body: { mode: 'sleep', subcategory: 'weather', title: 'Rain' } }, soundscapeKeys],
    ['Admin', 'UpdateAdminSoundscape', { params: { id: 'sound-1' }, body: { mode: 'focus' } }, soundscapeKeys],
    ['Admin', 'UpdateAdminSoundscapeStatus', { params: { id: 'sound-1' }, body: { status: 'retired' } }, soundscapeKeys],
    ['Admin', 'DeleteAdminSoundscape', { params: { id: 'sound-1' } }, soundscapeKeys],
    ['Admin', 'ReviseAdminSoundscape', { params: { id: 'sound-1' } }, soundscapeKeys],
    ['Admin', 'CreateAdminCollection', { body: { slug: 'weather', title: 'Weather' } }, collectionKeys],
    ['Admin', 'UpdateAdminCollection', { params: { id: 'collection-1' }, body: { title: 'Rain' } }, collectionKeys],
    ['Admin', 'PublishAdminCollection', { params: { id: 'collection-1' }, body: { is_published: false } }, collectionKeys],
    ['Admin', 'AddAdminCollectionSoundscape', { params: { id: 'collection-1' }, body: { soundscape_id: 'sound-1', sort_order: 0 } }, collectionKeys],
    ['Admin', 'RemoveAdminCollectionSoundscape', { params: { id: 'collection-1' }, body: {} }, collectionKeys],
    ['Help', 'CreateAdminHelpArticle', { body: { slug: 'start', category: 'Help', title: 'Start', body: 'Help text' } }, helpKeys],
    ['Help', 'UpdateAdminHelpArticle', { params: { id: 'article-1' }, body: { slug: 'new-slug' } }, helpKeys],
    ['Help', 'PublishAdminHelpArticle', { params: { id: 'article-1' }, body: { is_published: false } }, helpKeys],
    ['Help', 'DeleteAdminHelpArticle', { params: { id: 'article-1' } }, helpKeys],
];
for (const [file, name, request, keys] of adminWrites) {
    test(`${name}: clears all affected global caches and preserves unrelated entries`, async () => {
        const h = await harness();
        if (name === 'DeleteAdminSoundscape') h.db.handler = q => q.table === 'soundscapes' ? { data: { ...sound, status: 'draft' }, error: null } : undefined;
        for (const key of keys) h.redis.seed(key, { stale: true });
        h.redis.seed('unrelated', { keep: true });
        const result = await h.invoke(file, name, request);
        assert.equal(result.body.success, true, result.bytes);
        for (const key of keys) assert.equal(h.redis.value(key), null, key);
        assert.ok(h.redis.value('unrelated'));
    });
}

test('collection membership still invalidates when its later timestamp update fails', async () => {
    for (const name of ['AddAdminCollectionSoundscape', 'RemoveAdminCollectionSoundscape']) {
        const h = await harness();
        h.db.handler = q => q.table === 'collections' && q.operations.some(op => op[0] === 'update') ? { data: null, error: { message: 'touch failed' } } : undefined;
        for (const key of collectionKeys) h.redis.seed(key, { stale: true });
        const result = await h.invoke('Admin', name, { params: { id: 'collection-1', soundscapeId: 'sound-1' }, body: { soundscape_id: 'sound-1', sort_order: 0 } });
        assert.equal(result.statusCode, 500);
        for (const key of collectionKeys) assert.equal(h.redis.value(key), null);
    }
});

test('onboarding invalidates its committed changes even if fetching preferences later fails', async () => {
    const h = await harness();
    h.redis.seed('user:user-a:home-recommended', { stale: true });
    h.db.failTable = 'user_sound_preferences';
    const result = await h.invoke('Onboarding', 'PostOnboarding', { body: { goals: ['sleep'], starting_mode: 'sleep' } });
    assert.equal(result.statusCode, 500);
    assert.equal(h.redis.value('user:user-a:home-recommended'), null);
});

test('guest import invalidates favourites/preferences/onboarding at each committed step', async () => {
    for (const failLater of [false, true]) {
        const h = await harness();
        const keys = ['user:user-a:favourites', 'user:user-a:recommendations', 'user:user-a:recommendations:count:0', 'user:user-a:home-recommended', 'user:user-a:continue-listening'];
        keys.forEach(key => h.redis.seed(key, { stale: true }));
        h.db.handler = q => {
            if (failLater && q.table === 'user_playlists') return { data: null, error: { message: 'later import failed' } };
            if (['user_favourites', 'user_sound_preferences', 'user_onboarding'].includes(q.table) && !q.operations.some(op => ['insert', 'upsert'].includes(op[0]))) {
                return { data: q.table === 'user_favourites' ? [] : null, error: null };
            }
        };
        const result = await h.invoke('Account', 'ImportGuestData', { body: { favourites: ['sound-1'], sound_preferences: { excluded_sounds: ['rain'] }, goals: ['sleep'], starting_mode: 'sleep', playlists: failLater ? [{ name: 'Guest playlist' }] : [] } });
        assert.equal(result.statusCode, failLater ? 500 : 200, result.bytes);
        for (const key of keys.filter(key => !failLater || !key.endsWith('continue-listening'))) assert.equal(h.redis.value(key), null, key);
    }
});

test('account deletion invalidates all six per-user caches even after a partial deletion', async () => {
    const h = await harness();
    h.db.handler = q => q.table === 'user_downloads' && q.operations.some(op => op[0] === 'delete') ? { data: null, error: { message: 'partial deletion' } } : undefined;
    const suffixes = ['favourites', 'play-history', 'downloads', 'continue-listening', 'home-recommended', 'recommendations'];
    suffixes.forEach(suffix => h.redis.seed(`user:user-a:${suffix}`, { stale: true }));
    const result = await h.invoke('Auth', 'DeleteAccount');
    assert.equal(result.statusCode, 500);
    suffixes.forEach(suffix => assert.equal(h.redis.value(`user:user-a:${suffix}`), null));
});

test('empty successful lists are cached; validation and missing content keep their statuses', async () => {
    for (const [file, name] of [['Soundscape', 'GetCollections'], ['Soundscape', 'GetPopularCollections'], ['Help', 'GetHelpArticles']]) {
        const h = await harness();
        h.db.handler = () => ({ data: [], error: null });
        const first = await h.invoke(file, name);
        assert.equal(first.statusCode, 200);
        const count = h.db.calls.length;
        assert.equal((await h.invoke(file, name)).bytes, first.bytes);
        assert.equal(h.db.calls.length, count);
    }
    for (const [file, name, request] of [['Soundscape', 'GetOneSoundscape', { params: { id: 'missing' } }], ['Soundscape', 'GetOneCollection', { params: { id: 'missing' } }], ['Help', 'GetHelpArticle', { params: { slug: 'missing' } }]]) {
        const h = await harness();
        h.db.handler = () => ({ data: null, error: null });
        assert.equal((await h.invoke(file, name, request)).statusCode, 404);
        assert.equal(h.redis.entries.size, 0);
    }
    const h = await harness();
    assert.equal((await h.invoke('Soundscape', 'GetLibrary', { query: { sort: 'invalid' } })).statusCode, 400);
    assert.equal((await h.invoke('Recommendations', 'GetRecommendations', { query: { count: '99' } })).statusCode, 400);
    assert.equal(h.db.calls.length, 0);
    assert.equal(h.redis.calls.length, 0);
});
