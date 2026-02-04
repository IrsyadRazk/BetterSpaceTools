
import { GraphData, IsochroneParams, Node } from '../types';
import * as turf from '@turf/turf';

// Simplified Dijkstra's algorithm
export const calculateDijkstra = (graph: GraphData, startLat: number, startLng: number, maxTimeSeconds: number): Node[] => {
  // Find nearest graph node to start point
  let startNodeId: string | null = null;
  let minDist = Infinity;
  
  graph.nodes.forEach((node, id) => {
    const d = Math.pow(node.lat - startLat, 2) + Math.pow(node.lon - startLng, 2);
    if (d < minDist) {
      minDist = d;
      startNodeId = id;
    }
  });

  if (!startNodeId) return [];

  const distances = new Map<string, number>();
  const pq: [number, string][] = [[0, startNodeId]];
  distances.set(startNodeId, 0);

  const reachableNodes: Node[] = [];

  while (pq.length > 0) {
    // Basic priority queue sort
    pq.sort((a, b) => a[0] - b[0]);
    const [d, uId] = pq.shift()!;

    if (d > maxTimeSeconds) continue;
    
    const uNode = graph.nodes.get(uId);
    if (uNode) reachableNodes.push(uNode);

    const neighbors = graph.adjacency.get(uId) || [];
    for (const edge of neighbors) {
      const vId = edge.target;
      const weight = edge.weight;
      const newDist = d + weight;

      if (!distances.has(vId) || newDist < distances.get(vId)!) {
        distances.set(vId, newDist);
        pq.push([newDist, vId]);
      }
    }
  }

  return reachableNodes;
};

// Generate Polygon from nodes
export const generateHull = (nodes: Node[], maxTimeSeconds: number): any => {
  if (nodes.length < 3) return null;

  const points = nodes.map(n => [n.lon, n.lat]);
  const featureCollection = turf.featureCollection(points.map(p => turf.point(p)));

  try {
    // Concave hull provides a more accurate representation than Convex
    // Alpha value controls 'tightness'
    const hull = turf.concave(featureCollection, { maxEdge: 0.1 });
    if (hull) return hull;
    
    // Fallback to convex hull if concave fails
    return turf.convex(featureCollection);
  } catch (e) {
    return turf.convex(featureCollection);
  }
};
