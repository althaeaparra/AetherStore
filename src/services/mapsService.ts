import { Loader } from '@googlemaps/js-api-loader';
import firebaseConfig from '../../firebase-applet-config.json';
import { CourierInfo } from '../types';

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

export class OrderTrackingMap {
  private container: HTMLElement;
  private map: google.maps.Map | null = null;
  private courierMarker: any = null;
  private destinationMarker: any = null;
  private routeLine: google.maps.Polyline | null = null;
  private animationTimer: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(courier: CourierInfo, onUpdate?: (courier: CourierInfo) => void) {
    await loadGoogleMaps();

    if (!(window as any).google?.maps) {
      this.renderFallbackMap(courier);
      return;
    }

    try {
      const { Map } = (await (window as any).google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
      const { AdvancedMarkerElement, PinElement } = (await (window as any).google.maps.importLibrary(
        'marker'
      )) as google.maps.MarkerLibrary;

      const center = {
        lat: (courier.currentLat + courier.destinationLat) / 2,
        lng: (courier.currentLng + courier.destinationLng) / 2,
      };

      this.map = new Map(this.container, {
        center,
        zoom: 14,
        mapId: 'DEMO_MAP_ID', // Required for AdvancedMarkerElement
        disableDefaultUI: false,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
      });

      // Destination Pin
      const destPin = new PinElement({
        background: '#10b981',
        borderColor: '#065f46',
        glyphColor: '#ffffff',
      });
      this.destinationMarker = new AdvancedMarkerElement({
        map: this.map,
        position: { lat: courier.destinationLat, lng: courier.destinationLng },
        title: 'Delivery Destination',
        content: destPin.element,
      });

      // Custom Courier Pin with live pulsing radar ring
      const courierEl = document.createElement('div');
      courierEl.className = 'courier-custom-marker';
      courierEl.innerHTML = `
        <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background: rgba(59, 130, 246, 0.25); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 34px; height: 34px; border-radius: 50%; background: #2563eb; border: 3px solid #ffffff; box-shadow: 0 4px 12px rgba(37,99,235,0.4); display: flex; align-items: center; justify-content: center; color: white;">
            <svg style="width: 18px; height: 18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>
      `;

      this.courierMarker = new AdvancedMarkerElement({
        map: this.map,
        position: { lat: courier.currentLat, lng: courier.currentLng },
        title: `Courier: ${courier.name}`,
        content: courierEl,
      });

      // Route Path
      this.routeLine = new google.maps.Polyline({
        path: [
          { lat: courier.currentLat, lng: courier.currentLng },
          { lat: courier.destinationLat, lng: courier.destinationLng },
        ],
        geodesic: true,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.8,
        strokeWeight: 4,
        map: this.map,
      });

      // Start telematics simulation
      this.startSimulation(courier, onUpdate);
    } catch (e) {
      console.warn('Google Maps init failed, using live telemetry canvas fallback:', e);
      this.renderFallbackMap(courier, onUpdate);
    }
  }

  private startSimulation(courier: CourierInfo, onUpdate?: (courier: CourierInfo) => void) {
    let progress = courier.progressPercent;
    const startLat = courier.currentLat;
    const startLng = courier.currentLng;
    const destLat = courier.destinationLat;
    const destLng = courier.destinationLng;

    this.animationTimer = window.setInterval(() => {
      progress = Math.min(100, progress + 0.5);
      const currentLat = startLat + (destLat - startLat) * (progress / 100);
      const currentLng = startLng + (destLng - startLng) * (progress / 100);
      const etaMinutes = Math.max(1, Math.round(15 * (1 - progress / 100)));

      if (this.courierMarker) {
        this.courierMarker.position = { lat: currentLat, lng: currentLng };
      }

      if (this.routeLine) {
        this.routeLine.setPath([
          { lat: currentLat, lng: currentLng },
          { lat: destLat, lng: destLng },
        ]);
      }

      const updated: CourierInfo = {
        ...courier,
        currentLat,
        currentLng,
        progressPercent: progress,
        etaMinutes,
      };

      if (onUpdate) onUpdate(updated);

      if (progress >= 100 && this.animationTimer) {
        clearInterval(this.animationTimer);
      }
    }, 1500);
  }

  private renderFallbackMap(courier: CourierInfo, onUpdate?: (courier: CourierInfo) => void) {
    this.container.innerHTML = `
      <div style="width: 100%; height: 100%; background: #0f172a; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white;">
        <div style="position: absolute; inset: 0; opacity: 0.2; background-image: radial-gradient(#3b82f6 1px, transparent 1px); background-size: 24px 24px;"></div>
        
        <!-- Live Route Visualizer -->
        <div style="position: relative; z-index: 10; width: 85%; max-width: 480px; background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="material-symbols-outlined" style="color: #38bdf8;">electric_moped</span>
              <div>
                <div style="font-weight: 700; font-size: 15px;">${courier.name}</div>
                <div style="font-size: 12px; color: #94a3b8;">${courier.vehicle} · Priority Route</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 18px; font-weight: 800; color: #38bdf8; font-variant-numeric: tabular-nums;">
                <span id="fallback-eta">${courier.etaMinutes}</span> MIN
              </div>
              <div style="font-size: 11px; color: #64748b;">ESTIMATED ARRIVAL</div>
            </div>
          </div>

          <!-- Progress Bar -->
          <div style="width: 100%; height: 8px; background: #334155; border-radius: 9999px; overflow: hidden; margin-bottom: 16px;">
            <div id="fallback-progress" style="width: ${courier.progressPercent}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #06b6d4); transition: width 0.5s ease;"></div>
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #cbd5e1;">
            <span>Depot Hub #04</span>
            <span style="color: #10b981;">Destination Address</span>
          </div>
        </div>
      </div>
    `;

    let progress = courier.progressPercent;
    this.animationTimer = window.setInterval(() => {
      progress = Math.min(100, progress + 1);
      const eta = Math.max(1, Math.round(15 * (1 - progress / 100)));
      const pBar = document.getElementById('fallback-progress');
      const pEta = document.getElementById('fallback-eta');
      if (pBar) pBar.style.width = `${progress}%`;
      if (pEta) pEta.textContent = eta.toString();

      if (onUpdate) {
        onUpdate({
          ...courier,
          progressPercent: progress,
          etaMinutes: eta,
        });
      }

      if (progress >= 100 && this.animationTimer) {
        clearInterval(this.animationTimer);
      }
    }, 1500);
  }

  destroy() {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = null;
    }
  }
}
