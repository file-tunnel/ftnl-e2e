// Abstract pairing/ticket state machine: not a production server refinement.
import assert from 'node:assert/strict';
const initial = { phase: 'issued', claims: 0, delivered: 0, late_delivery: false };
const actions = ['claim', 'claim_again', 'transfer', 'cancel', 'finish'];
const key = s => JSON.stringify(s);
function step(s, a) {
  if (a === 'claim' && s.phase === 'issued')
    return { ...s, phase: 'claimed', claims: 1 };
  if (a === 'transfer' && s.phase === 'claimed' && s.delivered < 2)
    return { ...s, delivered: s.delivered + 1 };
  if (a === 'cancel' && (s.phase === 'issued' || s.phase === 'claimed'))
    return { ...s, phase: 'cancelled' };
  if (a === 'finish' && s.phase === 'claimed')
    return { ...s, phase: 'finished' };
  return s;
}
const valid = (s, n) => n.claims <= 1 &&
  (n.phase !== 'claimed' && n.phase !== 'finished' || n.claims === 1) &&
  !n.late_delivery && (s.phase !== 'cancelled' || n.delivered === s.delivered) &&
  (s.phase !== 'finished' || n.delivered === s.delivered) &&
  n.delivered >= s.delivered;
function explore(start, successor) {
  const seen = new Map([[key(start),start]]), queue = [start];
  for(let i=0;i<queue.length;i++) {
    const s=queue[i];
    for(const a of actions) {
      const n=successor(s,a);
      assert.ok(valid(s,n), `unsafe ${a}: ${key(s)} -> ${key(n)}`);
      if(!seen.has(key(n))) {
        assert.ok(seen.size < 128, 'state bound overflow');
        seen.set(key(n),n);queue.push(n);
      }
    }
  }
  return [...seen.values()];
}
const states=explore(initial,step);
assert.ok(states.length>=6,'vacuous graph');
assert.ok(states.some(s=>s.phase==='finished' && s.delivered===2));
assert.ok(states.some(s=>s.phase==='cancelled' && s.claims===0));
assert.throws(()=>explore(initial,(s,a)=>a==='claim'?
  {...s,phase:'claimed',claims:2}:step(s,a)),/unsafe/);
console.log(`model=one_shot_pairing states=${states.length} negative_controls=1 status=PASS scope=abstract`);
