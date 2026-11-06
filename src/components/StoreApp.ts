import { Product, CartItem, Order, SupportedLanguage, AppTheme } from '../types';
import { TRANSLATIONS } from '../i18n/translations';
import { inventoryService } from '../services/inventoryService';
import {
  signInWithGoogle,
  signInWithSocialMock,
  logOut,
  getCurrentUser,
  initAuthListener,
  generate2FACode,
  verify2FACode,
  getActive2FAPending,
} from '../services/authService';
import { sendOrderConfirmationEmail, send2FACodeEmail } from '../services/gmailService';
import { archiveInvoiceToDrive, downloadInvoiceLocal } from '../services/driveService';
import { tokenizePaymentCard } from '../services/cryptoService';
import { ThreeModelViewer, ModelFinish } from './ThreeModelViewer';
import { OrderTrackingMap } from '../services/mapsService';
import * as xb from 'xrblocks';
import { WebXRShowroom } from './WebXRShowroom';

export class StoreApp {
  private root: HTMLElement;
  private currentLanguage: SupportedLanguage = 'en';
  private currentTheme: AppTheme = 'dark';
  private selectedCategory: string = 'all';
  private searchQuery: string = '';
  private sortBy: 'featured' | 'priceLow' | 'priceHigh' | 'rating' = 'featured';
  private inStockOnly: boolean = false;

  // Active Modals & Views
  private currentView: 'store' | 'tracking' | 'inventoryAdmin' = 'store';
  private active3DProduct: Product | null = null;
  private threeViewer: ThreeModelViewer | null = null;
  private activeTrackingOrder: Order | null = null;
  private trackingMapInstance: OrderTrackingMap | null = null;
  private isCartOpen: boolean = false;
  private isWishlistOpen: boolean = false;
  private isCheckoutOpen: boolean = false;
  private checkoutStep: 1 | 2 | 3 | 4 = 1;
  private activeReviewProductId: string | null = null;

  // Checkout Form State
  private checkoutForm = {
    fullName: 'Alexander Banton',
    street: '742 Spatial Horizon Way',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94107',
    country: 'United States',
    email: 'zanderthegreat31@gmail.com',
    paymentType: 'card' as 'card' | 'gpay' | 'applepay' | 'crypto',
    cardNumber: '4242 •••• •••• 4242',
    cardExp: '08/28',
    cardCvv: '921',
    entered2FACode: '',
  };
  private lastCreatedOrder: Order | null = null;

  constructor(root: HTMLElement) {
    this.root = root;

    // Load theme & language from storage
    const savedTheme = (localStorage.getItem('aether_theme_v1') as AppTheme) || 'dark';
    const savedLang = (localStorage.getItem('aether_lang_v1') as SupportedLanguage) || 'en';
    this.setTheme(savedTheme, false);
    this.currentLanguage = savedLang;

    // Subscribe to inventory & auth
    inventoryService.subscribe(() => this.render());
    initAuthListener(() => this.render());

    this.render();
  }

  private t(key: string): string {
    const dict = TRANSLATIONS[this.currentLanguage] || TRANSLATIONS.en;
    return dict[key] || TRANSLATIONS.en[key] || key;
  }

  public setTheme(theme: AppTheme, reRender = true) {
    this.currentTheme = theme;
    localStorage.setItem('aether_theme_v1', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    if (reRender) this.render();
  }

  public setLanguage(lang: SupportedLanguage) {
    this.currentLanguage = lang;
    localStorage.setItem('aether_lang_v1', lang);
    this.render();
  }

  // --- Filtering & Recommendations ---
  private getFilteredProducts(): Product[] {
    let list = inventoryService.getProducts();

    if (this.selectedCategory !== 'all') {
      list = list.filter((p) => p.category === this.selectedCategory);
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.tagline.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      );
    }

    if (this.inStockOnly) {
      list = list.filter((p) => p.stock > 0);
    }

    // Sort
    return [...list].sort((a, b) => {
      if (this.sortBy === 'priceLow') return a.price - b.price;
      if (this.sortBy === 'priceHigh') return b.price - a.price;
      if (this.sortBy === 'rating') return b.rating - a.rating;
      return (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0);
    });
  }

  // --- Render Orchestrator ---
  public render() {
    this.root.innerHTML = '';
    const container = document.createElement('div');
    container.className =
      'min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 transition-colors duration-200 selection:bg-blue-500 selection:text-white flex flex-col';

    // 1. Top Bar Contract
    container.appendChild(this.renderHeader());

    // 2. Main View
    const mainContent = document.createElement('main');
    mainContent.className = 'flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6';

    if (this.currentView === 'tracking') {
      mainContent.appendChild(this.renderTrackingView());
    } else if (this.currentView === 'inventoryAdmin') {
      mainContent.appendChild(this.renderInventoryAdminView());
    } else {
      mainContent.appendChild(this.renderStoreView());
    }
    container.appendChild(mainContent);

    // 3. Footer
    container.appendChild(this.renderFooter());

    // 4. Overlays & Modals
    if (this.active3DProduct) {
      container.appendChild(this.render3DModal());
    }
    if (this.isCartOpen) {
      container.appendChild(this.renderCartDrawer());
    }
    if (this.isWishlistOpen) {
      container.appendChild(this.renderWishlistDrawer());
    }
    if (this.isCheckoutOpen) {
      container.appendChild(this.renderCheckoutModal());
    }
    if (this.activeReviewProductId) {
      container.appendChild(this.renderReviewModal());
    }

    // 5. Toast Notifications
    container.appendChild(this.renderToasts());

    this.root.appendChild(container);
  }

  // --- Top Navigation Bar ---
  private renderHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className =
      'sticky top-0 z-40 bg-white/90 dark:bg-[#0b1329]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors';

    const cartCount = inventoryService.getCart().reduce((sum, item) => sum + item.quantity, 0);
    const wishlistCount = inventoryService.getWishlist().size;
    const user = getCurrentUser();

    header.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between gap-4 md:gap-8 h-16">
          
          <!-- Zone 1: Brand Wordmark -->
          <button id="nav-brand-btn" class="flex items-center gap-2 text-left focus:outline-none">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center text-white shadow-sm font-black text-sm">
              Æ
            </div>
            <span class="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              ${this.t('brand')}
            </span>
          </button>

          <!-- Zone 2: Single-Line Nav Links -->
          <nav class="hidden md:flex items-center gap-6 text-sm font-medium">
            <button id="nav-catalog-btn" class="hover:text-blue-600 dark:hover:text-cyan-400 transition-colors whitespace-nowrap ${
              this.currentView === 'store' ? 'text-blue-600 dark:text-cyan-400 font-semibold' : 'text-slate-600 dark:text-slate-300'
            }">
              ${this.t('catalog')}
            </button>
            <button id="nav-3d-btn" class="hover:text-blue-600 dark:hover:text-cyan-400 transition-colors whitespace-nowrap text-slate-600 dark:text-slate-300">
              ${this.t('lab3d')}
            </button>
            <button id="nav-tracking-btn" class="hover:text-blue-600 dark:hover:text-cyan-400 transition-colors whitespace-nowrap ${
              this.currentView === 'tracking' ? 'text-blue-600 dark:text-cyan-400 font-semibold' : 'text-slate-600 dark:text-slate-300'
            }">
              ${this.t('tracking')}
            </button>
            <button id="nav-admin-btn" class="hover:text-blue-600 dark:hover:text-cyan-400 transition-colors whitespace-nowrap ${
              this.currentView === 'inventoryAdmin' ? 'text-blue-600 dark:text-cyan-400 font-semibold' : 'text-slate-600 dark:text-slate-300'
            }">
              ${this.t('inventoryAdmin')}
            </button>
          </nav>

          <!-- Zone 3: Actions (Wishlist, Cart, Lang, Theme, Auth) -->
          <div class="flex items-center gap-2 sm:gap-3 shrink-0">
            
            <!-- Language Selector -->
            <select id="lang-select" class="bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 rounded-lg px-2 py-1.5 border border-slate-200 dark:border-slate-700 cursor-pointer focus:outline-none">
              <option value="en" ${this.currentLanguage === 'en' ? 'selected' : ''}>EN</option>
              <option value="es" ${this.currentLanguage === 'es' ? 'selected' : ''}>ES</option>
              <option value="ja" ${this.currentLanguage === 'ja' ? 'selected' : ''}>JA</option>
              <option value="de" ${this.currentLanguage === 'de' ? 'selected' : ''}>DE</option>
              <option value="fr" ${this.currentLanguage === 'fr' ? 'selected' : ''}>FR</option>
            </select>

            <!-- Theme Toggle -->
            <button id="theme-toggle-btn" class="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Toggle Theme">
              <span class="material-symbols-outlined text-[20px]">${this.currentTheme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
            </button>

            <!-- Wishlist Button -->
            <button id="wishlist-btn" class="relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="${this.t(
              'wishlist'
            )}">
              <span class="material-symbols-outlined text-[20px]">favorite</span>
              ${
                wishlistCount > 0
                  ? `<span class="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">${wishlistCount}</span>`
                  : ''
              }
            </button>

            <!-- Cart Button -->
            <button id="cart-btn" class="relative flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all whitespace-nowrap">
              <span class="material-symbols-outlined text-[18px]">shopping_bag</span>
              <span class="hidden sm:inline">${this.t('cart')}</span>
              <span class="bg-blue-800/80 px-1.5 py-0.5 rounded text-[11px] font-mono">${cartCount}</span>
            </button>

            <!-- Account / Google Auth -->
            ${
              user
                ? `<div class="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-800">
                     <span class="text-xs font-medium text-slate-700 dark:text-slate-300 hidden lg:inline">${
                       user.displayName?.split(' ')[0] || 'User'
                     }</span>
                     <button id="logout-btn" class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1" title="Sign out">
                       <span class="material-symbols-outlined text-[18px]">logout</span>
                     </button>
                   </div>`
                : `<button id="login-google-btn" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap" title="Sign in with Google">
                     <span class="material-symbols-outlined text-[18px] text-blue-500">account_circle</span>
                     <span class="hidden sm:inline">Sign In</span>
                   </button>`
            }
          </div>
        </div>
      </div>
    `;

    // Handlers
    header.querySelector('#nav-brand-btn')?.addEventListener('click', () => {
      this.currentView = 'store';
      this.render();
    });
    header.querySelector('#nav-catalog-btn')?.addEventListener('click', () => {
      this.currentView = 'store';
      this.render();
    });
    header.querySelector('#nav-3d-btn')?.addEventListener('click', () => {
      const featured = inventoryService.getProducts()[0];
      if (featured) this.open3DViewer(featured);
    });
    header.querySelector('#nav-tracking-btn')?.addEventListener('click', () => {
      this.currentView = 'tracking';
      this.render();
    });
    header.querySelector('#nav-admin-btn')?.addEventListener('click', () => {
      this.currentView = 'inventoryAdmin';
      this.render();
    });
    header.querySelector('#lang-select')?.addEventListener('change', (e) => {
      this.setLanguage((e.target as HTMLSelectElement).value as SupportedLanguage);
    });
    header.querySelector('#theme-toggle-btn')?.addEventListener('click', () => {
      this.setTheme(this.currentTheme === 'dark' ? 'light' : 'dark');
    });
    header.querySelector('#wishlist-btn')?.addEventListener('click', () => {
      this.isWishlistOpen = true;
      this.render();
    });
    header.querySelector('#cart-btn')?.addEventListener('click', () => {
      this.isCartOpen = true;
      this.render();
    });
    header.querySelector('#logout-btn')?.addEventListener('click', async () => {
      await logOut();
      inventoryService.addToast('Signed Out', 'You have been safely signed out.', 'info');
      this.render();
    });
    header.querySelector('#login-google-btn')?.addEventListener('click', async () => {
      try {
        const res = await signInWithGoogle();
        inventoryService.addToast('Signed In', `Welcome back, ${res.user.displayName || 'Shopper'}!`, 'success');
        this.render();
      } catch (err: any) {
        inventoryService.addToast('Auth Note', err.message || 'Login was canceled or closed.', 'warning');
      }
    });

    return header;
  }

  // --- Storefront View ---
  private renderStoreView(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col gap-10';

    // 1. Hero Showcase Banner (Using 16:9 generated spatial visor)
    const hero = document.createElement('section');
    hero.className =
      'relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 shadow-xl';
    hero.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 min-h-[460px] items-stretch">
        <div class="lg:col-span-6 p-8 sm:p-12 flex flex-col justify-center z-10 bg-gradient-to-t lg:bg-gradient-to-r from-slate-950 via-slate-950/90 to-transparent">
          <div class="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-cyan-400 uppercase mb-3">
            <span>Spatial Computing Architecture</span>
            <span aria-hidden="true">·</span>
            <span>2026 Series</span>
          </div>
          <h1 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            Next-Gen Spatial Electronics & Wearables
          </h1>
          <p class="text-sm sm:text-base text-slate-300 mb-8 max-w-xl leading-relaxed">
            Engineered with 8K micro-OLED optical waveguides, neural gesture telemetry, and Grade-5 titanium chassis. Inspect every component in interactive 3D or experience our WebXR showroom.
          </p>
          <div class="flex flex-wrap items-center gap-4">
            <button id="hero-inspect-btn" class="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px]">view_in_ar</span>
              ${this.t('inspect3D')}
            </button>
            <button id="hero-explore-btn" class="px-5 py-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-sm transition-all">
              Explore Hardware
            </button>
          </div>
        </div>
        <div class="lg:col-span-6 relative h-64 lg:h-auto overflow-hidden">
          <img 
            src="/src/assets/images/hero_spatial_visors_1793965523259.jpg" 
            alt="Aether Spectrum XR Visor Hero Display" 
            referrerpolicy="no-referrer"
            class="w-full h-full object-cover object-center transform hover:scale-105 transition-transform duration-700"
          />
        </div>
      </div>
    `;

    hero.querySelector('#hero-inspect-btn')?.addEventListener('click', () => {
      const visor = inventoryService.getProductById('prod-visor-spectrum');
      if (visor) this.open3DViewer(visor);
    });
    hero.querySelector('#hero-explore-btn')?.addEventListener('click', () => {
      const grid = document.getElementById('catalog-grid-anchor');
      grid?.scrollIntoView({ behavior: 'smooth' });
    });
    wrap.appendChild(hero);

    // 2. Filter & Search Toolbar
    const toolbar = document.createElement('div');
    toolbar.id = 'catalog-grid-anchor';
    toolbar.className =
      'flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm';

    toolbar.innerHTML = `
      <!-- Category Tabs (Interactive buttons) -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
        ${[
          { id: 'all', label: this.t('allCategories') },
          { id: 'visors', label: this.t('categoryVisors') },
          { id: 'wearables', label: this.t('categoryWearables') },
          { id: 'neural', label: this.t('categoryNeural') },
          { id: 'drones', label: this.t('categoryDrones') },
          { id: 'chronometers', label: this.t('categoryChronometers') },
        ]
          .map(
            (cat) => `
          <button data-cat="${cat.id}" class="px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
              this.selectedCategory === cat.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }">
            ${cat.label}
          </button>
        `
          )
          .join('')}
      </div>

      <!-- Search & Filters -->
      <div class="flex items-center gap-3">
        <div class="relative flex-1 md:w-64">
          <span class="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">search</span>
          <input 
            id="search-input" 
            type="text" 
            placeholder="${this.t('searchPlaceholder')}" 
            value="${this.searchQuery}"
            class="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <select id="sort-select" class="px-2.5 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none">
          <option value="featured" ${this.sortBy === 'featured' ? 'selected' : ''}>${this.t('sortFeatured')}</option>
          <option value="priceLow" ${this.sortBy === 'priceLow' ? 'selected' : ''}>${this.t('sortPriceLow')}</option>
          <option value="priceHigh" ${this.sortBy === 'priceHigh' ? 'selected' : ''}>${this.t('sortPriceHigh')}</option>
          <option value="rating" ${this.sortBy === 'rating' ? 'selected' : ''}>${this.t('sortRating')}</option>
        </select>
      </div>
    `;

    toolbar.querySelectorAll('button[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedCategory = (btn as HTMLElement).dataset.cat || 'all';
        this.render();
      });
    });

    const searchInput = toolbar.querySelector('#search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.updateProductsGridOnly();
    });

    const sortSelect = toolbar.querySelector('#sort-select') as HTMLSelectElement;
    sortSelect?.addEventListener('change', (e) => {
      this.sortBy = (e.target as HTMLSelectElement).value as any;
      this.render();
    });

    wrap.appendChild(toolbar);

    // 3. Product Grid
    const gridSection = document.createElement('section');
    gridSection.id = 'products-grid-container';
    gridSection.innerHTML = this.renderProductGridHtml();
    this.bindProductCardEvents(gridSection);
    wrap.appendChild(gridSection);

    // 4. Personalized Recommendations Section
    const recommendations = inventoryService.getPersonalizedRecommendations();
    if (recommendations.length > 0) {
      const recSection = document.createElement('section');
      recSection.className = 'pt-6 border-t border-slate-200 dark:border-slate-800';
      recSection.innerHTML = `
        <div class="mb-6">
          <div class="text-xs font-semibold text-blue-600 dark:text-cyan-400 uppercase tracking-wider mb-1">
            ${this.t('recommendationsSubtitle')}
          </div>
          <h2 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            ${this.t('recommendationsTitle')}
          </h2>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          ${recommendations.map((p) => this.renderProductCardHtml(p)).join('')}
        </div>
      `;
      this.bindProductCardEvents(recSection);
      wrap.appendChild(recSection);
    }

    return wrap;
  }

  private updateProductsGridOnly() {
    const container = document.getElementById('products-grid-container');
    if (container) {
      container.innerHTML = this.renderProductGridHtml();
      this.bindProductCardEvents(container);
    }
  }

  private renderProductGridHtml(): string {
    const products = this.getFilteredProducts();
    if (products.length === 0) {
      return `
        <div class="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span class="material-symbols-outlined text-4xl text-slate-400 mb-2">search_off</span>
          <p class="text-base font-semibold text-slate-700 dark:text-slate-300">No spatial electronics match your filter</p>
          <p class="text-xs text-slate-500 mt-1">Try clearing your search term or switching categories.</p>
        </div>
      `;
    }
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        ${products.map((p) => this.renderProductCardHtml(p)).join('')}
      </div>
    `;
  }

  private renderProductCardHtml(p: Product): string {
    const isWishlisted = inventoryService.getWishlist().has(p.id);
    return `
      <div class="group relative flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1" data-product-id="${
        p.id
      }">
        <!-- Image Container (65-75% visual dominance) -->
        <div class="relative w-full aspect-[4/3] bg-slate-100 dark:bg-slate-950 overflow-hidden">
          <img 
            src="${p.image}" 
            alt="${p.name}" 
            referrerpolicy="no-referrer"
            class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />
          <!-- Wishlist Heart Button -->
          <button data-wishlist-id="${p.id}" class="absolute top-3 right-3 p-2 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur text-slate-600 dark:text-slate-300 hover:text-rose-500 transition-colors shadow-sm">
            <span class="material-symbols-outlined text-[18px] ${isWishlisted ? 'fill text-rose-500' : ''}">favorite</span>
          </button>
          <!-- 3D Inspect Badge Button -->
          <button data-inspect-id="${
            p.id
          }" class="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-slate-950/80 hover:bg-blue-600 text-white text-xs font-semibold backdrop-blur flex items-center gap-1.5 transition-all">
            <span class="material-symbols-outlined text-[16px]">view_in_ar</span>
            <span>3D Lab</span>
          </button>
        </div>

        <!-- Product Metadata Content -->
        <div class="p-5 flex flex-col flex-1 justify-between gap-3">
          <div>
            <!-- Clean unboxed metadata -->
            <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              <span class="uppercase tracking-wider font-semibold text-[11px] text-blue-600 dark:text-cyan-400">${
                p.category
              }</span>
              <span aria-hidden="true">·</span>
              <span class="flex items-center gap-0.5 text-amber-500 font-medium">
                ★ ${p.rating}
              </span>
              <span aria-hidden="true">·</span>
              <span>${p.reviewCount} reviews</span>
            </div>

            <h3 class="text-base font-bold text-slate-900 dark:text-white leading-snug line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors cursor-pointer" data-detail-id="${
              p.id
            }">
              ${p.name}
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
              ${p.tagline}
            </p>
          </div>

          <!-- Price & Actions Strip -->
          <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div class="flex flex-col">
              <div class="flex items-baseline gap-2">
                <span class="text-lg font-bold font-mono text-slate-900 dark:text-white tabular-nums">$${p.price.toLocaleString()}</span>
                ${
                  p.originalPrice
                    ? `<span class="text-xs text-slate-400 line-through font-mono tabular-nums">$${p.originalPrice.toLocaleString()}</span>`
                    : ''
                }
              </div>
              <span class="text-[11px] ${
                p.stock > 5 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'
              } font-medium">
                ${p.stock > 0 ? `${p.stock} in stock` : this.t('outOfStock')}
              </span>
            </div>

            <button data-add-cart-id="${
              p.id
            }" class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-blue-600 dark:bg-slate-800 dark:hover:bg-blue-600 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm">
              <span class="material-symbols-outlined text-[16px]">add_shopping_cart</span>
              <span>${this.t('addToCart')}</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private bindProductCardEvents(container: HTMLElement) {
    container.querySelectorAll('button[data-wishlist-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.wishlistId;
        if (id) {
          inventoryService.toggleWishlist(id);
        }
      });
    });

    container.querySelectorAll('button[data-inspect-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.inspectId;
        const p = inventoryService.getProductById(id || '');
        if (p) this.open3DViewer(p);
      });
    });

    container.querySelectorAll('button[data-add-cart-id]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.addCartId;
        const p = inventoryService.getProductById(id || '');
        if (p) {
          inventoryService.addToCart(p.id, p.variants[0]?.id || 'default', 1);
        }
      });
    });

    container.querySelectorAll('[data-detail-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.detailId;
        const p = inventoryService.getProductById(id || '');
        if (p) this.open3DViewer(p);
      });
    });
  }

  // --- 3D Inspection Modal with Collapsible Control Dock ---
  private open3DViewer(product: Product) {
    this.active3DProduct = product;
    inventoryService.recordProductView(product.id);
    this.render();

    // Initialize Three.js viewport
    requestAnimationFrame(() => {
      const canvasContainer = document.getElementById('three-viewport-canvas-container');
      if (canvasContainer) {
        if (this.threeViewer) {
          this.threeViewer.destroy();
        }
        this.threeViewer = new ThreeModelViewer(canvasContainer);
        this.threeViewer.loadModel(product.modelType, product.variants[0]?.finish || 'titanium');
      }
    });
  }

  private close3DViewer() {
    if (this.threeViewer) {
      this.threeViewer.destroy();
      this.threeViewer = null;
    }
    this.active3DProduct = null;
    this.render();
  }

  private render3DModal(): HTMLElement {
    const p = this.active3DProduct!;
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md';

    modal.innerHTML = `
      <div class="relative w-full max-w-5xl h-[92vh] max-h-[820px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col md:flex-row overflow-hidden">
        
        <!-- Close Button -->
        <button id="modal-close-3d-btn" class="absolute top-4 right-4 z-30 p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <!-- Left Column: Interactive 3D Viewport with Collapsible Dock -->
        <div class="relative flex-1 h-[55%] md:h-full bg-slate-950 flex flex-col overflow-hidden">
          
          <!-- WebGL Canvas Mount -->
          <div id="three-viewport-canvas-container" class="w-full h-full cursor-grab active:cursor-grabbing"></div>

          <!-- Spec Pill Badge Top-Left -->
          <div class="absolute top-4 left-4 z-20 pointer-events-none">
            <span class="px-3 py-1 rounded-full bg-slate-900/80 border border-slate-700 text-cyan-400 text-xs font-mono font-medium backdrop-blur">
              PBR STUDIO · ${p.modelType.toUpperCase()}
            </span>
          </div>

          <!-- Collapsible Bottom Control Dock (Follows threejs skill directives) -->
          <div class="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-md bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3 backdrop-blur shadow-2xl flex flex-col gap-2.5 transition-transform duration-300">
            <div class="flex items-center justify-between text-[11px] text-slate-300">
              <span class="font-semibold uppercase tracking-wider text-slate-400">Exploded Assembly</span>
              <span id="dock-explode-val" class="font-mono text-cyan-400">0%</span>
            </div>
            
            <!-- Explode Slider -->
            <input 
              id="dock-explode-slider" 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value="0" 
              class="w-full accent-cyan-400 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
            />

            <!-- Control Actions & Swatches -->
            <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-800">
              <!-- Finish Swatches -->
              <div class="flex items-center gap-1.5">
                <button data-finish="titanium" class="w-6 h-6 rounded-full bg-[#94a3b8] border-2 border-white/50 hover:scale-110 transition-transform" title="Titanium"></button>
                <button data-finish="obsidian" class="w-6 h-6 rounded-full bg-[#18181b] border-2 border-white/20 hover:scale-110 transition-transform" title="Obsidian"></button>
                <button data-finish="chrome" class="w-6 h-6 rounded-full bg-[#e2e8f0] border-2 border-white/20 hover:scale-110 transition-transform" title="Chrome"></button>
                <button data-finish="emerald" class="w-6 h-6 rounded-full bg-[#059669] border-2 border-white/20 hover:scale-110 transition-transform" title="Emerald"></button>
              </div>

              <!-- Spin / Reset / WebXR Showroom -->
              <div class="flex items-center gap-1.5">
                <button id="dock-spin-btn" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs" title="Toggle Auto-Rotate">
                  <span class="material-symbols-outlined text-[16px]">rotate_right</span>
                </button>
                <button id="dock-reset-btn" class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs" title="Reset View">
                  <span class="material-symbols-outlined text-[16px]">restart_alt</span>
                </button>
                <button id="dock-webxr-btn" class="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 shadow-sm" title="Launch WebXR Pedestal">
                  <span class="material-symbols-outlined text-[16px]">view_in_ar</span>
                  <span>WebXR</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: Product Detail & Purchase Specs -->
        <div class="w-full md:w-[400px] h-[45%] md:h-full p-6 flex flex-col justify-between overflow-y-auto bg-white dark:bg-slate-900 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800">
          <div class="flex flex-col gap-4">
            <div>
              <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span class="uppercase tracking-wider font-semibold text-blue-600 dark:text-cyan-400">${p.category}</span>
                <span>·</span>
                <span>${p.stock} units in depot</span>
              </div>
              <h2 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">${p.name}</h2>
              <div class="text-2xl font-extrabold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
                $${p.price.toLocaleString()} <span class="text-xs font-sans text-slate-400 font-normal">USD</span>
              </div>
            </div>

            <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${p.description}</p>

            <!-- Technical Spec Sheet -->
            <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs flex flex-col gap-2">
              <div class="font-semibold text-slate-900 dark:text-white text-[11px] uppercase tracking-wider mb-0.5">Hardware Specifications</div>
              <div class="flex justify-between text-slate-600 dark:text-slate-300"><span class="text-slate-400">Battery:</span> <span>${
                p.specs.batteryLife
              }</span></div>
              <div class="flex justify-between text-slate-600 dark:text-slate-300"><span class="text-slate-400">Weight:</span> <span>${
                p.specs.weight
              }</span></div>
              <div class="flex justify-between text-slate-600 dark:text-slate-300"><span class="text-slate-400">Sensors:</span> <span class="text-right max-w-[190px] line-clamp-1">${
                p.specs.sensors
              }</span></div>
              <div class="flex justify-between text-slate-600 dark:text-slate-300"><span class="text-slate-400">Chassis:</span> <span class="text-right max-w-[190px] line-clamp-1">${
                p.specs.chassis
              }</span></div>
            </div>

            <!-- Customer Reviews Preview -->
            <div class="pt-2">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-semibold text-slate-900 dark:text-white">Customer Reviews (${p.reviewCount})</span>
                <button id="modal-write-review-btn" class="text-xs text-blue-600 dark:text-cyan-400 hover:underline font-medium">Write Review</button>
              </div>
              <div class="space-y-2">
                ${inventoryService
                  .getReviewsForProduct(p.id)
                  .slice(0, 2)
                  .map(
                    (r) => `
                  <div class="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs">
                    <div class="flex justify-between items-center text-slate-500 mb-1">
                      <span class="font-semibold text-slate-800 dark:text-slate-200">${r.author}</span>
                      <span class="text-amber-500">★ ${r.rating}</span>
                    </div>
                    <p class="text-slate-600 dark:text-slate-300 line-clamp-2">${r.comment}</p>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          </div>

          <!-- Bottom Purchase Strip -->
          <div class="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <button id="modal-add-cart-btn" class="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-md transition-colors flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-[18px]">shopping_bag</span>
              <span>${this.t('addToCart')}</span>
            </button>
            <button id="modal-buy-now-btn" class="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-sm transition-colors">
              Buy Now
            </button>
          </div>
        </div>
      </div>
    `;

    // Handlers
    modal.querySelector('#modal-close-3d-btn')?.addEventListener('click', () => this.close3DViewer());

    const slider = modal.querySelector('#dock-explode-slider') as HTMLInputElement;
    const explodeVal = modal.querySelector('#dock-explode-val');
    slider?.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      if (this.threeViewer) this.threeViewer.setExplodedView(val);
      if (explodeVal) explodeVal.textContent = `${Math.round(val * 100)}%`;
    });

    modal.querySelectorAll('button[data-finish]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const finish = (btn as HTMLElement).dataset.finish as ModelFinish;
        if (this.threeViewer) this.threeViewer.setFinish(finish);
      });
    });

    modal.querySelector('#dock-spin-btn')?.addEventListener('click', () => {
      if (this.threeViewer) this.threeViewer.toggleAutoRotate();
    });

    modal.querySelector('#dock-reset-btn')?.addEventListener('click', () => {
      if (this.threeViewer) this.threeViewer.resetView();
      if (slider) slider.value = '0';
      if (explodeVal) explodeVal.textContent = '0%';
    });

    // Enter WebXR Showroom
    modal.querySelector('#dock-webxr-btn')?.addEventListener('click', async () => {
      this.close3DViewer();
      inventoryService.addToast('Entering WebXR', 'Initializing WebXR Spatial Showroom...', 'info');
      try {
        xb.add(new WebXRShowroom(p));
        const options = new xb.Options();
        options.setAppTitle('Aether Spatial Showroom');
        options.simulator.defaultMode = xb.SimulatorMode.CONTROLLER;
        await xb.init(options);
      } catch (err: any) {
        console.warn('WebXR startup:', err);
      }
    });

    modal.querySelector('#modal-add-cart-btn')?.addEventListener('click', () => {
      inventoryService.addToCart(p.id, p.variants[0]?.id || 'default', 1);
    });

    modal.querySelector('#modal-buy-now-btn')?.addEventListener('click', () => {
      inventoryService.addToCart(p.id, p.variants[0]?.id || 'default', 1);
      this.close3DViewer();
      this.isCheckoutOpen = true;
      this.checkoutStep = 1;
      this.render();
    });

    modal.querySelector('#modal-write-review-btn')?.addEventListener('click', () => {
      this.activeReviewProductId = p.id;
      this.render();
    });

    return modal;
  }

  // --- Cart Drawer ---
  private renderCartDrawer(): HTMLElement {
    const drawer = document.createElement('div');
    drawer.className = 'fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm';

    const cartItems = inventoryService.getCart();
    const subtotal = cartItems.reduce((sum, item) => {
      const p = inventoryService.getProductById(item.productId);
      return sum + (p ? p.price * item.quantity : 0);
    }, 0);

    drawer.innerHTML = `
      <div class="w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between p-6">
        <div>
          <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-blue-600 dark:text-cyan-400">shopping_bag</span>
              <h2 class="text-lg font-bold text-slate-900 dark:text-white">${this.t('cart')} (${cartItems.length})</h2>
            </div>
            <button id="close-cart-btn" class="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <div class="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            ${
              cartItems.length === 0
                ? `<div class="py-12 text-center text-slate-500 text-sm">Your order is currently empty.</div>`
                : cartItems
                    .map((item) => {
                      const p = inventoryService.getProductById(item.productId);
                      if (!p) return '';
                      return `
                  <div class="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                    <img src="${p.image}" alt="${p.name}" referrerpolicy="no-referrer" class="w-16 h-16 rounded-lg object-cover bg-slate-950" />
                    <div class="flex-1 min-w-0">
                      <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate">${p.name}</h4>
                      <div class="text-xs font-mono text-blue-600 dark:text-cyan-400 font-semibold tabular-nums mt-0.5">$${p.price.toLocaleString()}</div>
                      <div class="flex items-center gap-2 mt-2">
                        <button data-dec="${item.productId}" data-var="${item.variantId}" class="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold">-</button>
                        <span class="text-xs font-mono font-bold">${item.quantity}</span>
                        <button data-inc="${item.productId}" data-var="${item.variantId}" class="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold">+</button>
                      </div>
                    </div>
                    <button data-del="${item.productId}" data-var="${item.variantId}" class="p-1.5 text-slate-400 hover:text-rose-500">
                      <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                `;
                    })
                    .join('')
            }
          </div>
        </div>

        <div class="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div class="flex justify-between text-sm">
            <span class="text-slate-500">Subtotal:</span>
            <span class="font-bold font-mono text-slate-900 dark:text-white tabular-nums">$${subtotal.toLocaleString()}</span>
          </div>
          <div class="flex justify-between text-xs text-emerald-600 dark:text-emerald-400">
            <span>Shipping:</span>
            <span>${this.t('shippingFree')}</span>
          </div>
          <button id="go-checkout-btn" ${cartItems.length === 0 ? 'disabled' : ''} class="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2">
            <span class="material-symbols-outlined text-[18px]">lock</span>
            <span>Proceed to PCI Checkout</span>
          </button>
        </div>
      </div>
    `;

    drawer.querySelector('#close-cart-btn')?.addEventListener('click', () => {
      this.isCartOpen = false;
      this.render();
    });

    drawer.querySelectorAll('button[data-inc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.inc!;
        const v = (btn as HTMLElement).dataset.var!;
        const item = cartItems.find((i) => i.productId === id && i.variantId === v);
        if (item) inventoryService.updateCartQuantity(id, v, item.quantity + 1);
      });
    });

    drawer.querySelectorAll('button[data-dec]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.dec!;
        const v = (btn as HTMLElement).dataset.var!;
        const item = cartItems.find((i) => i.productId === id && i.variantId === v);
        if (item) inventoryService.updateCartQuantity(id, v, item.quantity - 1);
      });
    });

    drawer.querySelectorAll('button[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.del!;
        const v = (btn as HTMLElement).dataset.var!;
        inventoryService.removeFromCart(id, v);
      });
    });

    drawer.querySelector('#go-checkout-btn')?.addEventListener('click', () => {
      this.isCartOpen = false;
      this.isCheckoutOpen = true;
      this.checkoutStep = 1;
      this.render();
    });

    return drawer;
  }

  // --- Wishlist Drawer ---
  private renderWishlistDrawer(): HTMLElement {
    const drawer = document.createElement('div');
    drawer.className = 'fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm';

    const wishlistIds = Array.from(inventoryService.getWishlist());
    const items = wishlistIds
      .map((id) => inventoryService.getProductById(id))
      .filter((p): p is Product => Boolean(p));

    drawer.innerHTML = `
      <div class="w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col justify-between p-6">
        <div>
          <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <div class="flex items-center gap-2">
              <span class="material-symbols-outlined text-rose-500 fill">favorite</span>
              <h2 class="text-lg font-bold text-slate-900 dark:text-white">${this.t('wishlist')} (${items.length})</h2>
            </div>
            <button id="close-wishlist-btn" class="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <div class="py-4 space-y-4 max-h-[75vh] overflow-y-auto">
            ${
              items.length === 0
                ? `<div class="py-12 text-center text-slate-500 text-sm">Your wishlist is currently empty.</div>`
                : items
                    .map(
                      (p) => `
                  <div class="flex items-center gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                    <img src="${p.image}" alt="${p.name}" referrerpolicy="no-referrer" class="w-16 h-16 rounded-lg object-cover bg-slate-950" />
                    <div class="flex-1 min-w-0">
                      <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate">${p.name}</h4>
                      <div class="text-xs font-mono text-blue-600 dark:text-cyan-400 font-semibold tabular-nums mt-0.5">$${p.price.toLocaleString()}</div>
                      <button data-move-cart="${p.id}" class="mt-2 text-xs font-semibold text-blue-600 dark:text-cyan-400 hover:underline">
                        Move to Cart
                      </button>
                    </div>
                    <button data-remove-wish="${p.id}" class="p-1.5 text-slate-400 hover:text-rose-500">
                      <span class="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                `
                    )
                    .join('')
            }
          </div>
        </div>
      </div>
    `;

    drawer.querySelector('#close-wishlist-btn')?.addEventListener('click', () => {
      this.isWishlistOpen = false;
      this.render();
    });

    drawer.querySelectorAll('button[data-move-cart]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.moveCart!;
        inventoryService.addToCart(id, 'default', 1);
        inventoryService.toggleWishlist(id);
      });
    });

    drawer.querySelectorAll('button[data-remove-wish]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.removeWish!;
        inventoryService.toggleWishlist(id);
      });
    });

    return drawer;
  }

  // --- PCI-Compliant Checkout & 2FA Modal ---
  private renderCheckoutModal(): HTMLElement {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md';

    const cart = inventoryService.getCart();
    const total = cart.reduce((sum, item) => {
      const p = inventoryService.getProductById(item.productId);
      return sum + (p ? p.price * item.quantity : 0);
    }, 0);

    modal.innerHTML = `
      <div class="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 flex flex-col justify-between max-h-[90vh] overflow-y-auto">
        
        <!-- Header & Step Navigation -->
        <div>
          <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span class="material-symbols-outlined text-blue-600 dark:text-cyan-400">verified_user</span>
                ${this.t('checkoutTitle')}
              </h2>
              <p class="text-xs text-slate-500 mt-0.5">${this.t('securityNotice')}</p>
            </div>
            <button id="close-checkout-btn" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <!-- Stepper Dots -->
          <div class="grid grid-cols-4 gap-2 my-5 text-[11px] font-semibold text-center">
            <div class="${this.checkoutStep >= 1 ? 'text-blue-600 dark:text-cyan-400' : 'text-slate-400'}">1. Address</div>
            <div class="${this.checkoutStep >= 2 ? 'text-blue-600 dark:text-cyan-400' : 'text-slate-400'}">2. Payment</div>
            <div class="${this.checkoutStep >= 3 ? 'text-blue-600 dark:text-cyan-400' : 'text-slate-400'}">3. 2FA Check</div>
            <div class="${this.checkoutStep >= 4 ? 'text-blue-600 dark:text-cyan-400' : 'text-slate-400'}">4. Dispatch</div>
          </div>

          <!-- Step 1: Destination -->
          ${
            this.checkoutStep === 1
              ? `
            <div class="space-y-4">
              <div class="text-xs font-semibold uppercase text-slate-400">Delivery Destination</div>
              <div class="grid grid-cols-2 gap-3">
                <div class="col-span-2">
                  <label class="text-xs text-slate-500 block mb-1">Full Recipient Name</label>
                  <input id="chk-name" type="text" value="${this.checkoutForm.fullName}" class="w-full text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                </div>
                <div class="col-span-2">
                  <label class="text-xs text-slate-500 block mb-1">Street Address</label>
                  <input id="chk-street" type="text" value="${this.checkoutForm.street}" class="w-full text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                </div>
                <div>
                  <label class="text-xs text-slate-500 block mb-1">City</label>
                  <input id="chk-city" type="text" value="${this.checkoutForm.city}" class="w-full text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                </div>
                <div>
                  <label class="text-xs text-slate-500 block mb-1">Postal Code</label>
                  <input id="chk-postal" type="text" value="${this.checkoutForm.postalCode}" class="w-full text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                </div>
                <div class="col-span-2">
                  <label class="text-xs text-slate-500 block mb-1">Email for 2FA & Receipt</label>
                  <input id="chk-email" type="email" value="${this.checkoutForm.email}" class="w-full text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                </div>
              </div>
            </div>
          `
              : ''
          }

          <!-- Step 2: Payment Gateway (PCI Tokenized Vault) -->
          ${
            this.checkoutStep === 2
              ? `
            <div class="space-y-4">
              <div class="text-xs font-semibold uppercase text-slate-400">Payment Gateway Vault (PCI-DSS)</div>
              
              <div class="grid grid-cols-3 gap-2">
                <button id="pay-opt-card" class="p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 ${
                  this.checkoutForm.paymentType === 'card'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400'
                    : 'border-slate-200 dark:border-slate-700'
                }">
                  <span class="material-symbols-outlined text-[20px]">credit_card</span>
                  <span>Card Token</span>
                </button>
                <button id="pay-opt-gpay" class="p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 ${
                  this.checkoutForm.paymentType === 'gpay'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400'
                    : 'border-slate-200 dark:border-slate-700'
                }">
                  <span class="material-symbols-outlined text-[20px]">account_balance_wallet</span>
                  <span>Google Pay</span>
                </button>
                <button id="pay-opt-apple" class="p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 ${
                  this.checkoutForm.paymentType === 'applepay'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 text-blue-600 dark:text-cyan-400'
                    : 'border-slate-200 dark:border-slate-700'
                }">
                  <span class="material-symbols-outlined text-[20px]">phone_iphone</span>
                  <span>Apple Pay</span>
                </button>
              </div>

              <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-3">
                <div>
                  <label class="text-xs text-slate-500 block mb-1">Encrypted Card Number</label>
                  <input id="chk-cardnum" type="text" value="${this.checkoutForm.cardNumber}" class="w-full text-xs font-mono p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="text-xs text-slate-500 block mb-1">Expiry</label>
                    <input id="chk-exp" type="text" value="${this.checkoutForm.cardExp}" class="w-full text-xs font-mono p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                  </div>
                  <div>
                    <label class="text-xs text-slate-500 block mb-1">CVV / CVC (Masked)</label>
                    <input id="chk-cvv" type="password" value="${this.checkoutForm.cardCvv}" class="w-full text-xs font-mono p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                  </div>
                </div>
              </div>
            </div>
          `
              : ''
          }

          <!-- Step 3: Two-Factor Authentication (2FA) -->
          ${
            this.checkoutStep === 3
              ? `
            <div class="space-y-4 text-center py-2">
              <div class="w-12 h-12 mx-auto rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-cyan-400 flex items-center justify-center">
                <span class="material-symbols-outlined text-2xl">lock_clock</span>
              </div>
              <h3 class="text-base font-bold text-slate-900 dark:text-white">Two-Factor Authentication</h3>
              <p class="text-xs text-slate-500 max-w-sm mx-auto">
                A 6-digit cryptographic verification code has been dispatched to <strong>${this.checkoutForm.email}</strong> to verify this transaction.
              </p>

              <div class="py-2">
                <input 
                  id="chk-2fa-input" 
                  type="text" 
                  maxlength="6" 
                  placeholder="000000"
                  class="w-48 text-center text-2xl font-mono font-bold tracking-[8px] py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-blue-500 focus:outline-none"
                />
              </div>

              <div class="flex justify-center gap-4 text-xs">
                <button id="resend-2fa-btn" class="text-blue-600 dark:text-cyan-400 hover:underline">
                  ${this.t('resend2FA')}
                </button>
              </div>
            </div>
          `
              : ''
          }

          <!-- Step 4: Dispatch Confirmation & Google Integrations -->
          ${
            this.checkoutStep === 4 && this.lastCreatedOrder
              ? `
            <div class="space-y-5 py-2 text-center">
              <div class="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <span class="material-symbols-outlined text-3xl">check_circle</span>
              </div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-white">Order Confirmed: #${this.lastCreatedOrder.id}</h3>
              <p class="text-xs text-slate-500 max-w-sm mx-auto">
                Your payment was authenticated and tokenized. A priority courier is dispatched.
              </p>

              <!-- Live Integration CTAs -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button id="dispatch-gmail-btn" class="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-blue-500 text-xs font-semibold flex items-center justify-center gap-2">
                  <span class="material-symbols-outlined text-[18px] text-red-500">mail</span>
                  <span>${this.t('sendGmailReceipt')}</span>
                </button>
                <button id="dispatch-drive-btn" class="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-emerald-500 text-xs font-semibold flex items-center justify-center gap-2">
                  <span class="material-symbols-outlined text-[18px] text-emerald-500">cloud_upload</span>
                  <span>${this.t('archiveToDrive')}</span>
                </button>
              </div>
            </div>
          `
              : ''
          }
        </div>

        <!-- Bottom Action Bar -->
        <div class="pt-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div class="text-xs">
            <span class="text-slate-400 block">${this.t('orderTotal')}</span>
            <span class="text-lg font-bold font-mono text-blue-600 dark:text-cyan-400 tabular-nums">$${total.toLocaleString()}</span>
          </div>

          <div class="flex items-center gap-2">
            ${
              this.checkoutStep === 1
                ? `
              <button id="step1-next-btn" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors">
                Continue to Payment
              </button>
            `
                : ''
            }
            ${
              this.checkoutStep === 2
                ? `
              <button id="step2-back-btn" class="px-3.5 py-2 rounded-xl text-slate-500 text-xs hover:bg-slate-100 dark:hover:bg-slate-800">Back</button>
              <button id="step2-next-btn" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors">
                Authorize & Send 2FA
              </button>
            `
                : ''
            }
            ${
              this.checkoutStep === 3
                ? `
              <button id="step3-verify-btn" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors">
                ${this.t('verify2FACode')}
              </button>
            `
                : ''
            }
            ${
              this.checkoutStep === 4
                ? `
              <button id="step4-track-btn" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[16px]">location_on</span>
                <span>Track on Google Maps</span>
              </button>
            `
                : ''
            }
          </div>
        </div>
      </div>
    `;

    // Handlers
    modal.querySelector('#close-checkout-btn')?.addEventListener('click', () => {
      this.isCheckoutOpen = false;
      this.render();
    });

    modal.querySelector('#step1-next-btn')?.addEventListener('click', () => {
      const name = (modal.querySelector('#chk-name') as HTMLInputElement).value;
      const street = (modal.querySelector('#chk-street') as HTMLInputElement).value;
      const city = (modal.querySelector('#chk-city') as HTMLInputElement).value;
      const postal = (modal.querySelector('#chk-postal') as HTMLInputElement).value;
      const email = (modal.querySelector('#chk-email') as HTMLInputElement).value;

      this.checkoutForm.fullName = name;
      this.checkoutForm.street = street;
      this.checkoutForm.city = city;
      this.checkoutForm.postalCode = postal;
      this.checkoutForm.email = email;

      this.checkoutStep = 2;
      this.render();
    });

    modal.querySelector('#step2-back-btn')?.addEventListener('click', () => {
      this.checkoutStep = 1;
      this.render();
    });

    modal.querySelector('#step2-next-btn')?.addEventListener('click', async () => {
      // 1. Generate 2FA code
      const code = generate2FACode(this.checkoutForm.email);
      inventoryService.addToast('2FA Code Sent', `Your 2FA verification code is: ${code}`, 'security');

      // Attempt to email code via Gmail if user is logged in
      send2FACodeEmail(code, this.checkoutForm.email).catch(() => {});

      this.checkoutStep = 3;
      this.render();
    });

    modal.querySelector('#resend-2fa-btn')?.addEventListener('click', () => {
      const code = generate2FACode(this.checkoutForm.email);
      inventoryService.addToast('2FA Code Resent', `Your new 2FA code is: ${code}`, 'security');
    });

    modal.querySelector('#step3-verify-btn')?.addEventListener('click', async () => {
      const input = (modal.querySelector('#chk-2fa-input') as HTMLInputElement).value;
      const valid = verify2FACode(input);

      if (!valid) {
        inventoryService.addToast('Invalid 2FA Code', 'The code entered does not match or has expired.', 'warning');
        return;
      }

      // Tokenize payment card for PCI compliance
      const cardTokenData = tokenizePaymentCard(
        this.checkoutForm.cardNumber,
        '08',
        '28',
        this.checkoutForm.cardCvv
      );

      // Create Order
      const newOrder = await inventoryService.createOrder({
        items: [...inventoryService.getCart()],
        totalAmount: total,
        shippingAddress: {
          fullName: this.checkoutForm.fullName,
          street: this.checkoutForm.street,
          city: this.checkoutForm.city,
          state: this.checkoutForm.state,
          postalCode: this.checkoutForm.postalCode,
          country: this.checkoutForm.country,
        },
        paymentMethod: {
          type: this.checkoutForm.paymentType,
          lastFour: cardTokenData.lastFour,
          brand: cardTokenData.brand,
          token: cardTokenData.token,
        },
        estimatedDelivery: '35 mins',
        gmailSent: false,
      });

      this.lastCreatedOrder = newOrder;
      this.activeTrackingOrder = newOrder;
      this.checkoutStep = 4;
      this.render();
    });

    modal.querySelector('#dispatch-gmail-btn')?.addEventListener('click', async () => {
      if (!this.lastCreatedOrder) return;
      const confirmSend = window.confirm(`Send official order receipt to ${this.checkoutForm.email} via Gmail?`);
      if (confirmSend) {
        const res = await sendOrderConfirmationEmail(this.lastCreatedOrder, this.checkoutForm.email, true);
        if (res.success) {
          inventoryService.addToast('Receipt Emailed', 'Order confirmation sent via Gmail!', 'success');
        } else {
          inventoryService.addToast('Gmail Notice', res.error || 'Please connect your Google account.', 'info');
        }
      }
    });

    modal.querySelector('#dispatch-drive-btn')?.addEventListener('click', async () => {
      if (!this.lastCreatedOrder) return;
      const confirmDrive = window.confirm('Archive official tax invoice to your Google Drive?');
      if (confirmDrive) {
        const res = await archiveInvoiceToDrive(this.lastCreatedOrder, true);
        if (res.success) {
          inventoryService.addToast('Saved to Google Drive', 'Invoice archived successfully!', 'success');
        } else {
          downloadInvoiceLocal(this.lastCreatedOrder);
          inventoryService.addToast('Invoice Downloaded', 'Invoice downloaded locally to your device.', 'info');
        }
      }
    });

    modal.querySelector('#step4-track-btn')?.addEventListener('click', () => {
      this.isCheckoutOpen = false;
      this.currentView = 'tracking';
      this.render();
    });

    return modal;
  }

  // --- Real-Time Order Tracking View (Google Maps) ---
  private renderTrackingView(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col gap-6';

    const orders = inventoryService.getOrders();
    const activeOrder = this.activeTrackingOrder || orders[0];

    if (!activeOrder) {
      wrap.innerHTML = `
        <div class="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <span class="material-symbols-outlined text-4xl text-slate-400 mb-2">local_shipping</span>
          <h2 class="text-base font-bold text-slate-800 dark:text-white">No Active Orders Yet</h2>
          <p class="text-xs text-slate-500 mt-1 mb-4">Complete a checkout to track your courier live on Google Maps.</p>
          <button id="track-explore-btn" class="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold">Explore Catalog</button>
        </div>
      `;
      wrap.querySelector('#track-explore-btn')?.addEventListener('click', () => {
        this.currentView = 'store';
        this.render();
      });
      return wrap;
    }

    wrap.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div class="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-cyan-400 uppercase tracking-wider">
            <span>Priority Live Telematics</span>
            <span>·</span>
            <span>Order #${activeOrder.id}</span>
          </div>
          <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            ${this.t('deliveryLiveTracking')}
          </h1>
        </div>

        <div class="flex items-center gap-3">
          <button id="track-back-store-btn" class="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
            Back to Store
          </button>
        </div>
      </div>

      <!-- Google Maps Canvas Container (Mandatory explicit height per CF2) -->
      <div class="relative w-full h-[450px] md:h-[520px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl bg-slate-950">
        <div id="google-maps-tracking-canvas" class="w-full h-full"></div>

        <!-- Floating Live Telematics Card -->
        <div class="absolute top-4 left-4 z-20 w-[90%] max-w-sm bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 rounded-xl p-4 backdrop-blur shadow-xl">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-cyan-400 flex items-center justify-center font-bold text-sm">
                AR
              </div>
              <div>
                <div class="text-xs font-bold text-slate-900 dark:text-white">${activeOrder.courier.name}</div>
                <div class="text-[11px] text-slate-500">${activeOrder.courier.vehicle}</div>
              </div>
            </div>
            <div class="text-right">
              <div class="text-sm font-bold font-mono text-blue-600 dark:text-cyan-400 tabular-nums">
                ${activeOrder.courier.etaMinutes} MIN
              </div>
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Live ETA</div>
            </div>
          </div>

          <div class="space-y-2 text-xs">
            <div class="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Courier Speed:</span>
              <span class="font-mono font-semibold">${activeOrder.courier.speedKmh} km/h</span>
            </div>
            <div class="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Security Vault:</span>
              <span class="text-emerald-500 font-semibold">256-Bit Telematics</span>
            </div>
          </div>
        </div>
      </div>
    `;

    wrap.querySelector('#track-back-store-btn')?.addEventListener('click', () => {
      this.currentView = 'store';
      this.render();
    });

    // Mount Google Maps
    requestAnimationFrame(() => {
      const mapContainer = document.getElementById('google-maps-tracking-canvas');
      if (mapContainer) {
        if (this.trackingMapInstance) {
          this.trackingMapInstance.destroy();
        }
        this.trackingMapInstance = new OrderTrackingMap(mapContainer);
        this.trackingMapInstance.init(activeOrder.courier);
      }
    });

    return wrap;
  }

  // --- Inventory Management Admin View ---
  private renderInventoryAdminView(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-col gap-6';

    const products = inventoryService.getProducts();

    wrap.innerHTML = `
      <div class="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Product Inventory Management
          </h1>
          <p class="text-xs text-slate-500 mt-0.5">Real-time stock adjustment, replenishment alerts, and warehouse telematics.</p>
        </div>
        <button id="admin-back-btn" class="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800">
          Back to Store
        </button>
      </div>

      <div class="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700/60">
            <tr>
              <th class="p-4">Hardware Item</th>
              <th class="p-4">Category</th>
              <th class="p-4">Unit Price</th>
              <th class="p-4">Current Stock</th>
              <th class="p-4">Stock Adjustment</th>
              <th class="p-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            ${products
              .map(
                (p) => `
              <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                <td class="p-4 flex items-center gap-3">
                  <img src="${p.image}" alt="${p.name}" referrerpolicy="no-referrer" class="w-10 h-10 rounded-lg object-cover bg-slate-950" />
                  <span class="font-bold text-slate-900 dark:text-white">${p.name}</span>
                </td>
                <td class="p-4 uppercase text-slate-500 font-medium">${p.category}</td>
                <td class="p-4 font-mono font-bold">$${p.price.toLocaleString()}</td>
                <td class="p-4 font-mono font-bold text-base ${p.stock <= 5 ? 'text-amber-500' : 'text-slate-900 dark:text-white'}">
                  ${p.stock}
                </td>
                <td class="p-4">
                  <div class="flex items-center gap-1.5">
                    <button data-stock-adj="${p.id}" data-delta="-5" class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold">-5</button>
                    <button data-stock-adj="${p.id}" data-delta="-1" class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold">-1</button>
                    <button data-stock-adj="${p.id}" data-delta="1" class="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold">+1</button>
                    <button data-stock-adj="${p.id}" data-delta="10" class="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">+10 Restock</button>
                  </div>
                </td>
                <td class="p-4 text-right">
                  <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${
                    p.stock > 5 ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' : 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                  }">
                    ${p.stock > 0 ? 'Optimal Depot' : 'Out of Stock'}
                  </span>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    wrap.querySelector('#admin-back-btn')?.addEventListener('click', () => {
      this.currentView = 'store';
      this.render();
    });

    wrap.querySelectorAll('button[data-stock-adj]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.stockAdj!;
        const delta = parseInt((btn as HTMLElement).dataset.delta!, 10);
        const p = inventoryService.getProductById(id);
        if (p) {
          inventoryService.updateProductStock(id, p.stock + delta);
        }
      });
    });

    return wrap;
  }

  // --- Customer Review Submission Modal ---
  private renderReviewModal(): HTMLElement {
    const p = inventoryService.getProductById(this.activeReviewProductId || '');
    if (!p) return document.createElement('div');

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md';

    modal.innerHTML = `
      <div class="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
        <div class="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <h3 class="text-base font-bold text-slate-900 dark:text-white">Review: ${p.name}</h3>
          <button id="close-rev-modal-btn" class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="text-slate-500 block mb-1">Your Name</label>
            <input id="rev-name" type="text" value="${getCurrentUser()?.displayName || 'Verified Purchaser'}" class="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
          </div>

          <div>
            <label class="text-slate-500 block mb-1">Rating</label>
            <select id="rev-rating" class="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <option value="5">★★★★★ - Exceptional Precision</option>
              <option value="4">★★★★☆ - Very Good</option>
              <option value="3">★★★☆☆ - Average</option>
            </select>
          </div>

          <div>
            <label class="text-slate-500 block mb-1">Experience & Comments</label>
            <textarea id="rev-comment" rows="3" placeholder="Share your experience with the optics, latency, and spatial immersion..." class="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"></textarea>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button id="cancel-rev-btn" class="px-4 py-2 rounded-xl text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
          <button id="submit-rev-btn" class="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold">Submit Verified Review</button>
        </div>
      </div>
    `;

    modal.querySelector('#close-rev-modal-btn')?.addEventListener('click', () => {
      this.activeReviewProductId = null;
      this.render();
    });
    modal.querySelector('#cancel-rev-btn')?.addEventListener('click', () => {
      this.activeReviewProductId = null;
      this.render();
    });
    modal.querySelector('#submit-rev-btn')?.addEventListener('click', () => {
      const author = (modal.querySelector('#rev-name') as HTMLInputElement).value;
      const rating = parseInt((modal.querySelector('#rev-rating') as HTMLSelectElement).value, 10);
      const comment = (modal.querySelector('#rev-comment') as HTMLTextAreaElement).value;

      if (!comment.trim()) {
        inventoryService.addToast('Empty Review', 'Please enter a comment for your review.', 'warning');
        return;
      }

      inventoryService.addReview(p.id, author, rating, comment);
      this.activeReviewProductId = null;
      this.render();
    });

    return modal;
  }

  // --- Push Notification Toasts ---
  private renderToasts(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none';

    const toasts = inventoryService.getToasts();
    wrap.innerHTML = toasts
      .map((t) => {
        const icon =
          t.type === 'success'
            ? 'check_circle'
            : t.type === 'warning'
            ? 'warning'
            : t.type === 'security'
            ? 'lock'
            : 'notifications';
        const color =
          t.type === 'success'
            ? 'text-emerald-500 border-emerald-500/30'
            : t.type === 'warning'
            ? 'text-amber-500 border-amber-500/30'
            : t.type === 'security'
            ? 'text-cyan-400 border-cyan-500/30'
            : 'text-blue-500 border-blue-500/30';

        return `
        <div class="pointer-events-auto p-3.5 rounded-xl bg-white/95 dark:bg-slate-900/95 border ${color} shadow-2xl backdrop-blur flex items-start gap-3 transform transition-all duration-300">
          <span class="material-symbols-outlined text-[20px] ${color.split(' ')[0]} shrink-0 mt-0.5">${icon}</span>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-bold text-slate-900 dark:text-white">${t.title}</div>
            <div class="text-xs text-slate-500 dark:text-slate-300 mt-0.5">${t.message}</div>
          </div>
        </div>
      `;
      })
      .join('');

    return wrap;
  }

  // --- Footer ---
  private renderFooter(): HTMLElement {
    const footer = document.createElement('footer');
    footer.className =
      'mt-16 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-12 text-xs text-slate-500 dark:text-slate-400';
    footer.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div class="flex items-center gap-3">
          <span class="font-bold text-slate-900 dark:text-white tracking-wider">${this.t('brand')}</span>
          <span>·</span>
          <span>${this.t('tagline')}</span>
        </div>
        <div class="flex flex-wrap items-center gap-6 text-[11px]">
          <span>256-bit AES-GCM Encrypted Storage</span>
          <span>PCI-DSS Level 1 Gateway</span>
          <span>Three.js PBR Engine</span>
          <span>WebXR Certified</span>
        </div>
        <div>
          © 2026 AetherStore Technologies. All rights reserved.
        </div>
      </div>
    `;
    return footer;
  }
}
