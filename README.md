# Aether Spatial — E-Commerce & WebXR Virtual Showroom

A next-generation e-commerce platform for spatial computing hardware, wearables, and electronic gadgets. Features interactive Three.js 3D product inspection, an immersive WebXR virtual showroom with XR Blocks, real-time Google Maps order delivery tracking, PCI-compliant checkout with 2FA, Gmail receipts, and Google Drive invoice archiving.

---

## Features

- **WebXR Virtual Showroom**: Walk through a 360° spatial pavilion in VR or simulator mode with interactive radial pedestals, live finish swatches, and spatial UI (`xb.UICard`).
- **3D Product Inspection Lab**: Studio PBR lighting, exploded part views, and real-time material swapping (Titanium, Obsidian, Chrome, Emerald).
- **Live Google Maps Tracking**: Real-time simulated courier routing with custom pulsing markers, speed controls (1x, 3x, 6x), and multi-stop waypoints.
- **Secure Checkout & 2FA**: Web Crypto AES-GCM 256-bit encryption with step-up verification.
- **Google Workspace Integration**: Automated order dispatch confirmations via Gmail API and invoice backup to Google Drive.
- **Internationalization & Theming**: English, Spanish, Japanese, German, and French support with dark/light themes.

---

## How to Publish to GitHub & GitHub Pages

### 1. Initialize Git and Commit

Open your terminal in the project root directory and run:

```bash
# Initialize a local Git repository
git init

# Stage all files
git add .

# Create initial commit
git commit -m "feat: initial release of Aether Spatial Store"

# Rename default branch to main
git branch -M main
```

---

### 2. Create a New Repository on GitHub

1. Go to [github.com/new](https://github.com/new).
2. Enter a repository name (for example, `aether-spatial-store`).
3. Set visibility to **Public** (required for free GitHub Pages).
4. Do **not** check "Initialize with a README" or add `.gitignore` (these already exist in your project).
5. Click **Create repository**.

---

### 3. Push Your Code to GitHub

Copy the repository URL from GitHub and run:

```bash
# Add your GitHub repository as remote origin (replace with your repo URL)
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git

# Push code to main
git push -u origin main
```

---

### 4. Enable Automated GitHub Pages Deployment

This repository already includes an automated GitHub Actions deployment workflow in `.github/workflows/deploy.yml`.

To activate GitHub Pages:

1. In your GitHub repository, click on **Settings** (gear icon at the top).
2. In the left sidebar, click **Pages** (under the "Code and automation" section).
3. Under **Build and deployment** > **Source**, select **GitHub Actions**.
4. That's it! GitHub Actions will automatically run the workflow and deploy the application.
5. In 1–2 minutes, your live site will be accessible at:
   ```
   https://<YOUR_USERNAME>.github.io/<YOUR_REPO_NAME>/
   ```

---

## Local Development

```bash
# Install dependencies
npm install

# Start local development server
npm run dev
```

Visit `http://localhost:3000` in your browser.
