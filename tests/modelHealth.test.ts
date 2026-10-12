import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';
import { isBenched, orderModels, recordFailure, recordSuccess, resetModelHealth } from '../server/modelHealth.ts';

const FALLBACKS = ['b', 'c', 'd'];
const T = 1_000_000;

describe('model circuit breaker', () => {
  beforeEach(() => resetModelHealth());

  it('tries the requested model first when everything is healthy', () => {
    assert.deepEqual(orderModels('a', FALLBACKS, T), ['a', 'b', 'c', 'd']);
  });

  it('does not list the requested model twice when it is also a fallback', () => {
    assert.deepEqual(orderModels('c', FALLBACKS, T), ['c', 'b', 'd']);
  });

  it('moves a model that just failed to the back, without dropping it', () => {
    recordFailure('a', 503, T);
    assert.deepEqual(orderModels('a', FALLBACKS, T + 1), ['b', 'c', 'd', 'a']);
  });

  it('benches overload for a minute and spent quota for longer', () => {
    recordFailure('a', 503, T);
    recordFailure('b', 429, T);
    assert.ok(!isBenched('a', T + 61_000));
    assert.ok(isBenched('b', T + 61_000));
    assert.ok(!isBenched('b', T + 11 * 60_000));
  });

  it('puts the benched model that recovers soonest ahead of the others', () => {
    recordFailure('b', 429, T);
    recordFailure('a', 503, T);
    assert.deepEqual(orderModels('a', FALLBACKS, T + 1), ['c', 'd', 'a', 'b']);
  });

  it('restores a model as soon as it answers again', () => {
    recordFailure('a', 503, T);
    recordSuccess('a');
    assert.deepEqual(orderModels('a', FALLBACKS, T + 1), ['a', 'b', 'c', 'd']);
  });
});
