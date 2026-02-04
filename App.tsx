
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  Marker, 
  useMapEvents, 
  Popup, 
  GeoJSON, 
  LayersControl,
  ScaleControl
} from 'react-leaflet';
import L from 'leaflet';
import { 
  TransportMode, 
  IsochroneParams, 
  IsochroneResult 
} from './types';
import { 
  INDONESIA_BBOX, 
  DEFAULT_CENTER, 
  TIME_INTERVALS,
  TRANSPORT_SPEEDS
} from './constants';
import { fetchRoadNetwork } from './services/overpassService';
import { calculateDijkstra, generateHull } from './services/isochroneService';
import { 
  Map as MapIcon, 
  Settings, 
  Download, 
  Upload, 
  Info, 
  Layers, 
  Navigation,
  Car,
  Bike,
  Footprints,
  Clock,
  ChevronRight,
  Loader2,
  Trash2,
  FileJson,
  X,
  Play
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// Fix leaflet icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// AI Service Instance
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const Sidebar: React.FC<{
  params: IsochroneParams;
  setParams: React.Dispatch<React.SetStateAction<IsochroneParams>>;
  isLoading: boolean;
  history: IsochroneResult[];
  isPoiSelected: boolean;
  onRemoveItem: (index: number) => void;
  onClearAll: () => void;
  onExport: (data: any, name: string) => void;
  onUpload: (file: File) => void;
  onStartAnalysis: () => void;
}> = ({ params, setParams, isLoading, history, isPoiSelected, onRemoveItem, onClearAll, onExport, onUpload, onStartAnalysis }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setMode = (mode: TransportMode) => setParams(prev => ({ ...prev, mode }));
  const setMinutes = (minutes: number) => setParams(prev => ({ ...prev, minutes }));

  return (
    <div className="w-80 h-full bg-slate-900 border-r border-slate-800 flex flex-col p-4 shadow-2xl z-20">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-indigo-600 rounded-lg">
          <MapIcon className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white">NusaIsochrone</h1>
      </div>

      <div className="space-y-6 flex-1 overflow-y-auto pr-2">
        <section>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
            Analysis Parameters
          </label>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TransportMode) as Array<keyof typeof TransportMode>).map((m) => {
                const value = TransportMode[m];
                const isActive = params.mode === value;
                return (
                  <button
                    key={value}
                    onClick={() => setMode(value)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                      isActive 
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40' 
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {value === TransportMode.DRIVING && <Car className="w-5 h-5 mb-1" />}
                    {value === TransportMode.CYCLING && <Bike className="w-5 h-5 mb-1" />}
                    {value === TransportMode.WALKING && <Footprints className="w-5 h-5 mb-1" />}
                    <span className="text-[10px] font-medium capitalize">{value}</span>
                  </button>
                );
              })}
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-300">Time Limit</span>
                <span className="text-sm font-bold text-indigo-400">{params.minutes} min</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {TIME_INTERVALS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setMinutes(t)}
                    className={`text-xs py-1.5 rounded-md transition-all ${
                      params.minutes === t 
                        ? 'bg-indigo-50 text-indigo-600 font-bold' 
                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    }`}
                  >
                    {t}m
                  </button>
                ))}
              </div>
            </div>

            <button 
              disabled={!isPoiSelected || isLoading}
              onClick={onStartAnalysis}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all shadow-lg ${
                isPoiSelected && !isLoading
                  ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-900/40 active:scale-[0.98]'
                  : 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isPoiSelected ? 'Start Analysis' : 'Click Map to Select POI'}
            </button>

            {!isPoiSelected && (
              <p className="text-[11px] text-amber-500/80 italic flex items-center gap-1.5 px-1">
                <Info className="w-3 h-3" />
                Select a reference point on the map first.
              </p>
            )}
          </div>
        </section>

        <section>
          <div className="flex justify-between items-center mb-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Layers & History
            </label>
            {history.length > 0 && (
              <button 
                onClick={onClearAll}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          
          <div className="space-y-2">
            {history.length === 0 ? (
              <div className="border-2 border-dashed border-slate-800 rounded-xl p-6 text-center">
                <Info className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  No analysis results yet. Select a location to begin.
                </p>
              </div>
            ) : (
              history.map((item, idx) => (
                <div key={idx} className="bg-slate-800 rounded-lg p-3 border border-slate-700 group animate-in slide-in-from-right-2 duration-300">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        item.params.mode === TransportMode.DRIVING ? 'bg-rose-500' : 
                        item.params.mode === TransportMode.CYCLING ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} />
                      <span className="text-xs font-bold text-slate-200 capitalize">
                        {item.params.mode} - {item.params.minutes}m
                      </span>
                    </div>
                    <button 
                      onClick={() => onRemoveItem(idx)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => onExport(item.polygon, `isochrone_${item.params.mode}_${item.params.minutes}m.geojson`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-[10px] text-slate-300 font-medium transition-colors"
                    >
                      <FileJson className="w-3 h-3" /> GeoJSON
                    </button>
                    <button 
                      disabled
                      title="Shapefile export requires backend processing"
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-700/50 cursor-not-allowed rounded text-[10px] text-slate-500 font-medium"
                    >
                      <Download className="w-3 h-3" /> .SHP
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="pt-4 border-t border-slate-800">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 rounded-xl text-sm font-semibold hover:bg-indigo-600 hover:text-white transition-all group"
          >
            <Upload className="w-4 h-4 group-hover:-translate-y-1 transition-transform" />
            Upload Spatial Data
          </button>
        </section>
      </div>

      <div className="mt-auto pt-6">
        <div className="p-3 bg-indigo-950/30 rounded-xl border border-indigo-500/10">
          <div className="flex items-center gap-2 text-indigo-400 mb-1">
            <Info className="w-3 h-3" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Analyst Info</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            NusaIsochrone utilizes Dijkstra's shortest-path algorithm over OSM network graph. Indonesia specific average speeds are calibrated for urban morphology.
          </p>
        </div>
      </div>
    </div>
  );
};

const MapEvents: React.FC<{ onClick: (lat: number, lng: number) => void }> = ({ onClick }) => {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const App: React.FC = () => {
  const [params, setParams] = useState<IsochroneParams>({
    lat: DEFAULT_CENTER[0],
    lng: DEFAULT_CENTER[1],
    mode: TransportMode.WALKING,
    minutes: 15
  });
  const [activePoi, setActivePoi] = useState<[number, number] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<IsochroneResult[]>([]);
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);
  const [aiAnalysisContent, setAiAnalysisContent] = useState("");

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setActivePoi([lat, lng]);
    setParams(prev => ({ ...prev, lat, lng }));
  }, []);

  const calculateIsochrone = useCallback(async (customParams?: IsochroneParams) => {
    const activeParams = customParams || params;
    if (!activeParams.lat || !activeParams.lng) return;

    setIsLoading(true);
    try {
      // 1. Fetch data from Overpass
      const speedMS = (TRANSPORT_SPEEDS[activeParams.mode] * 1000) / 3600;
      const radius = speedMS * (activeParams.minutes * 60) * 1.5; // Padding factor
      
      const graph = await fetchRoadNetwork(activeParams.lat, activeParams.lng, radius, activeParams.mode);
      
      // 2. Run Dijkstra
      const nodes = calculateDijkstra(graph, activeParams.lat, activeParams.lng, activeParams.minutes * 60);
      
      // 3. Generate Hull
      const hull = generateHull(nodes, activeParams.minutes * 60);
      
      if (hull) {
        const result: IsochroneResult = {
          polygon: hull,
          params: { ...activeParams }
        };
        setHistory(prev => [result, ...prev]);
        
        // AI Planning Context
        generateAiPlanningContext(activeParams, hull);
      } else {
        alert("Could not generate isochrone for this area. It might be sparse in OSM data.");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to calculate isochrone. Check network connectivity.");
    } finally {
      setIsLoading(false);
    }
  }, [params]);

  const generateAiPlanningContext = async (p: IsochroneParams, geojson: any) => {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `As an Urban Planning Assistant, explain the significance of a ${p.minutes}-minute ${p.mode} isochrone at latitude ${p.lat}, longitude ${p.lng} in the Indonesian context. Mention the "15-minute city" concept if applicable. Keep it concise (3 sentences).`,
      });
      setAiAnalysisContent(response.text || "");
      setShowAiAnalysis(true);
    } catch (e) {
      console.error("AI Analysis failed", e);
    }
  };

  const handleExport = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const geojson = JSON.parse(text);
        
        // If it's a point, set it as POI
        if (geojson.type === 'FeatureCollection' || geojson.type === 'Feature') {
          const feature = geojson.type === 'Feature' ? geojson : geojson.features[0];
          if (feature.geometry.type === 'Point') {
            const [lng, lat] = feature.geometry.coordinates;
            handleMapClick(lat, lng);
          } else {
            // Add to history as a static layer
            setHistory(prev => [{
              polygon: geojson,
              params: { lat: 0, lng: 0, mode: TransportMode.WALKING, minutes: 0 }
            }, ...prev]);
          }
        }
      } catch (err) {
        alert("Only valid GeoJSON is supported in this web preview.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex h-screen w-full bg-slate-950">
      <Sidebar 
        params={params}
        setParams={setParams}
        isLoading={isLoading} 
        history={history}
        isPoiSelected={!!activePoi}
        onRemoveItem={(idx) => setHistory(h => h.filter((_, i) => i !== idx))}
        onClearAll={() => setHistory([])}
        onExport={handleExport}
        onUpload={handleUpload}
        onStartAnalysis={() => calculateIsochrone()}
      />
      
      <main className="flex-1 relative">
        <MapContainer 
          center={DEFAULT_CENTER} 
          zoom={13} 
          scrollWheelZoom={true}
          className="w-full h-full"
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="CartoDB Dark">
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="OpenStreetMap">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Esri World Imagery">
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EBP, and the GIS User Community'
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          <ScaleControl position="bottomleft" />
          <MapEvents onClick={handleMapClick} />

          {activePoi && (
            <Marker position={activePoi}>
              <Popup className="custom-popup">
                <div className="p-2 min-w-[200px]">
                  <div className="flex justify-between items-center border-b pb-2 mb-3">
                    <h3 className="font-bold text-slate-900">Reference POI</h3>
                    <div className="bg-indigo-100 text-indigo-700 p-1 rounded-full">
                      <Navigation className="w-3 h-3" />
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter block mb-1">Coordinates</label>
                      <div className="flex gap-2">
                        <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono">{activePoi[0].toFixed(5)}</span>
                        <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono">{activePoi[1].toFixed(5)}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter block mb-1">Quick Analysis (Min)</label>
                      <div className="flex flex-wrap gap-1.5">
                        {TIME_INTERVALS.map(t => (
                          <button 
                            key={t}
                            onClick={() => calculateIsochrone({ ...params, minutes: t })}
                            className="px-2 py-1 bg-white border border-slate-200 text-slate-700 text-[10px] font-bold rounded-md hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm"
                          >
                            {t}m
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <button 
                      disabled={isLoading}
                      onClick={() => calculateIsochrone()}
                      className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      Start Full Analysis
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

          {history.map((item, idx) => (
            <GeoJSON 
              key={`${idx}-${JSON.stringify(item.params)}`} 
              data={item.polygon} 
              style={{
                color: item.params.mode === TransportMode.DRIVING ? '#f43f5e' : 
                       item.params.mode === TransportMode.CYCLING ? '#f59e0b' : '#10b981',
                fillColor: item.params.mode === TransportMode.DRIVING ? '#f43f5e' : 
                          item.params.mode === TransportMode.CYCLING ? '#f59e0b' : '#10b981',
                fillOpacity: 0.15,
                weight: 2,
                dashArray: '5, 5'
              }}
            />
          ))}
        </MapContainer>

        {/* Floating Indicator for Loading */}
        {isLoading && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/95 border border-slate-700 px-6 py-3 rounded-full flex items-center gap-4 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
            <div className="relative">
              <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
              <div className="absolute inset-0 bg-indigo-500/20 blur-lg rounded-full animate-pulse" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-100">Processing Graph</span>
              <span className="text-[10px] text-slate-500">Retrieving OSM road network...</span>
            </div>
          </div>
        )}

        {/* AI Insight Overlay */}
        {showAiAnalysis && (
          <div className="absolute bottom-10 left-10 right-10 md:left-auto md:right-10 md:max-w-sm z-[1000] animate-in slide-in-from-bottom-5 fade-in duration-500">
            <div className="bg-slate-900/90 border border-indigo-500/30 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl ring-1 ring-white/10">
              <div className="bg-indigo-600/20 px-4 py-3 border-b border-indigo-500/10 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="bg-indigo-500 p-1 rounded-lg">
                    <Settings className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">Geo-Spatial Insight</span>
                </div>
                <button onClick={() => setShowAiAnalysis(false)} className="text-slate-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5">
                <p className="text-xs text-slate-300 leading-relaxed font-medium">
                  "{aiAnalysisContent}"
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 w-1/3 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Map Legend */}
        <div className="absolute bottom-10 left-6 z-[1000] bg-slate-900/90 border border-slate-700 p-5 rounded-3xl shadow-2xl backdrop-blur-md space-y-4 ring-1 ring-white/5">
          <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-1">Nusa Iso-Key</h4>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4 group">
              <div className="w-4 h-4 rounded-md bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)] group-hover:scale-110 transition-transform" />
              <div className="flex flex-col">
                <span className="text-[11px] text-slate-200 font-bold">Driving</span>
                <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Road Grid</span>
              </div>
            </div>
            <div className="flex items-center gap-4 group">
              <div className="w-4 h-4 rounded-md bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.5)] group-hover:scale-110 transition-transform" />
              <div className="flex flex-col">
                <span className="text-[11px] text-slate-200 font-bold">Cycling</span>
                <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Bicycle Paths</span>
              </div>
            </div>
            <div className="flex items-center gap-4 group">
              <div className="w-4 h-4 rounded-md bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] group-hover:scale-110 transition-transform" />
              <div className="flex flex-col">
                <span className="text-[11px] text-slate-200 font-bold">Walking</span>
                <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Pedestrian Way</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
