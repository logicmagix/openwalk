import { describe, expect, it } from 'vitest';
import tiny from '../fixtures/tiny.graph.json' with { type: 'json' };
import { DEFAULT_WEIGHTS, loadGraph, resolveWeights, type GraphDocument } from './graph';

const document = tiny as unknown as GraphDocument;

describe('loadGraph', () => {
  it('lists each edge from both of its ends', () => {
    const graph = loadGraph(document);
    expect(graph.nodes).toHaveLength(8);
    expect(graph.neighbours[0]).toEqual([
      { node: 1, metres: 112, kind: 'walkway' },
      { node: 5, metres: 112, kind: 'walkway' },
      { node: 3, metres: 159, kind: 'area' },
    ]);
    expect(graph.neighbours[7]).toEqual([{ node: 6, metres: 112, kind: 'walkway' }]);
    expect(graph.places).toEqual({ corner: [2], top: [4], island: [7] });
  });

  it('rejects an edge that points outside the node list', () => {
    const broken: GraphDocument = { ...document, edges: [[0, 99, 1, 'walkway']] };
    expect(() => loadGraph(broken)).toThrow(RangeError);
  });

  it('rejects a place that points outside the node list', () => {
    const broken: GraphDocument = { ...document, places: { nowhere: 42 } };
    expect(() => loadGraph(broken)).toThrow(RangeError);
  });

  it('keeps every entrance of a place that has several', () => {
    const graph = loadGraph({ ...document, places: { hall: [2, 5], gate: 4 } });
    expect(graph.places).toEqual({ hall: [2, 5], gate: [4] });
    const broken: GraphDocument = { ...document, places: { hall: [2, 42] } };
    expect(() => loadGraph(broken)).toThrow(RangeError);
  });
});

describe('resolveWeights', () => {
  it('returns the defaults when nothing is overridden', () => {
    expect(resolveWeights()).toEqual(DEFAULT_WEIGHTS);
  });

  it('keeps the defaults for kinds a site does not mention', () => {
    expect(resolveWeights({ road: 2 })).toEqual({ ...DEFAULT_WEIGHTS, road: 2 });
  });

  it('refuses a weight below one, which would break the search estimate', () => {
    expect(() => resolveWeights({ aisle: 0.5 })).toThrow(RangeError);
    expect(() => resolveWeights({ aisle: Number.NaN })).toThrow(RangeError);
  });
});
