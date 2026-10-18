import { describe, expect, it } from 'vitest';
import { kenBurnsFor, buildPlan } from './plan';
import { syntheticBeatMap } from './__fixtures__/beatmap';
import { must } from './must';

const chosen = (n: number, width = 4000, height = 3000) =>
  Array.from({ length: n }, (_, i) => ({ photoId: `p${i}`, width, height }));

describe('buildPlan', () => {
  const beatmap = syntheticBeatMap(120, 60_000); // a beat every 500 ms

  it('moves which shots crossfade when given a transition offset', () => {
    const kinds = (offset?: number) =>
      buildPlan(chosen(10), beatmap, 20_000, offset).shots.map((s) => s.transition);
    expect(kinds()).toEqual(kinds(0));
    expect(kinds(1)).not.toEqual(kinds(0));
    expect(kinds(2)).not.toEqual(kinds(1));
    expect(kinds(1).filter((t) => t === 'crossfade').length).toBeGreaterThan(0);
  });

  it('fills the ReelPlan header from the shared contract', () => {
    const plan = buildPlan(chosen(10), beatmap, 20_000);
    expect(plan).toMatchObject({
      version: 1,
      width: 1080,
      height: 1920,
      fps: 30,
      trackId: beatmap.trackId,
    });
  });

  it('makes one contiguous shot per photo, in the order given', () => {
    const plan = buildPlan(chosen(10), beatmap, 20_000);
    expect(plan.shots.map((s) => s.photoId)).toEqual(chosen(10).map((c) => c.photoId));
    let cursor = 0;
    for (const s of plan.shots) {
      expect(s.startMs).toBe(cursor);
      expect(s.durationMs).toBeGreaterThan(0);
      cursor += s.durationMs;
    }
    expect(plan.totalMs).toBe(cursor);
  });

  it('cuts on beats', () => {
    const plan = buildPlan(chosen(10), beatmap, 20_000);
    for (const s of plan.shots) expect(s.startMs % 500).toBe(0);
    expect(plan.totalMs % 500).toBe(0);
  });

  it('cuts only on real beats, on a map that is off the 500 ms grid', () => {
    const offGrid = syntheticBeatMap(110, 60_000); // 545.45 ms beats: even spacing would miss them
    const plan = buildPlan(chosen(10), offGrid, 20_000);
    const beats = new Set(offGrid.beatsMs);
    for (const s of plan.shots.slice(1)) expect(beats.has(s.startMs)).toBe(true);
    expect(beats.has(plan.totalMs)).toBe(true);
  });

  it.each([60, 90, 100, 110, 128, 140])(
    'never lands under 15 s at %i bpm, even when asked for the minimum',
    (bpm) => {
      const { totalMs } = buildPlan(chosen(10), syntheticBeatMap(bpm, 60_000), 15_000);
      expect(totalMs).toBeGreaterThanOrEqual(15_000);
      expect(totalMs).toBeLessThanOrEqual(30_000);
    },
  );

  it('lands the length inside the 15-30 s window', () => {
    for (const n of [5, 8, 10, 14]) {
      const { totalMs } = buildPlan(chosen(n), beatmap, 20_000);
      expect(totalMs).toBeGreaterThanOrEqual(15_000);
      expect(totalMs).toBeLessThanOrEqual(30_000);
    }
  });

  it('clamps an out-of-range duration request', () => {
    expect(buildPlan(chosen(10), beatmap, 3_000).totalMs).toBeGreaterThanOrEqual(15_000);
    expect(buildPlan(chosen(10), beatmap, 120_000).totalMs).toBeLessThanOrEqual(30_000);
  });

  it('never runs past the end of the track', () => {
    const short = syntheticBeatMap(120, 12_000);
    expect(buildPlan(chosen(10), short, 20_000).totalMs).toBeLessThanOrEqual(12_000);
  });

  it('opens with a cut and uses both transition styles', () => {
    const plan = buildPlan(chosen(10), beatmap, 20_000);
    expect(must(plan.shots[0]).transition).toBe('cut');
    expect(new Set(plan.shots.map((s) => s.transition))).toEqual(new Set(['cut', 'crossfade']));
  });

  it('still produces an even plan when the beat map has no beats', () => {
    const plan = buildPlan(chosen(5), { ...beatmap, beatsMs: [] }, 20_000);
    expect(plan.shots).toHaveLength(5);
    expect(plan.totalMs).toBeGreaterThanOrEqual(15_000);
  });

  it('returns an empty plan for no photos', () => {
    const plan = buildPlan([], beatmap, 20_000);
    expect(plan.shots).toEqual([]);
    expect(plan.totalMs).toBe(0);
  });

  it('gives every shot a Ken Burns move inside the photo', () => {
    for (const s of buildPlan(chosen(10), beatmap, 20_000).shots) {
      for (const r of [s.kenBurns.from, s.kenBurns.to]) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe('kenBurnsFor', () => {
  it.each([
    ['landscape', 4000, 3000],
    ['portrait', 3000, 4000],
    ['already 9:16', 1080, 1920],
    ['panorama', 8000, 2000],
  ])('keeps the crop at 9:16 in pixels for a %s photo', (_name, w, h) => {
    for (const index of [0, 1, 2, 3]) {
      const { from, to } = kenBurnsFor(index, w, h);
      for (const r of [from, to]) expect((r.w * w) / (r.h * h)).toBeCloseTo(9 / 16, 3);
    }
  });

  it('actually moves: the start and end windows differ', () => {
    const { from, to } = kenBurnsFor(0, 4000, 3000);
    expect(from).not.toEqual(to);
  });

  it('alternates zoom direction between neighbouring shots', () => {
    const a = kenBurnsFor(0, 4000, 3000);
    const b = kenBurnsFor(1, 4000, 3000);
    expect(a.to.w).toBeLessThan(a.from.w);
    expect(b.to.w).toBeGreaterThan(b.from.w);
  });

  it('falls back to a centred 9:16 window when the size is unknown', () => {
    const { from, to } = kenBurnsFor(0, undefined, undefined);
    for (const r of [from, to]) {
      expect(r.w).toBeGreaterThan(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('buildPlan with a look', () => {
  const beatmap = syntheticBeatMap(120, 60_000); // a beat every 500 ms
  const onBeat = (ms: number) => beatmap.beatsMs.includes(ms);

  it('leaves a classic plan as it was: no look id, shots as before', () => {
    const plain = buildPlan(chosen(10), beatmap, 20_000);
    expect(plain).not.toHaveProperty('look');
    expect(buildPlan(chosen(10), beatmap, 20_000, 0, 'classic')).toEqual(plain);
  });

  it('writes the look id into the plan for any other look', () => {
    expect(buildPlan(chosen(10), beatmap, 20_000, 0, 'cinematic').look).toBe('cinematic');
  });

  it('cuts zoom-punch and flash-cut on every beat, going round the photos again to fill the length', () => {
    for (const look of ['zoom-punch', 'flash-cut'] as const) {
      const plan = buildPlan(chosen(10), beatmap, 20_000, 0, look);
      expect(plan.shots.length).toBeGreaterThan(10);
      expect(plan.shots.length).toBeLessThanOrEqual(30);
      expect(plan.shots.every((s) => s.durationMs === 500)).toBe(true);
      expect(plan.shots.every((s) => onBeat(s.startMs))).toBe(true);
      expect(plan.shots.map((s) => s.photoId).slice(0, 12)).toEqual([
        ...chosen(10).map((c) => c.photoId),
        'p0',
        'p1',
      ]);
      expect(plan.shots.every((s) => s.transition === 'cut')).toBe(true);
    }
  });

  it('keeps contiguous shots that end exactly at totalMs', () => {
    for (const look of ['zoom-punch', 'cinematic', 'photo-dump'] as const) {
      const plan = buildPlan(chosen(10), beatmap, 20_000, 0, look);
      let cursor = 0;
      for (const s of plan.shots) {
        expect(s.startMs).toBe(cursor);
        cursor += s.durationMs;
      }
      expect(plan.totalMs).toBe(cursor);
    }
  });

  it('cuts photo-dump in one and two beats', () => {
    const plan = buildPlan(chosen(10), beatmap, 20_000, 0, 'photo-dump');
    const beats = new Set(plan.shots.map((s) => s.durationMs / 500));
    expect([...beats].sort()).toEqual([1, 2]);
    expect(plan.shots.every((s) => onBeat(s.startMs))).toBe(true);
  });

  it('cuts cinematic in four to eight beats and fades every shot in', () => {
    const plan = buildPlan(chosen(10), beatmap, 20_000, 0, 'cinematic');
    expect(plan.shots).toHaveLength(10);
    for (const s of plan.shots) {
      expect(s.durationMs / 500).toBeGreaterThanOrEqual(4);
      expect(s.durationMs / 500).toBeLessThanOrEqual(8);
    }
    expect(plan.shots.map((s) => s.transition)).toEqual(['cut', ...Array(9).fill('crossfade')]);
    expect(plan.totalMs).toBeGreaterThanOrEqual(15_000);
    expect(plan.totalMs).toBeLessThanOrEqual(30_000);
  });

  it('shortens cinematic cuts below four beats rather than drop photos when the beats run out', () => {
    const slow = syntheticBeatMap(60, 30_000); // 30 beats for 10 photos
    const plan = buildPlan(chosen(10), slow, 30_000, 0, 'cinematic');
    expect(plan.shots).toHaveLength(10);
    expect(plan.totalMs).toBeLessThanOrEqual(30_000);
  });

  it('falls back to even cuts when the beat map is too sparse for beat counting', () => {
    const sparse = { ...beatmap, beatsMs: [0, 4000, 9000] };
    const plan = buildPlan(chosen(10), sparse, 20_000, 0, 'zoom-punch');
    expect(plan.shots).toHaveLength(10);
  });

  it('moves over the whole photo when the look fits it inside the frame', () => {
    const plan = buildPlan(chosen(5), beatmap, 20_000, 0, 'zoom-punch');
    const first = must(plan.shots[0]);
    // the whole 4:3 photo is the widest crop, so a zoomed window keeps the photo's own aspect
    for (const r of [first.kenBurns.from, first.kenBurns.to]) {
      expect((r.w * 4000) / (r.h * 3000)).toBeCloseTo(4 / 3, 6);
    }
    expect(Math.max(first.kenBurns.from.w, first.kenBurns.to.w)).toBeCloseTo(1, 6);
  });

  it('gives a look its own Ken Burns zoom', () => {
    const slow = kenBurnsFor(1, 4000, 3000, { fit: 'contain', zoom: 1.1 });
    expect(slow.from.w).toBeCloseTo(1 / 1.1, 9);
    const still = kenBurnsFor(1, 4000, 3000, { fit: 'contain', zoom: 1 });
    expect(still.from).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('is deterministic', () => {
    expect(buildPlan(chosen(10), beatmap, 20_000, 0, 'photo-dump')).toEqual(
      buildPlan(chosen(10), beatmap, 20_000, 0, 'photo-dump'),
    );
  });
});

const SINGLE_PHOTO_LOOKS = ['neon-edge-pulse', 'zoom-through', 'glitch-slice'] as const;

describe('buildPlan from one photo', () => {
  const beatmap = syntheticBeatMap(120, 60_000);
  const sameShape = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  it('makes a full-length reel on the beat from a single photo, in every single-photo look', () => {
    for (const look of SINGLE_PHOTO_LOOKS) {
      const plan = buildPlan(chosen(1), beatmap, 20_000, 0, look);
      expect(plan.look).toBe(look);
      expect(plan.totalMs).toBeGreaterThanOrEqual(15_000);
      expect(plan.totalMs).toBeLessThanOrEqual(30_000);
      expect(plan.shots.length).toBeGreaterThanOrEqual(8);
      expect(new Set(plan.shots.map((s) => s.photoId))).toEqual(new Set(['p0']));
      expect(plan.shots.every((s) => beatmap.beatsMs.includes(s.startMs))).toBe(true);
      expect(plan.shots.every((s) => s.transition === 'cut')).toBe(true);
      let cursor = 0;
      for (const shot of plan.shots) {
        expect(shot.startMs).toBe(cursor);
        cursor += shot.durationMs;
      }
      expect(cursor).toBe(plan.totalMs);
    }
  });

  it('gives each repeat of the photo a different crop and motion, not the same few moves', () => {
    for (const look of SINGLE_PHOTO_LOOKS) {
      const plan = buildPlan(chosen(1), beatmap, 20_000, 0, look);
      const moves = plan.shots.map((s) => JSON.stringify(s.kenBurns));
      expect(new Set(moves).size).toBeGreaterThanOrEqual(8);
      // neighbouring shots never repeat each other
      moves.slice(1).forEach((m, i) => expect(m).not.toBe(moves[i]));
    }
  });

  it('keeps every crop inside the photo, and 9:16 for the looks that fill the frame', () => {
    for (const look of SINGLE_PHOTO_LOOKS) {
      const plan = buildPlan(chosen(1), beatmap, 20_000, 0, look);
      for (const shot of plan.shots) {
        for (const r of [shot.kenBurns.from, shot.kenBurns.to]) {
          expect(r.x).toBeGreaterThanOrEqual(-1e-9);
          expect(r.y).toBeGreaterThanOrEqual(-1e-9);
          expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
          expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
          if (look !== 'neon-edge-pulse')
            expect((r.w * 4000) / (r.h * 3000)).toBeCloseTo(9 / 16, 3);
        }
      }
    }
  });

  it('still cuts a one-photo reel when the beat map has too few beats to count', () => {
    const sparse = { ...beatmap, beatsMs: [0, 4000, 9000] };
    for (const look of SINGLE_PHOTO_LOOKS) {
      const plan = buildPlan(chosen(1), sparse, 20_000, 0, look);
      expect(plan.shots.length).toBeGreaterThan(5);
      expect(plan.totalMs).toBeGreaterThanOrEqual(15_000);
    }
  });

  it('cuts two and three photos in the same looks, and is deterministic', () => {
    for (const look of SINGLE_PHOTO_LOOKS) {
      for (const n of [2, 3]) {
        const plan = buildPlan(chosen(n), beatmap, 20_000, 0, look);
        expect(new Set(plan.shots.map((s) => s.photoId)).size).toBe(n);
      }
      expect(
        sameShape(
          buildPlan(chosen(1), beatmap, 20_000, 0, look),
          buildPlan(chosen(1), beatmap, 20_000, 0, look),
        ),
      ).toBe(true);
    }
  });

  it('refuses fewer photos than the other looks need, in plain words', () => {
    expect(() => buildPlan(chosen(4), beatmap, 20_000)).toThrow(
      'Classic needs at least 5 photos (you have 4).',
    );
    for (const [look, name] of [
      ['zoom-punch', 'Zoom punch'],
      ['flash-cut', 'Flash cut'],
      ['cinematic', 'Cinematic'],
      ['photo-dump', 'Photo dump'],
    ] as const) {
      expect(() => buildPlan(chosen(1), beatmap, 20_000, 0, look)).toThrow(
        `${name} needs at least 5 photos (you have 1).`,
      );
    }
  });

  it('counts different photos, not shots: one photo repeated is still one photo', () => {
    const repeated = [...chosen(1), ...chosen(1), ...chosen(1), ...chosen(1), ...chosen(1)];
    expect(() => buildPlan(repeated, beatmap, 20_000)).toThrow(/you have 1/);
  });

  it('does not change what the older looks cut from five photos or more', () => {
    for (const look of ['classic', 'zoom-punch', 'cinematic'] as const) {
      expect(() => buildPlan(chosen(5), beatmap, 20_000, 0, look)).not.toThrow();
    }
  });
});

describe('kenBurnsFor variants', () => {
  it('moves the same way as before when no variant is asked for', () => {
    const style = { fit: 'contain', zoom: 1.1 } as const;
    expect(kenBurnsFor(3, 4000, 3000, { ...style, variant: 0 })).toEqual(
      kenBurnsFor(3, 4000, 3000, style),
    );
  });

  it('zooms further on a later pass and stays inside the photo', () => {
    const first = kenBurnsFor(0, 4000, 3000, { fit: 'contain', zoom: 1.1, variant: 0 });
    const later = kenBurnsFor(0, 4000, 3000, { fit: 'contain', zoom: 1.1, variant: 2 });
    expect(later.to.w).toBeLessThan(first.to.w);
    for (const r of [later.from, later.to]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
