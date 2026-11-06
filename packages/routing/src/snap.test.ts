import { describe, expect, it } from 'vitest';
import tiny from '../fixtures/tiny.graph.json' with { type: 'json' };
import { loadGraph, type GraphDocument } from './graph';
import { insertSnapPoint, snapToGraph } from './snap';

const graph = loadGraph(tiny as unknown as GraphDocument);

describe('snapToGraph', () => {
  it('finds the nearest point part-way along an edge', () => {
    const snap = snapToGraph(graph, [0.0005, -0.0001]);
    expect(snap).not.toBeNull();
    expect(snap?.from).toBe(0);
    expect(snap?.to).toBe(1);
    expect(snap?.t).toBeCloseTo(0.5, 9);
    expect(snap?.kind).toBe('walkway');
    expect(snap?.position[0]).toBeCloseTo(0.0005, 9);
    expect(snap?.position[1]).toBeCloseTo(0, 9);
    expect(snap?.distanceM).toBeCloseTo(11.1195, 3);
  });

  it('lands on an endpoint when the position is beyond the edge', () => {
    const snap = snapToGraph(graph, [-0.0002, -0.0002]);
    expect(snap?.t).toBe(0);
    expect(snap?.from).toBe(0);
    expect(snap?.distanceM).toBeCloseTo(31.45, 1);
  });

  it('reports zero distance for a position on the network', () => {
    const snap = snapToGraph(graph, [0.0015, 0]);
    expect(snap?.distanceM).toBeCloseTo(0, 6);
  });

  it('returns null for a graph without edges', () => {
    const empty = loadGraph({ nodes: [[0, 0]], edges: [], places: {} });
    expect(snapToGraph(empty, [0, 0])).toBeNull();
  });
});

describe('insertSnapPoint', () => {
  it('splits the edge and leaves the original graph untouched', () => {
    const snap = snapToGraph(graph, [0.0005, -0.0001]);
    if (snap === null) throw new Error('expected a snap point');
    const { graph: split, node } = insertSnapPoint(graph, snap);

    expect(node).toBe(8);
    expect(split.nodes).toHaveLength(9);
    expect(split.nodes[8]).toEqual(snap.position);
    expect(split.neighbours[8]).toEqual([
      { node: 0, metres: 56, kind: 'walkway' },
      { node: 1, metres: 56, kind: 'walkway' },
    ]);
    expect(split.neighbours[0]).toContainEqual({ node: 8, metres: 56, kind: 'walkway' });
    expect(split.neighbours[0]).not.toContainEqual(expect.objectContaining({ node: 1 }));
    expect(split.neighbours[1]).toContainEqual({ node: 8, metres: 56, kind: 'walkway' });
    expect(split.neighbours[1]).not.toContainEqual(expect.objectContaining({ node: 0 }));

    expect(graph.nodes).toHaveLength(8);
    expect(graph.neighbours[0]).toContainEqual({ node: 1, metres: 112, kind: 'walkway' });
  });

  it('reuses an endpoint instead of splitting at an edge end', () => {
    const snap = snapToGraph(graph, [-0.0002, -0.0002]);
    if (snap === null) throw new Error('expected a snap point');
    const { graph: same, node } = insertSnapPoint(graph, snap);
    expect(node).toBe(0);
    expect(same).toBe(graph);
  });
});
