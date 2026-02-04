
import { Node, GraphData, Edge, TransportMode } from '../types';
import { TRANSPORT_SPEEDS } from '../constants';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Get distance in meters between two points
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

export const fetchRoadNetwork = async (lat: number, lng: number, radiusMeters: number, mode: TransportMode): Promise<GraphData> => {
  // Rough bounding box for radius
  const delta = (radiusMeters / 111320) * 1.5; 
  const bbox = `${lat - delta},${lng - delta},${lat + delta},${lng + delta}`;
  
  // Refined query based on transport mode
  let wayFilter = '["highway"]';
  if (mode === TransportMode.WALKING) {
    wayFilter = '["highway"]["footway"!~"no"]["access"!~"private"]';
  } else if (mode === TransportMode.CYCLING) {
    wayFilter = '["highway"]["bicycle"!~"no"]["access"!~"private"]';
  } else if (mode === TransportMode.DRIVING) {
    wayFilter = '["highway"]["motorcar"!~"no"]["access"!~"private"]';
  }

  const query = `
    [out:json][timeout:25];
    (
      way${wayFilter}(${bbox});
    );
    out body;
    >;
    out skel qt;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`
  });

  if (!response.ok) throw new Error('Overpass API error');

  const data = await response.json();
  const nodes = new Map<string, Node>();
  const adjacency = new Map<string, Edge[]>();

  // Parse nodes
  data.elements.forEach((el: any) => {
    if (el.type === 'node') {
      nodes.set(el.id.toString(), {
        id: el.id.toString(),
        lat: el.lat,
        lon: el.lon
      });
    }
  });

  // Average speed in m/s
  const speedMS = (TRANSPORT_SPEEDS[mode] * 1000) / 3600;

  // Parse ways and build adjacency
  data.elements.forEach((el: any) => {
    if (el.type === 'way' && el.nodes) {
      for (let i = 0; i < el.nodes.length - 1; i++) {
        const uId = el.nodes[i].toString();
        const vId = el.nodes[i + 1].toString();
        const u = nodes.get(uId);
        const v = nodes.get(vId);

        if (u && v) {
          const dist = getDistance(u.lat, u.lon, v.lat, v.lon);
          const weight = dist / speedMS; // seconds

          // Bidirectional for now (simplification)
          if (!adjacency.has(uId)) adjacency.set(uId, []);
          if (!adjacency.has(vId)) adjacency.set(vId, []);

          adjacency.get(uId)!.push({ source: uId, target: vId, weight });
          adjacency.get(vId)!.push({ source: vId, target: uId, weight });
        }
      }
    }
  });

  return { nodes, adjacency };
};
