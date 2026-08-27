import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nearestIds, searchItems } from '../dist/core/search.js';

const items = [
    {
        id: 'solar-oracle',
        title: 'Solar Oracle',
        summary: 'Predicts photovoltaic output from weather data.',
        category: 'guides',
        tags: ['energy', 'forecasting'],
        content: 'The oracle ingests irradiance readings and returns an output curve.'
    },
    {
        id: 'agora',
        title: 'Agora',
        summary: 'Preferential voting for community decisions.',
        category: 'reference',
        tags: ['voting'],
        content: 'Agora mentions solar only in passing. solar. solar. solar. solar.'
    },
    {
        id: 'gsoc-handbook',
        title: 'GSoC Handbook',
        summary: 'Guidance for Google Summer of Code contributors.',
        category: 'guides',
        tags: ['gsoc', 'mentoring'],
        content: ''
    }
];

test('ranks a title match above a repeated body mention', () => {
    const results = searchItems(items, 'solar');
    assert.equal(results[0].item.id, 'solar-oracle');
    assert.ok(results[0].score > results[1].score);
});

test('covering the whole query outranks matching half of it', () => {
    const results = searchItems(items, 'solar oracle');
    assert.equal(results[0].item.id, 'solar-oracle');
    // `agora` matches only "solar", so its score is halved by query coverage.
    const agora = results.find(r => r.item.id === 'agora');
    assert.ok(agora.score < results[0].score / 2);
});

test('reports which fields matched', () => {
    const [top] = searchItems(items, 'photovoltaic');
    assert.deepEqual(top.matchedIn, ['summary']);
});

test('an exact id is the strongest possible signal', () => {
    const [top] = searchItems(items, 'agora');
    assert.equal(top.item.id, 'agora');
    assert.ok(top.matchedIn.includes('id'));
});

test('excludes items that match nothing', () => {
    assert.deepEqual(searchItems(items, 'kubernetes'), []);
});

test('filters by category', () => {
    const results = searchItems(items, '', { category: 'guides' });
    assert.deepEqual(
        results.map(r => r.item.id).sort(),
        ['gsoc-handbook', 'solar-oracle']
    );
});

test('tag filter requires every tag', () => {
    assert.equal(searchItems(items, '', { tags: ['energy', 'voting'] }).length, 0);
    assert.equal(searchItems(items, '', { tags: ['energy'] }).length, 1);
});

test('an empty query browses alphabetically rather than returning nothing', () => {
    const results = searchItems(items, '');
    assert.deepEqual(results.map(r => r.item.title), ['Agora', 'GSoC Handbook', 'Solar Oracle']);
});

test('honours the limit', () => {
    assert.equal(searchItems(items, '', {}, 2).length, 2);
});

test('a single character alongside a real term does not disturb ranking', () => {
    const withNoise = searchItems(items, 'solar a').map(r => r.item.id);
    const without = searchItems(items, 'solar').map(r => r.item.id);
    assert.deepEqual(withNoise, without);
});

test('a one-character query is scored, not silently turned into a browse', () => {
    // A bare "R" or "C" is a legitimate query, so short tokens survive when the
    // query has nothing longer to go on. The results must still be ranked —
    // a browse returns everything at score 0, which is a different answer.
    const results = searchItems(items, 'v');
    assert.ok(results.length > 0);
    assert.ok(
        results.every(r => r.score > 0 && r.matchedIn.length > 0),
        'one-character results should carry real scores'
    );
    assert.equal(results[0].item.id, 'agora', 'the "voting" tag is the strongest v-match');
});

test('a query matching nothing returns nothing', () => {
    assert.deepEqual(searchItems(items, 'zzz'), []);
});

test('an all-punctuation query returns nothing rather than everything', () => {
    assert.deepEqual(searchItems(items, '!!!'), []);
});

test('nearestIds recovers from a single-character typo', () => {
    // The token search cannot help here: "agor" shares no whole word with any id.
    assert.deepEqual(nearestIds(items, 'agor'), ['agora']);
    assert.deepEqual(nearestIds(items, 'solar-orcale', 1), ['solar-oracle']);
});

test('nearestIds stays quiet when nothing is close', () => {
    assert.deepEqual(nearestIds(items, 'kubernetes-operator'), []);
});

test('nearestIds matches a substring of an id', () => {
    assert.ok(nearestIds(items, 'gsoc').includes('gsoc-handbook'));
});
