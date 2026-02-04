
export enum TransportMode {
  WALKING = 'walking',
  CYCLING = 'cycling',
  DRIVING = 'driving'
}

export interface IsochroneParams {
  lat: number;
  lng: number;
  mode: TransportMode;
  minutes: number;
}

export interface Node {
  id: string;
  lat: number;
  lon: number;
}

export interface Edge {
  source: string;
  target: string;
  weight: number; // in seconds
}

export interface GraphData {
  nodes: Map<string, Node>;
  adjacency: Map<string, Edge[]>;
}

export interface IsochroneResult {
  polygon: any; // GeoJSON Polygon/MultiPolygon
  params: IsochroneParams;
}
