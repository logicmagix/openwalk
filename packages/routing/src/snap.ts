// Snapping a free position (the walker, or a tapped destination) onto the network.
// The nearest point on the nearest edge is found, and the edge is split there so a
// search can start or end part-way along it rather than at the nearer endpoint.

import {
  haversineDistance,
  interpolate,
  localPlane,
  nearestPointOnSegment,
  type Position,
} from './geo';
import type { EdgeKind, Graph, Neighbor } from './graph';

/** Where a position lands on the network. */
export interface SnapPoint {
  /** The snapped position, on the edge. */
  readonly position: Position;
  /** The two ends of the edge it lies on, in the order stored in the graph. */
  readonly from: number;
  readonly to: number;
  /** How far along the edge it lies, from 0 at `from` to 1 at `to`. */
  readonly t: number;
  readonly kind: EdgeKind;
  /** Straight-line distance from the original position to the snapped one, meters. */
  readonly distanceM: number;
}

/**
 * The nearest edge to `position`, or null for a graph with no edges. Every edge is
 * examined; a site's graph has a few thousand at most, so this takes well under a
 * millisecond and needs no spatial index.
 */
export function snapToGraph(graph: Graph, position: Position): SnapPoint | null {
  const plane = localPlane(position);
  const p = plane.toPlane(position);
  const planeNodes = graph.nodes.map((node) => plane.toPlane(node));
  let best: { from: number; neighbor: Neighbor; t: number; squaredDistance: number } | null = null;
  graph.neighbors.forEach((list, from) => {
    const a = planeNodes[from];
    if (a === undefined) return;
    for (const neighbor of list) {
      // Each undirected edge appears twice; consider it once, from its lower node.
      if (neighbor.node < from) continue;
      const b = planeNodes[neighbor.node];
      if (b === undefined) continue;
      const candidate = nearestPointOnSegment(p, a, b);
      if (best === null || candidate.squaredDistance < best.squaredDistance) {
        best = { from, neighbor, ...candidate };
      }
    }
  });
  if (best === null) return null;
  const found: { from: number; neighbor: Neighbor; t: number } = best;
  const a = graph.nodes[found.from];
  const b = graph.nodes[found.neighbor.node];
  if (a === undefined || b === undefined) return null;
  const snapped = interpolate(a, b, found.t);
  return {
    position: snapped,
    from: found.from,
    to: found.neighbor.node,
    t: found.t,
    kind: found.neighbor.kind,
    distanceM: haversineDistance(position, snapped),
  };
}

/** A snap point this close to an edge's end, as a fraction of the edge, reuses that end. */
const END_TOLERANCE = 1e-6;

/**
 * A graph with a node inserted at a snap point. The original is left untouched: the
 * outer neighbor list is copied and only the two affected entries are replaced, so
 * the cost is proportional to the node count, not the edge count.
 */
export function insertSnapPoint(graph: Graph, snap: SnapPoint): { graph: Graph; node: number } {
  if (snap.t <= END_TOLERANCE) return { graph, node: snap.from };
  if (snap.t >= 1 - END_TOLERANCE) return { graph, node: snap.to };

  const fromList = graph.neighbors[snap.from];
  const toList = graph.neighbors[snap.to];
  const edge = fromList?.find((n) => n.node === snap.to);
  if (fromList === undefined || toList === undefined || edge === undefined) {
    throw new RangeError(`snap point refers to a missing edge [${snap.from}, ${snap.to}]`);
  }

  const node = graph.nodes.length;
  const metersFrom = edge.meters * snap.t;
  const metersTo = edge.meters * (1 - snap.t);
  const neighbors = graph.neighbors.slice();
  neighbors[snap.from] = fromList.map((n) =>
    n.node === snap.to ? { node, meters: metersFrom, kind: edge.kind } : n,
  );
  neighbors[snap.to] = toList.map((n) =>
    n.node === snap.from ? { node, meters: metersTo, kind: edge.kind } : n,
  );
  neighbors.push([
    { node: snap.from, meters: metersFrom, kind: edge.kind },
    { node: snap.to, meters: metersTo, kind: edge.kind },
  ]);
  return {
    graph: { nodes: [...graph.nodes, snap.position], neighbors, places: graph.places },
    node,
  };
}
