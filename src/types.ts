export type ProductCategory = 'all' | 'visors' | 'wearables' | 'neural' | 'drones' | 'chronometers';

export interface ProductVariant {
  id: string;
  name: string;
  colorHex: string;
  finish: 'titanium' | 'obsidian' | 'chrome' | 'emerald';
  priceDelta?: number;
}

export interface ProductSpec {
  batteryLife: string;
  weight: string;
  connectivity: string;
  sensors: string;
  chassis: string;
}

export interface Product {
  id: string;
  name: string;
  tagline: string;
  category: 'visors' | 'wearables' | 'neural' | 'drones' | 'chronometers';
  price: number;
  originalPrice?: number;
  rating: number;
  reviewCount: number;
  stock: number;
  description: string;
  specs: ProductSpec;
  image: string;
  modelType: 'visor' | 'ring' | 'neural' | 'drone' | 'watch';
  variants: ProductVariant[];
  features: string[];
  isFeatured?: boolean;
}

export interface CartItem {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface Review {
  id: string;
  productId: string;
  author: string;
  rating: number;
  date: string;
  comment: string;
  verifiedPurchase: boolean;
  likes: number;
  location: string;
}

export type OrderStatus = 'processing' | 'dispatched' | 'in_transit' | 'delivered';

export interface CourierInfo {
  name: string;
  vehicle: string;
  vehicleType: 'electric_van' | 'autonomous_drone';
  phone: string;
  rating: number;
  currentLat: number;
  currentLng: number;
  destinationLat: number;
  destinationLng: number;
  progressPercent: number;
  etaMinutes: number;
  speedKmh: number;
}

export interface Order {
  id: string;
  items: CartItem[];
  totalAmount: number;
  shippingAddress: {
    fullName: string;
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  paymentMethod: {
    type: 'card' | 'gpay' | 'applepay' | 'crypto';
    lastFour?: string;
    brand?: string;
    token: string;
  };
  status: OrderStatus;
  createdAt: string;
  estimatedDelivery: string;
  courier: CourierInfo;
  gmailSent: boolean;
  driveInvoiceId?: string;
}

export type SupportedLanguage = 'en' | 'es' | 'ja' | 'de' | 'fr';
export type AppTheme = 'dark' | 'light';

export interface NotificationToast {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'security';
  timestamp: string;
}
