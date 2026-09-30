import { describe, expect, it } from 'vitest';
import { collapseDuplicates } from './dedupe';

const HASH_A = '0f0f0f0f0f0f0f0f';
const HASH_A_NEAR = '0f0f0f0f0f0f0f78'; // 4 bits away
const HASH_OTHER = 'f0f0f0f0f0f0f0f0';

describe('collapseDuplicates', () => {
  const items = [
    { id: 'a', quality: 0.9, hash: HASH_A },
    { id: 'b', quality: 0.8, hash: HASH_A_NEAR },
    { id: 'c', quality: 0.7, hash: HASH_OTHER },
  ];

  it('collapses a near-duplicate pair to the better photo', () => {
    const { kept, duplicateOf } = collapseDuplicates(items, 10);
    expect(kept).toEqual(['a', 'c']);
    expect(duplicateOf.get('b')).toBe('a');
  });

  it('keeps the better photo even when it is listed second', () => {
    const { kept, duplicateOf } = collapseDuplicates([items[1]!, items[0]!, items[2]!], 10);
    expect(kept).toContain('a');
    expect(kept).not.toContain('b');
    expect(duplicateOf.get('b')).toBe('a');
  });

  it('honours the threshold: a zero threshold only merges identical hashes', () => {
    const { kept } = collapseDuplicates(items, 0);
    expect(kept).toEqual(['a', 'b', 'c']);
  });

  it('is deterministic when qualities tie: the earlier item wins', () => {
    const tie = [
      { id: 'x', quality: 0.5, hash: HASH_A },
      { id: 'y', quality: 0.5, hash: HASH_A },
    ];
    expect(collapseDuplicates(tie, 10).kept).toEqual(['x']);
  });

  it('handles an empty list', () => {
    expect(collapseDuplicates([], 10).kept).toEqual([]);
  });
});
