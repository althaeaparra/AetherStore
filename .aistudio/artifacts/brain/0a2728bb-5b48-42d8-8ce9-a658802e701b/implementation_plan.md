# AetherStore: Next-Gen Spatial Electronics & Wearables E-Commerce

A high-tech spatial e-commerce platform featuring an interactive 3D product inspection canvas, WebXR spatial showroom, PCI-compliant checkout with two-factor authentication (2FA), real-time delivery tracking on Google Maps, and automated Gmail receipt dispatch and Google Drive invoice archiving.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following product decisions were confirmed during the planning interview:
> - **Product Catalog**: High-tech spatial gadgets, wearables, and electronics (e.g. Spatial Audio Visor, Neural Headband, Holographic Smart Ring, Cyberdeck Drone, Quantum Precision Watch).
> - **3D / XR Architecture**: Seamless hybrid storefront with responsive 2D store UI, high-performance Three.js 3D product inspection viewer, and one-click immersive WebXR spatial showroom.
> - **Google Workspace Integration**: Gmail sends live order confirmations and 2FA verification codes; Google Drive automatically archives itemized purchase invoices.
> - **Security & Compliance**: Client-side AES-GCM data encryption simulation for user records, TOTP/SMS/Email-based 2FA modal verification, and PCI-DSS compliant payment simulation (tokenized card vaulting, CVV scrubbing, zero plain-text card storage).

---

### 1. Overview & Core Concept

- **What It Does**: AetherStore provides a complete end-to-end shopping experience for cutting-edge spatial electronics. Users browse dynamic inventories, inspect procedural 3D PBR models with explode-view and finish customization, experience immersive WebXR display pedestals, add items to their encrypted wishlist/cart, verify transactions via multi-factor authentication, track live courier delivery on an interactive Google Map, and manage verified customer reviews.
- **Target Audience / Persona**: Tech enthusiasts, spatial computing adopters, hardware designers, and international shoppers seeking premium wearable electronics with multilingual and dual-theme accessibility.
- **Key Value**: Merges the convenience and reliability of modern e-commerce (inventory management, personalized recommendations, push notifications, multi-currency/multi-language) with next-generation spatial computing (interactive 3D inspection and WebXR) and real Google Workspace automated fulfillment (Gmail + Drive).

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Catalog & Recommendations**: Shoppers filter by category (Visors, Wearables, Neural, Drones) or search in real-time. Browsing history dynamically feeds the personalized "Recommended for You" engine.
2. **Interactive 3D Product Detail (PDP) & WebXR Showroom**:
   - Shoppers open any item to inspect an intricate 3–12 part procedural Three.js 3D model with studio PBR reflections, material finish toggles, and exploded-view inspection.
   - One click launches the WebXR spatial mode for supported headsets/browsers via XR Blocks.
3. **Wishlist & Cart Management**: Instant optimistic state updates, stock quantity threshold warnings, and persistent encrypted storage.
4. **Secure Checkout & 2FA**:
   - PCI-compliant mock payment gateway supporting credit cards (tokenized), Apple Pay/Google Pay, and crypto.
   - Step-up Two-Factor Authentication (2FA) with verification codes sent via integrated Gmail or in-app authenticator.
5. **Real-Time Order Tracking**:
   - Post-order dashboard rendering an interactive Google Map tracking the courier vehicle in real-time with ETA, waypoint steps, and dispatch status.
6. **Workspace Integration & Review Feedback**:
   - Order confirmation and shipment notification sent to user's Gmail.
   - Clean PDF/HTML invoice generated and archived directly to the user's Google Drive.
   - Post-purchase verified user review submission with star ratings and photo attachments.

#### Visual Identity & Theme
- **Aesthetic Direction**: Sleek high-tech minimalist luxury. Titanium, matte graphite, and optical glass surfaces with disciplined cobalt accent highlights.
- **Color Distribution (60-30-10 Rule)**:
  - *60% Neutral Canvas*: Slate `#0B0F17` in Dark Mode, crisp porcelain `#F8FAFC` in Light Mode.
  - *30% Structural Surfaces*: Subtle dark obsidian containers `#131B2E` with hairline borders (`#1E293B`).
  - *10% Disciplined Accent*: Electric cobalt `#3B82F6` and cyan `#06B6D4` exclusively for primary action points and active tabs.
- **Dual-Theme Support**: Flawless Dark/Light switching with `@custom-variant dark` in Tailwind CSS and zero `!important` inversion hacks.
- **Typography & Scale**:
  - Display face: `Plus Jakarta Sans` / `Outfit` for balanced modern geometric authority.
  - Body face: `Plus Jakarta Sans` / `DM Sans` for high legibility (15–16px, 1.5 line height).
  - Telemetry & Pricing: Tabular figures (`tabular-nums`, `font-mono`) for prices, order IDs, and stock counters.
- **Zero-Pill Discipline & Restraint**: Unboxed metadata text separated by `·` or `/`. No fake compiler comment prefixes (`//`), no pulsating status dots, and no ornamental footer engines.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Modular Hybrid 2D Store + Three.js 3D Viewer + WebXR Showroom**:
  - *Chosen Approach*: Embed the 3D canvas within a stable React/TS container with room environment PBR lighting and collapsible bottom dock controls. Integrate `xrblocks` for spatial session entry.
  - *Why*: Provides high-speed shopping for 95% of desktop/mobile shoppers while enabling immersive spatial inspection for XR headset users without separate codebases.
- **Decision 2: Google Workspace OAuth (Gmail & Google Drive)**:
  - *Chosen Approach*: Use client-side Firebase Auth + Google OAuth with least-privilege scopes (`gmail.send`, `drive.file`).
  - *Why*: Allows real transactional emails and invoice uploads without brittle server redirect flows or leaked client secrets.
- **Decision 3: Real-Time Order Tracking with Google Maps Platform**:
  - *Chosen Approach*: Embed Google Maps JavaScript API with modern `AdvancedMarkerElement` and live courier simulation along route coordinates.
  - *Why*: Delivers an engaging, transparent post-purchase tracking experience with live status updates.
- **Decision 4: Encrypted Local & Cloud-Backed Inventory State**:
  - *Chosen Approach*: Client-side AES-GCM data encryption layer with simulated cloud sync, optimistic inventory decrementing, and persistent user profile/order history.
  - *Why*: Guarantees privacy, resilience against network interruptions, and instant UI response times.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AETHERSTORE CLIENT APP                          │
├────────────────────────────────────────────────────────────────────────┤
│  Top Navigation (Brand · Categories · Wishlist · Cart · Lang · Theme)  │
├───────────────────────────────┬────────────────────────────────────────┤
│       Catalog & Discovery     │       Interactive 3D / XR Canvas       │
│  - Filter & Search Bar        │  - Three.js Procedural PBR Models      │
│  - Product Grid (Images, Specs)│ - Collapsible Bottom Control Dock     │
│  - Personalized AI Recommender│  - WebXR Pedestal Showroom (xrblocks)  │
├───────────────────────────────┴────────────────────────────────────────┤
│                          Checkout & Security                           │
│  - PCI Tokenized Card Vault · 2FA Code Verification (Gmail / TOTP)     │
├───────────────────────────────┬────────────────────────────────────────┤
│      Real-Time Fulfillment    │         Workspace Integrations         │
│  - Google Maps Live Tracker   │  - Gmail API (Order Confirmation Email)│
│  - Courier Route & ETA Steps  │  - Drive API (PDF Invoice Archive)     │
├───────────────────────────────┴────────────────────────────────────────┤
│         State & Persistence (AES-GCM Encrypted Cloud / LocalStore)      │
│  - Inventory Manager · Wishlist · Cart · Reviews · Browsing History    │
└────────────────────────────────────────────────────────────────────────┘
```

#### Core Data Entities
- **Product**: `id`, `name`, `category`, `price`, `rating`, `reviewCount`, `stock`, `specs`, `description`, `modelType` (visor/ring/bci/drone/watch), `variants`, `features`.
- **CartItem**: `productId`, `quantity`, `selectedVariant`, `unitPrice`.
- **Order**: `id`, `items`, `totalAmount`, `currency`, `tax`, `shipping`, `shippingAddress`, `status` (processing/dispatched/in_transit/delivered), `courierLocation` (`{lat, lng}`), `createdAt`, `invoiceDriveId`, `emailSent`.
- **Review**: `id`, `productId`, `author`, `rating`, `date`, `comment`, `verifiedPurchase`, `likes`.
- **UserPreferences**: `language` (EN, ES, FR, JA, DE), `theme` (dark/light), `wishlist`, `browsingHistory`, `twoFactorEnabled`, `twoFactorMethod`.

#### Key Implementation Steps (Upon Approval)
1. **Google Maps & OAuth Provisioning**: Trigger Maps key enablement and Google Workspace OAuth scopes (`gmail.send`, `drive.file`).
2. **Catalog & High-Fidelity Visual Assets**: Generate procedural 3D models and curated product photography.
3. **Core Storefront & 3D Viewer**: Build responsive product grid, detail view with 3D canvas & bottom control dock, and WebXR entry.
4. **Cart, Wishlist & Personalized Recommendation Engine**: Implement history-based ranking and inventory deduction.
5. **PCI-Compliant Checkout & 2FA Flow**: Tokenized payment form with 2FA modal verification.
6. **Real-Time Delivery Tracking on Google Maps**: Render dynamic delivery route and live vehicle marker.
7. **Gmail & Google Drive Integrations**: Automated dispatch emails and invoice storage.
8. **Internationalization & Dual-Theme Polish**: Multi-language strings (EN, ES, JA, DE, FR) and dark/light mode toggle.
