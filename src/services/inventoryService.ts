import { Product, CartItem, Order, Review, NotificationToast } from '../types';
import { INITIAL_PRODUCTS, INITIAL_REVIEWS } from '../data/initialProducts';
import { encryptData, decryptData } from './cryptoService';

const STORAGE_KEYS = {
  PRODUCTS: 'aether_products_v1',
  CART: 'aether_cart_v1',
  WISHLIST: 'aether_wishlist_v1',
  ENCRYPTED_ORDERS: 'aether_enc_orders_v1',
  REVIEWS: 'aether_reviews_v1',
  HISTORY: 'aether_browsing_history_v1',
  LANGUAGE: 'aether_lang_v1',
  THEME: 'aether_theme_v1',
};

class InventoryService {
  private products: Product[] = [];
  private reviews: Record<string, Review[]> = {};
  private cart: CartItem[] = [];
  private wishlist: Set<string> = new Set();
  private browsingHistory: string[] = [];
  private orders: Order[] = [];
  private toasts: NotificationToast[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadState();
  }

  private loadState() {
    // Products
    const savedProducts = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    this.products = savedProducts ? JSON.parse(savedProducts) : [...INITIAL_PRODUCTS];

    // Reviews
    const savedReviews = localStorage.getItem(STORAGE_KEYS.REVIEWS);
    this.reviews = savedReviews ? JSON.parse(savedReviews) : { ...INITIAL_REVIEWS };

    // Cart
    const savedCart = localStorage.getItem(STORAGE_KEYS.CART);
    this.cart = savedCart ? JSON.parse(savedCart) : [];

    // Wishlist
    const savedWishlist = localStorage.getItem(STORAGE_KEYS.WISHLIST);
    this.wishlist = savedWishlist ? new Set(JSON.parse(savedWishlist)) : new Set();

    // Browsing History
    const savedHistory = localStorage.getItem(STORAGE_KEYS.HISTORY);
    this.browsingHistory = savedHistory ? JSON.parse(savedHistory) : [];

    // Load Encrypted Orders
    this.loadEncryptedOrders();
  }

  private async loadEncryptedOrders() {
    const encOrders = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_ORDERS);
    if (encOrders) {
      try {
        const decryptedJson = await decryptData(encOrders);
        if (decryptedJson) {
          this.orders = JSON.parse(decryptedJson);
        }
      } catch (e) {
        console.warn('Could not decrypt orders from local vault:', e);
      }
    }

    // If no orders exist yet, seed a live priority order for immediate tracking demo
    if (this.orders.length === 0) {
      this.orders = [
        {
          id: 'ORD-78294',
          items: [{ productId: 'prod-visor-spectrum', variantId: 'v-titanium', quantity: 1 }],
          totalAmount: 1499,
          shippingAddress: {
            fullName: 'Alexander Banton',
            street: '742 Spatial Horizon Way',
            city: 'San Francisco',
            state: 'CA',
            postalCode: '94107',
            country: 'United States',
          },
          paymentMethod: {
            type: 'card',
            lastFour: '4242',
            brand: 'Visa Tokenized',
            token: 'tok_pci_aes256_v1',
          },
          status: 'in_transit',
          createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
          estimatedDelivery: new Date(Date.now() + 18 * 60 * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          courier: {
            name: 'Alex Rivera',
            vehicle: 'Aether Autonomous Electric Van #14',
            vehicleType: 'electric_van',
            phone: '+1 (555) 019-2831',
            rating: 4.95,
            currentLat: 37.7749,
            currentLng: -122.4194,
            destinationLat: 37.7892,
            destinationLng: -122.4014,
            progressPercent: 35,
            etaMinutes: 14,
            speedKmh: 42,
          },
          gmailSent: true,
        },
      ];
      this.saveEncryptedOrders();
    }
  }

  private async saveEncryptedOrders() {
    try {
      const encrypted = await encryptData(JSON.stringify(this.orders));
      localStorage.setItem(STORAGE_KEYS.ENCRYPTED_ORDERS, encrypted);
    } catch (e) {
      console.warn('Failed to encrypt orders:', e);
    }
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  // --- Products & Inventory ---
  public getProducts(): Product[] {
    return this.products;
  }

  public getProductById(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  public updateProductStock(id: string, newStock: number) {
    const product = this.getProductById(id);
    if (product) {
      const previousStock = product.stock;
      product.stock = Math.max(0, newStock);
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(this.products));

      if (previousStock === 0 && product.stock > 0) {
        this.addToast('Stock Replenished', `${product.name} is now back in stock!`, 'info');
      } else if (product.stock <= 5 && product.stock > 0) {
        this.addToast('Low Stock Alert', `Only ${product.stock} units left for ${product.name}`, 'warning');
      }
      this.notify();
    }
  }

  // --- Cart Management ---
  public getCart(): CartItem[] {
    return this.cart;
  }

  public addToCart(productId: string, variantId: string, quantity = 1) {
    const product = this.getProductById(productId);
    if (!product || product.stock <= 0) {
      this.addToast('Item Unavailable', 'This product is currently out of stock.', 'warning');
      return;
    }

    const existingIndex = this.cart.findIndex(
      (item) => item.productId === productId && item.variantId === variantId
    );

    if (existingIndex >= 0) {
      this.cart[existingIndex].quantity += quantity;
    } else {
      this.cart.push({ productId, variantId, quantity });
    }

    localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(this.cart));
    this.addToast('Added to Cart', `${product.name} added to your secure order.`, 'success');
    this.notify();
  }

  public updateCartQuantity(productId: string, variantId: string, quantity: number) {
    if (quantity <= 0) {
      this.removeFromCart(productId, variantId);
      return;
    }
    const item = this.cart.find((i) => i.productId === productId && i.variantId === variantId);
    if (item) {
      item.quantity = quantity;
      localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(this.cart));
      this.notify();
    }
  }

  public removeFromCart(productId: string, variantId: string) {
    this.cart = this.cart.filter(
      (item) => !(item.productId === productId && item.variantId === variantId)
    );
    localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(this.cart));
    this.notify();
  }

  public clearCart() {
    this.cart = [];
    localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(this.cart));
    this.notify();
  }

  // --- Wishlist Management ---
  public getWishlist(): Set<string> {
    return this.wishlist;
  }

  public toggleWishlist(productId: string): boolean {
    const product = this.getProductById(productId);
    let isAdded = false;
    if (this.wishlist.has(productId)) {
      this.wishlist.delete(productId);
      this.addToast('Removed from Wishlist', `${product?.name || 'Item'} removed.`, 'info');
    } else {
      this.wishlist.add(productId);
      isAdded = true;
      this.addToast('Saved to Wishlist', `${product?.name || 'Item'} saved to your vault.`, 'success');
    }
    localStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify(Array.from(this.wishlist)));
    this.notify();
    return isAdded;
  }

  // --- Browsing History & Personalized Recommendations ---
  public recordProductView(productId: string) {
    this.browsingHistory = [productId, ...this.browsingHistory.filter((id) => id !== productId)].slice(0, 10);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(this.browsingHistory));
  }

  public getPersonalizedRecommendations(): Product[] {
    if (this.browsingHistory.length === 0) {
      return this.products.filter((p) => p.isFeatured).slice(0, 4);
    }

    // Determine category frequencies
    const categoryScores: Record<string, number> = {};
    this.browsingHistory.forEach((id, index) => {
      const product = this.getProductById(id);
      if (product) {
        const weight = 10 - index;
        categoryScores[product.category] = (categoryScores[product.category] || 0) + weight;
      }
    });

    // Score all other products
    const scoredProducts = this.products.map((p) => {
      let score = categoryScores[p.category] || 0;
      if (this.wishlist.has(p.id)) score += 5;
      if (p.rating >= 4.8) score += 3;
      return { product: p, score };
    });

    scoredProducts.sort((a, b) => b.score - a.score);
    return scoredProducts.map((sp) => sp.product).slice(0, 4);
  }

  // --- Orders & PCI Transactions ---
  public async createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'status' | 'courier'>): Promise<Order> {
    const orderId = `${Math.floor(100000 + Math.random() * 900000)}`;

    // Decrement stock for purchased items
    orderData.items.forEach((item) => {
      const p = this.getProductById(item.productId);
      if (p) {
        p.stock = Math.max(0, p.stock - item.quantity);
      }
    });
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(this.products));

    // Simulated Courier near customer address
    const baseLat = 37.7749; // San Francisco / Global Depot coordinate
    const baseLng = -122.4194;
    const destLat = baseLat + (Math.random() - 0.5) * 0.04;
    const destLng = baseLng + (Math.random() - 0.5) * 0.04;

    const newOrder: Order = {
      ...orderData,
      id: orderId,
      status: 'dispatched',
      createdAt: new Date().toISOString(),
      estimatedDelivery: new Date(Date.now() + 35 * 60 * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      courier: {
        name: 'Alex Rivera',
        vehicle: 'Aether Autonomous Electric Van #14',
        vehicleType: 'electric_van',
        phone: '+1 (555) 019-2831',
        rating: 4.95,
        currentLat: baseLat,
        currentLng: baseLng,
        destinationLat: destLat,
        destinationLng: destLng,
        progressPercent: 20,
        etaMinutes: 14,
        speedKmh: 42,
      },
    };

    this.orders.unshift(newOrder);
    await this.saveEncryptedOrders();
    this.clearCart();
    this.addToast('Order Confirmed!', `Order #${newOrder.id} dispatched with encrypted courier.`, 'success');
    this.notify();
    return newOrder;
  }

  public getOrders(): Order[] {
    return this.orders;
  }

  public getOrderById(id: string): Order | undefined {
    return this.orders.find((o) => o.id === id);
  }

  // --- Reviews ---
  public getReviewsForProduct(productId: string): Review[] {
    return this.reviews[productId] || [];
  }

  public addReview(productId: string, author: string, rating: number, comment: string) {
    const product = this.getProductById(productId);
    const newReview: Review = {
      id: `rev-${Date.now()}`,
      productId,
      author: author || 'Verified Purchaser',
      rating,
      date: 'Just now',
      comment,
      verifiedPurchase: true,
      likes: 0,
      location: 'Verified Global Customer',
    };

    if (!this.reviews[productId]) {
      this.reviews[productId] = [];
    }
    this.reviews[productId].unshift(newReview);
    localStorage.setItem(STORAGE_KEYS.REVIEWS, JSON.stringify(this.reviews));

    // Update product rating
    if (product) {
      const allReviews = this.reviews[productId];
      const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
      product.rating = Number(avg.toFixed(1));
      product.reviewCount = allReviews.length;
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(this.products));
    }

    this.addToast('Review Submitted', 'Thank you for your verified customer review!', 'success');
    this.notify();
  }

  // --- Push Notification Toasts ---
  public addToast(title: string, message: string, type: NotificationToast['type'] = 'info') {
    const toast: NotificationToast = {
      id: `toast-${Date.now()}-${Math.random()}`,
      title,
      message,
      type,
      timestamp: new Date().toLocaleTimeString(),
    };
    this.toasts.unshift(toast);
    this.notify();

    // Auto dismiss after 5 seconds
    setTimeout(() => {
      this.removeToast(toast.id);
    }, 5000);
  }

  public getToasts(): NotificationToast[] {
    return this.toasts;
  }

  public removeToast(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }
}

export const inventoryService = new InventoryService();
