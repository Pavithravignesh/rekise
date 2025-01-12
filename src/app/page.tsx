'use client'
import React, { useEffect, useRef, useState } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { Draw, Modify } from 'ol/interaction';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Feature } from 'ol';
import { LineString, Polygon, Geometry } from 'ol/geom';
import { getLength, getArea } from 'ol/sphere';
import { transform } from 'ol/proj';
import { Interaction } from 'ol/interaction';

interface Coordinate {
  id: string | number;
  waypoint: string;
  coordinates: [string, string];
  distance: number;
  selected?: boolean;
}

interface InsertionPoint {
  index: number;
  position: 'before' | 'after';
}

const MapDrawingApp = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<Map | null>(null);
  const [vectorSource] = useState(new VectorSource());
  const [coordinates, setCoordinates] = useState<Coordinate[]>([]);
  const [drawType, setDrawType] = useState<'LineString' | 'Polygon' | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showInitialModal, setShowInitialModal] = useState(false);
  const [activeFeature, setActiveFeature] = useState<Feature<Geometry> | null>(null);
  const [insertionPoint, setInsertionPoint] = useState<InsertionPoint | null>(null);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  const [polygonCoordinates, setPolygonCoordinates] = useState<Coordinate[]>([]);
  const [showPolygonModal, setShowPolygonModal] = useState(false);
  const [showLoadingText, setShowLoadingText] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLoadingText(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    const initialMap = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
        new VectorLayer({
          source: vectorSource,
        }),
      ],
      view: new View({
        center: transform([88.8639, 21.7644], 'EPSG:4326', 'EPSG:3857'), // Centered on Sagar Island area
        zoom: 10,
      }),
    });

    setMap(initialMap);

    return () => initialMap.setTarget(undefined);
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [activeFeature, map]);

  const formatCoordinate = (coord: number, isLatitude: boolean): string => {
    const direction = isLatitude ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'W');
    return `${Math.abs(coord).toFixed(8)}° ${direction}`;
  };

  const startDrawing = (type: 'LineString' | 'Polygon') => {
    if (!map) return;

    map.getInteractions().forEach((interaction: Interaction) => {
      if (interaction instanceof Draw) {
        map.removeInteraction(interaction);
      }
    });

    const draw = new Draw({
      source: vectorSource,
      type: type,
    });

    draw.on('drawstart', (event) => {
      setActiveFeature(event.feature);
      setCoordinates([]);
    });

    draw.on('drawend', (event) => {
      setActiveFeature(null);
      const feature = event.feature;
      const geometry = feature.getGeometry();
      if (!geometry) return;

      let coords;
      if (type === 'LineString' && geometry instanceof LineString) {
        coords = geometry.getCoordinates();
        const transformedCoords = coords.map((coord: number[]) => transform(coord, 'EPSG:3857', 'EPSG:4326'));
        const distances: number[] = [];
        for (let i = 1; i < transformedCoords.length; i++) {
          const line = new LineString([transformedCoords[i - 1], transformedCoords[i]]);
          const distance = getLength(line, { projection: 'EPSG:4326' });
          distances.push(Math.round(distance));
        }

        const newCoordinates: Coordinate[] = transformedCoords.map((coord: number[], index: number) => ({
          id: index,
          waypoint: `WP${String(index).padStart(2, '0')}`,
          coordinates: [
            formatCoordinate(coord[0], false),
            formatCoordinate(coord[1], true)
          ],
          distance: index > 0 ? distances[index - 1] : 0,
          selected: false
        }));

        setCoordinates(newCoordinates);
      } else if (type === 'Polygon' && geometry instanceof Polygon) {
        coords = geometry.getCoordinates()[0];
        const transformedCoords = coords.map((coord: number[]) => transform(coord, 'EPSG:3857', 'EPSG:4326'));
        const distances: number[] = [];
        for (let i = 1; i < transformedCoords.length; i++) {
          const line = new LineString([transformedCoords[i - 1], transformedCoords[i]]);
          const distance = getLength(line, { projection: 'EPSG:4326' });
          distances.push(Math.round(distance));
        }

        const newCoordinates: Coordinate[] = transformedCoords.map((coord: number[], index: number) => ({
          id: index,
          waypoint: `WP${String(index).padStart(2, '0')}`,
          coordinates: [
            formatCoordinate(coord[0], false),
            formatCoordinate(coord[1], true)
          ],
          distance: index > 0 ? distances[index - 1] : 0,
          selected: false
        }));

        setCoordinates(newCoordinates);
      }
      setShowModal(true);
    });

    map.addInteraction(draw);
    setDrawType(type);
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && activeFeature && map) {
      map.getInteractions().forEach((interaction: Interaction) => {
        if (interaction instanceof Draw) {
          interaction.finishDrawing();
        }
      });
    }
  };

  const insertPolygon = (index: number, position: 'before' | 'after') => {
    setInsertionPoint({ index, position });
    setShowModal(false);
    setIsDrawingPolygon(true);
    startDrawing('Polygon');
  };

  const toggleCoordinateSelection = (id: string | number) => {
    const updatedCoordinates = coordinates.map(coord =>
      coord.id === id ? { ...coord, selected: !coord.selected } : coord
    );
    setCoordinates(updatedCoordinates);
  };

  const handleDrawClick = () => {
    setShowInitialModal(true);
    startDrawing('LineString');
  };

  const handlePolygonComplete = () => {
    setShowPolygonModal(true);
  };

  useEffect(() => {
    if (isDrawingPolygon && activeFeature) {
      const listener = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          const geometry = activeFeature.getGeometry();
          if (!geometry || !(geometry instanceof Polygon)) return;

          const coords = geometry.getCoordinates()[0];
          const transformedCoords = coords.map((coord: number[]) => transform(coord, 'EPSG:3857', 'EPSG:4326'));

          const distances: number[] = [];
          for (let i = 1; i < transformedCoords.length; i++) {
            const line = new LineString([transformedCoords[i - 1], transformedCoords[i]]);
            const distance = getLength(line, { projection: 'EPSG:4326' });
            distances.push(Math.round(distance));
          }

          const polygonPoints: Coordinate[] = transformedCoords.map((coord: number[], idx: number) => ({
            id: `p${idx}`,
            waypoint: `WP${String(idx).padStart(2, '0')}`,
            coordinates: [
              formatCoordinate(coord[0], false),
              formatCoordinate(coord[1], true)
            ],
            distance: idx > 0 ? distances[idx - 1] : 0,
            selected: false
          }));

          setPolygonCoordinates(polygonPoints);
          setIsDrawingPolygon(false);
          handlePolygonComplete();
        }
      };

      document.addEventListener('keydown', listener);
      return () => document.removeEventListener('keydown', listener);
    }
  }, [isDrawingPolygon, activeFeature]);

  const importPolygonPoints = () => {
    if (!insertionPoint) return;

    const { index, position } = insertionPoint;
    const newCoordinates = [...coordinates];

    // Create new array of coordinates with updated distances
    const updatedPolygonCoordinates = polygonCoordinates.map((coord, idx) => {
      let distance = 0;
      if (idx > 0) {
        // Calculate distance from previous point
        const prevCoord = polygonCoordinates[idx - 1].coordinates;
        const currentCoord = coord.coordinates;
        const line = new LineString([
          [parseFloat(prevCoord[0]), parseFloat(prevCoord[1])],
          [parseFloat(currentCoord[0]), parseFloat(currentCoord[1])]
        ]);
        distance = getLength(line, { projection: 'EPSG:4326' });
      }
      return {
        ...coord,
        distance: Math.round(distance)
      };
    });

    // Insert the polygon coordinates at the correct position
    if (position === 'before') {
      newCoordinates.splice(index, 0, ...updatedPolygonCoordinates);
    } else {
      newCoordinates.splice(index + 1, 0, ...updatedPolygonCoordinates);
    }

    // Update all waypoint numbers and IDs
    const updatedCoordinates = newCoordinates.map((coord, idx) => ({
      ...coord,
      id: idx,
      waypoint: `WP${String(idx).padStart(2, '0')}`
    }));

    setCoordinates(updatedCoordinates);
    setPolygonCoordinates([]);
    setInsertionPoint(null);
  };

  return (
    <div className="h-screen flex flex-col relative">

      {/* lasy loading  */}
      {showLoadingText && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <h1 className="text-white text-8xl font-bold">Welcome</h1>
        </div>
      )}

      {/* btn - draw */}
      <div className="p-4 flex gap-4">
        <button
          onClick={handleDrawClick}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Draw
        </button>
      </div>

      <div ref={mapRef} className="flex-1" />

      {/*  */}
      {showInitialModal && !showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-3xl w-full transform transition-all duration-300 ease-out">
            <div className="flex items-center mb-2 pb-4 border-gray-300">
              <h2 className="text-2xl font-bold text-gray-800 flex-grow">Mission Creation</h2>
              <button
                onClick={() => setShowInitialModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl transition duration-200"
                aria-label="Close Modal"
              >
                &times;
              </button>
            </div>

            <div className="-mx-6">
              <hr className="border-t border-gray-300" />
            </div>

            <h3 className="font-semibold text-lg mb-4 p-2 mt-4 text-gray-700">Waypoint Navigation</h3>
            <p className="text-gray-600 mb-6 p-6 border-2 border-dashed border-gray-300 bg-gray-100 rounded-xl leading-relaxed">
              Click on the map to mark points of the route and then press <kbd className="font-bold">↵</kbd> to complete the route.
            </p>

            <div className="-mx-6">
              <hr className="border-t border-gray-300" />
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowInitialModal(false)}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg transition duration-200"
              >
                Generate Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/*  */}
      {showPolygonModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded-lg max-w-3xl w-full">
            <div className="flex items-center mb-4">
              <button
                onClick={() => setShowModal(true)}
                className="text-blue-500 flex items-center"
              >
                <span className="mr-2">←</span> Mission Planner
              </button>
            </div>
            <h2 className="text-xl font-bold mb-4">Polygon Tool</h2>
            <p className="text-gray-600 mb-4">
              Click on the map to mark points of the polygon's perimeter, then press ↵ to close and complete the polygon
            </p>
            <table className="w-full mb-4">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <th className="text-left">WP</th>
                  <th className="text-left">Coordinates</th>
                  <th className="text-left">Distance (m)</th>
                </tr>
              </thead>
              <tbody>
                {polygonCoordinates.map((coord, index) => (
                  <tr key={coord.id} className="border-t">
                    <td>
                      <input
                        type="checkbox"
                        checked={coord.selected}
                        onChange={() => toggleCoordinateSelection(coord.id)}
                        className="rounded"
                      />
                    </td>
                    <td>{coord.waypoint}</td>
                    <td>{coord.coordinates.join(', ')}</td>
                    <td>{coord.distance || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowPolygonModal(false);
                  setPolygonCoordinates([]);
                  setInsertionPoint(null);
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded"
              >
                Discard
              </button>
              <button
                onClick={() => {
                  importPolygonPoints();
                  setShowPolygonModal(false);
                  setShowModal(true);
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded"
              >
                Import Points
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-4 rounded-lg max-w-3xl w-full max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Mission Creation</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500">&times;</button>
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="w-8"></th>
                  <th className="text-left">WP</th>
                  <th className="text-left">Coordinates</th>
                  <th className="text-left">Distance (m)</th>
                  <th className="text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(polygonCoordinates.length > 0 ? polygonCoordinates : coordinates).map((coord, index) => (
                  <tr key={coord.id} className="border-t">
                    <td>
                      <input
                        type="checkbox"
                        checked={coord.selected}
                        onChange={() => toggleCoordinateSelection(coord.id)}
                        className="rounded"
                      />
                    </td>
                    <td>{coord.waypoint}</td>
                    <td>{coord.coordinates.join(', ')}</td>
                    <td>{coord.distance || '--'}</td>
                    <td>
                      {polygonCoordinates.length === 0 && (
                        <div className="relative group">
                          <button className="px-2 py-1">⋮</button>
                          <div className="hidden group-hover:block absolute right-0 bg-white shadow-lg rounded p-2 z-10 whitespace-nowrap">
                            <button
                              onClick={() => insertPolygon(index, 'before')}
                              className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                            >
                              Insert Polygon Before
                            </button>
                            <button
                              onClick={() => insertPolygon(index, 'after')}
                              className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                            >
                              Insert Polygon After
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-blue-500 text-white rounded"
              >
                Generate Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapDrawingApp;