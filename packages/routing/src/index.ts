// @openwalk/routing: pedestrian routing over a site's prebuilt graph. Pure functions,
// no I/O: the caller loads graph.json and passes it in.

export {
  EARTH_RADIUS_M,
  haversineDistance,
  initialBearing,
  interpolate,
  localPlane,
  nearestPointOnSegment,
  type LocalPlane,
  type PlanePoint,
  type Position,
} from './geo';
export {
  DEFAULT_WEIGHTS,
  EDGE_KINDS,
  loadGraph,
  resolveWeights,
  type EdgeKind,
  type EdgeRecord,
  type Graph,
  type GraphDocument,
  type KindWeights,
  type Neighbour,
} from './graph';
export { insertSnapPoint, snapToGraph, type SnapPoint } from './snap';
export { aStar, dijkstra, type PathResult, type SearchOptions } from './shortestPath';
export {
  DEFAULT_WALKING_SPEED_MPS,
  estimateDuration,
  route,
  type Destination,
  type Route,
  type RouteOptions,
} from './route';
