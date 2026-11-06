// Source: Google Maps Platform Code Assist
import { Loader } from '@googlemaps/js-api-loader';
import firebaseConfig from '../../firebase-applet-config.json';
import { Order, CourierInfo } from '../types';

let isMapsLoaded = false;
let mapsLoadPromise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (isMapsLoaded) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;

  const apiKey = firebaseConfig.apiKey;
  const loader = new Loader({
    apiKey: apiKey || '',
    version: 'weekly',
    libraries: ['maps', 'marker', 'geometry'],
  });

  mapsLoadPromise = (loader as any)
    .load()
    .then(() => {
      isMapsLoaded = true;
    })
    .catch((err: unknown) => {
      console.warn('Google Maps loader warning:', err);
    });

  return mapsLoadPromise ?? Promise.resolve();
}

export interface DeliveryWaypoint {
  lat: number;
  lng: number;
  label: string;
  time: string;
  status: 'passed' | 'current' | 'upcoming';
}

export class GoogleMapsDeliveryTracker {
  private container: HTMLElement;
  private order: Order;
  private map: google.maps.Map | null = null;
  private courierMarker: any = null;
  private destinationMarker: any = null;
  private depotMarker: any = null;
  private routePolyline: google.maps.Polyline | null = null;
  private completedPolyline: google.maps.Polyline | null = null;
  private routeCoordinates: google.maps.LatLngLiteral[] = [];
  private waypoints: DeliveryWaypoint[] = [];
  private waypointMarkers: any[] = [];
  private animationInterval: number | null = null;
  private simSpeedMultiplier = 1;
  private currentStepIndex = 0;
  private totalSteps = 200;
  private onStatusChange?: (courier: CourierInfo) => void;

  constructor(container: HTMLElement, order: Order, onStatusChange?: (courier: CourierInfo) => void) {
    this.container = container;
    this.order = order;
    this.onStatusChange = onStatusChange;
    this.generateRouteWaypoints();
  }

  private generateRouteWaypoints() {
    const courier = this.order.courier;
    const startLat = courier.currentLat; // San Francisco SoMa Depot (approx 37.7749)
    const startLng = courier.currentLng; // (-122.4194)
    const endLat = courier.destinationLat;
    const endLng = courier.destinationLng;

    // Generate realistic urban waypoints through streets
    const midLat1 = startLat + (endLat - startLat) * 0.3 + 0.003;
    const midLng1 = startLng + (endLng - startLng) * 0.25 - 0.002;
    const midLat2 = startLat + (endLat - startLat) * 0.65 - 0.002;
    const midLng2 = startLng + (endLng - startLng) * 0.7 + 0.003;

    // Key Milestone Waypoints
    this.waypoints = [
      {
        lat: startLat,
        lng: startLng,
        label: 'Aether Global Depot Hub #04',
        time: '04:15 AM',
        status: 'passed',
      },
      {
        lat: midLat1,
        lng: midLng1,
        label: 'Market St Transit Corridor',
        time: '04:26 AM',
        status: 'passed',
      },
      {
        lat: midLat2,
        lng: midLng2,
        label: 'Neighborhood Local Sector 7',
        time: '04:38 AM',
        status: 'current',
      },
      {
        lat: endLat,
        lng: endLng,
        label: this.order.shippingAddress.street || 'Recipient Destination',
        time: this.order.estimatedDelivery || '04:50 AM',
        status: 'upcoming',
      },
    ];

    // Interpolate points for smooth animation
    this.routeCoordinates = this.interpolatePath([
      { lat: startLat, lng: startLng },
      { lat: midLat1, lng: midLng1 },
      { lat: midLat2, lng: midLng2 },
      { lat: endLat, lng: endLng },
    ]);
  }

  private interpolatePath(nodes: google.maps.LatLngLiteral[]): google.maps.LatLngLiteral[] {
    const fullPath: google.maps.LatLngLiteral[] = [];
    const segments = nodes.length - 1;
    const stepsPerSegment = Math.floor(this.totalSteps / segments);

    for (let i = 0; i < segments; i++) {
      const p1 = nodes[i];
      const p2 = nodes[i + 1];
      for (let s = 0; s < stepsPerSegment; s++) {
        const t = s / stepsPerSegment;
        fullPath.push({
          lat: p1.lat + (p2.lat - p1.lat) * t,
          lng: p1.lng + (p2.lng - p1.lng) * t,
        });
      }
    }
    fullPath.push(nodes[nodes.length - 1]);
    return fullPath;
  }

  public async render() {
    this.container.innerHTML = `
      <div class="flex flex-col h-full w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl relative">
        
        <!-- Top Toolbar with Actions -->
        <div class="z-20 p-3 sm:p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <span class="material-symbols-outlined text-[20px]">electric_moped</span>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-bold text-slate-900 dark:text-white">${this.order.courier.name}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400">
                  En Route · Priority
                </span>
              </div>
              <div class="text-xs text-slate-500">${this.order.courier.vehicle} · Rated 4.95 ★</div>
            </div>
          </div>

          <!-- Controls: Recenter, Fit Route, Speed -->
          <div class="flex items-center gap-2">
            <button id="gmp-recenter-btn" class="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-colors">
              <span class="material-symbols-outlined text-[16px]">my_location</span>
              <span class="hidden sm:inline">Courier</span>
            </button>
            <button id="gmp-fit-route-btn" class="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-colors">
              <span class="material-symbols-outlined text-[16px]">crop_free</span>
              <span class="hidden sm:inline">Fit Route</span>
            </button>
            <button id="gmp-speed-btn" class="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors">
              <span id="gmp-speed-label">1x Speed</span>
            </button>
          </div>
        </div>

        <!-- Main Map Area (Explicit height container per CF2) -->
        <div class="relative flex-1 w-full min-h-[380px] md:min-h-[460px]">
          <div id="gmp-delivery-map-element" class="w-full h-full"></div>

          <!-- Floating Live Telematics Glass Card (Bottom-Left) -->
          <div class="absolute bottom-4 left-4 z-10 w-[92%] max-w-sm bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 backdrop-blur shadow-2xl">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="relative flex h-2.5 w-2.5">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                </span>
                <span class="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Live Telematics</span>
              </div>
              <div class="text-right">
                <span id="gmp-eta-val" class="text-sm font-mono font-bold text-blue-600 dark:text-cyan-400 tabular-nums">
                  ${this.order.courier.etaMinutes} mins
                </span>
              </div>
            </div>

            <!-- Progress Track Bar -->
            <div class="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-3">
              <div id="gmp-progress-bar" style="width: ${this.order.courier.progressPercent}%;" class="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all duration-300"></div>
            </div>

            <div class="grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div>
                <span>Speed:</span>
                <span id="gmp-speed-val" class="font-mono font-bold text-slate-800 dark:text-slate-200">${this.order.courier.speedKmh} km/h</span>
              </div>
              <div class="text-right">
                <span>Distance:</span>
                <span id="gmp-dist-val" class="font-mono font-bold text-slate-800 dark:text-slate-200">1.8 miles</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom Milestones Progress Timeline Strip -->
        <div class="z-20 p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
          <div class="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center justify-between">
            <span>Delivery Checkpoint Timeline</span>
            <span class="text-[11px] text-slate-400 font-normal">Encrypted IoT Telemetry</span>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            ${this.waypoints
              .map(
                (wp, idx) => `
              <div class="p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                wp.status === 'passed'
                  ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200'
                  : wp.status === 'current'
                  ? 'bg-cyan-50/70 dark:bg-cyan-950/40 border-cyan-400 text-cyan-900 dark:text-cyan-200 shadow-sm'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'
              }">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-bold text-[10px] uppercase">Stop 0${idx + 1}</span>
                  <span class="font-mono text-[10px]">${wp.time}</span>
                </div>
                <div class="font-semibold line-clamp-1 text-[11px]">${wp.label}</div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    this.bindToolbarEvents();
    await this.mountGoogleMap();
  }

  private bindToolbarEvents() {
    this.container.querySelector('#gmp-recenter-btn')?.addEventListener('click', () => {
      if (this.map && this.courierMarker) {
        const pos = this.courierMarker.position;
        if (pos) {
          this.map.panTo(pos);
          this.map.setZoom(16);
        }
      }
    });

    this.container.querySelector('#gmp-fit-route-btn')?.addEventListener('click', () => {
      this.fitRouteBounds();
    });

    const speedBtn = this.container.querySelector('#gmp-speed-btn');
    const speedLabel = this.container.querySelector('#gmp-speed-label');
    speedBtn?.addEventListener('click', () => {
      if (this.simSpeedMultiplier === 1) {
        this.simSpeedMultiplier = 3;
        if (speedLabel) speedLabel.textContent = '3x Speed';
      } else if (this.simSpeedMultiplier === 3) {
        this.simSpeedMultiplier = 6;
        if (speedLabel) speedLabel.textContent = '6x Speed';
      } else {
        this.simSpeedMultiplier = 1;
        if (speedLabel) speedLabel.textContent = '1x Speed';
      }
      this.restartAnimation();
    });
  }

  private async mountGoogleMap() {
    await loadGoogleMaps();

    const mapElement = this.container.querySelector('#gmp-delivery-map-element') as HTMLElement;
    if (!mapElement) return;

    if (!(window as any).google?.maps) {
      this.renderCanvasFallback(mapElement);
      return;
    }

    try {
      const { Map } = (await (window as any).google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
      const { AdvancedMarkerElement, PinElement } = (await (window as any).google.maps.importLibrary(
        'marker'
      )) as google.maps.MarkerLibrary;

      const courier = this.order.courier;
      const startPos = { lat: courier.currentLat, lng: courier.currentLng };
      const destPos = { lat: courier.destinationLat, lng: courier.destinationLng };

      // Initialize Map with mandatory mapId for AdvancedMarkerElement
      this.map = new Map(mapElement, {
        center: {
          lat: (startPos.lat + destPos.lat) / 2,
          lng: (startPos.lng + destPos.lng) / 2,
        },
        zoom: 14,
        mapId: 'DEMO_MAP_ID',
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: true,
        fullscreenControl: true,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }],
          },
        ],
      });

      // 1. Origin Depot Pin
      const depotPin = new PinElement({
        background: '#3b82f6',
        borderColor: '#1e3a8a',
        glyphColor: '#ffffff',
        glyphText: 'Æ',
      });
      this.depotMarker = new AdvancedMarkerElement({
        map: this.map,
        position: startPos,
        title: 'Aether Global Depot Hub #04',
        content: depotPin.element,
      });

      // 2. Destination Pin
      const destPin = new PinElement({
        background: '#10b981',
        borderColor: '#064e3b',
        glyphColor: '#ffffff',
      });
      this.destinationMarker = new AdvancedMarkerElement({
        map: this.map,
        position: destPos,
        title: 'Customer Delivery Address',
        content: destPin.element,
      });

      // 3. Custom Animated Courier Marker Element with live heading
      const courierEl = document.createElement('div');
      courierEl.className = 'gmp-courier-pulse-marker';
      courierEl.innerHTML = `
        <div style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <div style="position: absolute; inset: 0; border-radius: 50%; background: rgba(56, 189, 248, 0.35); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 36px; height: 36px; border-radius: 50%; background: #0284c7; border: 2.5px solid #ffffff; box-shadow: 0 4px 14px rgba(2,132,199,0.5); display: flex; align-items: center; justify-content: center; color: white;">
            <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>
      `;

      this.courierMarker = new AdvancedMarkerElement({
        map: this.map,
        position: this.routeCoordinates[0],
        title: `Courier: ${this.order.courier.name}`,
        content: courierEl,
      });

      // 4. Full Planned Route Polyline
      this.routePolyline = new google.maps.Polyline({
        path: this.routeCoordinates,
        geodesic: true,
        strokeColor: '#38bdf8',
        strokeOpacity: 0.6,
        strokeWeight: 5,
        map: this.map,
      });

      // 5. Active Completed Route Polyline (Glow effect)
      this.completedPolyline = new google.maps.Polyline({
        path: [this.routeCoordinates[0]],
        geodesic: true,
        strokeColor: '#2563eb',
        strokeOpacity: 0.95,
        strokeWeight: 6,
        map: this.map,
      });

      this.fitRouteBounds();
      this.startAnimation();
    } catch (err) {
      console.warn('Google Maps setup failed, rendering fallback canvas:', err);
      this.renderCanvasFallback(mapElement);
    }
  }

  private fitRouteBounds() {
    if (!this.map || this.routeCoordinates.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    this.routeCoordinates.forEach((coord) => bounds.extend(coord));
    this.map.fitBounds(bounds, { top: 60, right: 60, bottom: 80, left: 60 });
  }

  private startAnimation() {
    this.stopAnimation();
    const intervalMs = Math.max(100, Math.floor(1000 / this.simSpeedMultiplier));

    this.animationInterval = window.setInterval(() => {
      this.currentStepIndex = Math.min(this.routeCoordinates.length - 1, this.currentStepIndex + 1);
      const currentPos = this.routeCoordinates[this.currentStepIndex];

      if (this.courierMarker) {
        this.courierMarker.position = currentPos;
      }

      if (this.completedPolyline) {
        const completedPath = this.routeCoordinates.slice(0, this.currentStepIndex + 1);
        this.completedPolyline.setPath(completedPath);
      }

      // Progress Calculation
      const progress = (this.currentStepIndex / (this.routeCoordinates.length - 1)) * 100;
      const etaMinutes = Math.max(1, Math.round(18 * (1 - progress / 100)));
      const distRemaining = Math.max(0.1, Number((2.4 * (1 - progress / 100)).toFixed(1)));
      const speed = Math.round(38 + Math.sin(this.currentStepIndex * 0.2) * 8);

      // Update DOM Indicators
      const pBar = this.container.querySelector('#gmp-progress-bar') as HTMLElement;
      const etaEl = this.container.querySelector('#gmp-eta-val');
      const distEl = this.container.querySelector('#gmp-dist-val');
      const speedEl = this.container.querySelector('#gmp-speed-val');

      if (pBar) pBar.style.width = `${progress}%`;
      if (etaEl) etaEl.textContent = `${etaMinutes} mins`;
      if (distEl) distEl.textContent = `${distRemaining} miles`;
      if (speedEl) speedEl.textContent = `${speed} km/h`;

      if (this.onStatusChange) {
        this.onStatusChange({
          ...this.order.courier,
          currentLat: currentPos.lat,
          currentLng: currentPos.lng,
          progressPercent: progress,
          etaMinutes,
          speedKmh: speed,
        });
      }

      if (this.currentStepIndex >= this.routeCoordinates.length - 1) {
        this.stopAnimation();
      }
    }, intervalMs);
  }

  private restartAnimation() {
    this.startAnimation();
  }

  private stopAnimation() {
    if (this.animationInterval !== null) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
  }

  private renderCanvasFallback(target: HTMLElement) {
    target.innerHTML = `
      <div style="width: 100%; height: 100%; background: #0f172a; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white;">
        <div style="position: absolute; inset: 0; opacity: 0.15; background-image: radial-gradient(#38bdf8 1.5px, transparent 1.5px); background-size: 28px 28px;"></div>
        
        <!-- Animated Pulse Grid -->
        <div style="position: relative; z-index: 10; width: 88%; max-width: 480px; background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.6);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span class="material-symbols-outlined" style="color: #38bdf8; font-size: 28px;">local_shipping</span>
              <div>
                <div style="font-weight: 800; font-size: 15px;">${this.order.courier.name}</div>
                <div style="font-size: 12px; color: #94a3b8;">${this.order.courier.vehicle} · Express Route</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div id="fb-eta" style="font-size: 20px; font-weight: 800; color: #38bdf8; font-family: monospace;">14 MIN</div>
              <div style="font-size: 10px; color: #64748b; font-weight: 600;">LIVE ETA</div>
            </div>
          </div>

          <div style="width: 100%; height: 8px; background: #334155; border-radius: 9999px; overflow: hidden; margin-bottom: 14px;">
            <div id="fb-bar" style="width: 25%; height: 100%; background: linear-gradient(90deg, #2563eb, #38bdf8); transition: width 0.3s ease;"></div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #cbd5e1;">
            <span>Aether Depot Hub</span>
            <span style="color: #10b981;">Customer Destination</span>
          </div>
        </div>
      </div>
    `;

    let p = 25;
    this.animationInterval = window.setInterval(() => {
      p = Math.min(100, p + 1);
      const b = target.querySelector('#fb-bar') as HTMLElement;
      const eta = target.querySelector('#fb-eta');
      if (b) b.style.width = `${p}%`;
      if (eta) eta.textContent = `${Math.max(1, Math.round(18 * (1 - p / 100)))} MIN`;
      if (p >= 100) this.stopAnimation();
    }, 1000);
  }

  public destroy() {
    this.stopAnimation();
    this.routePolyline?.setMap(null);
    this.completedPolyline?.setMap(null);
    this.courierMarker?.setMap(null);
    this.destinationMarker?.setMap(null);
    this.depotMarker?.setMap(null);
    this.waypointMarkers.forEach((m) => m.setMap(null));
    this.map = null;
  }
}
