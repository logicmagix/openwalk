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
import type { EdgeKind, Graph, Neighbour } from './graph';

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
  /** Straight-line distance from the original position to the snapped one, metres. */
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
  let best: { from: number; neighbour: Neighbour; t: number; squaredDistance: number } | null =
    null;
  graph.neighbours.forEach((list, from) => {
    const a = planeNodes[from];
    if (a === undefined) return;
    for (const neighbour of list) {
      // Each undirected edge appears twice; consider it once, from its lower node.
      if (neighbour.node < from) continue;
      const b = planeNodes[neighbour.node];
      if (b === undefined) continue;
      const candidate = nearestPointOnSegment(p, a, b);
      if (best === null || candidate.squaredDistance < best.squaredDistance) {
        best = { from, neighbour, ...candidate };
      }
    }
  });
  if (best === null) return null;
  const found: { from: number; neighbour: Neighbour; t: number } = best;
  const a = graph.nodes[found.from];
  const b = graph.nodes[found.neighbour.node];
  if (a === undefined || b === undefined) return null;
  const snapped = interpolate(a, b, found.t);
  return {
    position: snapped,
    from: found.from,
    to: found.neighbour.node,
    t: found.t,
    kind: found.neighbour.kind,
    distanceM: haversineDistance(position, snapped),
  };
}

/** A snap point this close to an edge's end, as a fraction of the edge, reuses that end. */
const END_TOLERANCE = 1e-6;

/**
 * A graph with a node inserted at a snap point. The original is left untouched: the
 * outer neighbour list is copied and only the two affected entries are replaced, so
 * the cost is proportional to the node count, not the edge count.
 */
export function insertSnapPoint(graph: Graph, snap: SnapPoint): { graph: Graph; node: number } {
  if (snap.t <= END_TOLERANCE) return { graph, node: snap.from };
  if (snap.t >= 1 - END_TOLERANCE) return { graph, node: snap.to };

  const fromList = graph.neighbours[snap.from];
  const toList = graph.neighbours[snap.to];
  const edge = fromList?.find((n) => n.node === snap.to);
  if (fromList === undefined || toList === undefined || edge === undefined) {
    throw new RangeError(`snap point refers to a missing edge [${snap.from}, ${snap.to}]`);
  }

  const node = graph.nodes.length;
  const metresFrom = edge.metres * snap.t;
  const metresTo = edge.metres * (1 - snap.t);
  const neighbours = graph.neighbours.slice();
  neighbours[snap.from] = fromList.map((n) =>
    n.node === snap.to ? { node, metres: metresFrom, kind: edge.kind } : n,
  );
  neighbours[snap.to] = toList.map((n) =>
    n.node === snap.from ? { node, metres: metresTo, kind: edge.kind } : n,
  );
  neighbours.push([
    { node: snap.from, metres: metresFrom, kind: edge.kind },
    { node: snap.to, metres: metresTo, kind: edge.kind },
  ]);
  return {
    graph: { nodes: [...graph.nodes, snap.position], neighbours, places: graph.places },
    node,
  };
}
