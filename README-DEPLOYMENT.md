# 🚀 ArbitrageX Supreme V3.6 - Deployment Guide

## 📦 System Architecture

```
┌──────────────────┐      ┌─────────────────┐      ┌──────────────────┐
│   Dashboard UI   │ ───► │ Cloudflare Edge │ ───► │ Rust MEV Engine  │
│  (Replit/Local)  │      │   (Workers)     │      │     (VPS)        │
└──────────────────┘      └─────────────────┘      └──────────────────┘
       Next.js                 D1/KV/DO              100+ RPCs
```

## 🏗️ What's Ready to Deploy

### ✅ Available in This Repository

1. **Dashboard (Next.js + PostgreSQL)**
   - Location: Root directory
   - Status: ✅ Running on Replit
   - Features: 4 pages, real data, 8 API endpoints

2. **Rust MEV Engine**
   - Location: `rust-mev-engine/`
   - Status: ✅ Code complete, needs VPS
   - Features: 13 strategies, multicall, 100+ RPCs

3. **Cloudflare Workers**
   - Location: `cloudflare-workers/`
   - Status: ✅ Code complete, needs Cloudflare account
   - Features: Edge API, caching, WebSocket, auth

4. **Deployment Scripts**
   - Location: `deployment/`
   - Status: ✅ Ready to use
   - Features: VPS setup, monitoring, Windows installer

## 🚀 Deployment Instructions

### Option 1: Full Production Deployment

#### Step 1: Deploy Rust MEV Engine to VPS

**Requirements:**
- Ubuntu 22.04+ VPS (min 8GB RAM, 4 CPUs)
- Domain name for SSL
- PostgreSQL database

```bash
# On your VPS:
git clone <your-repo>
cd deployment/vps
chmod +x install.sh
sudo ./install.sh

# Follow prompts for:
# - Domain name
# - PostgreSQL password
# - Let's Encrypt email
```

#### Step 2: Deploy Cloudflare Workers

**Requirements:**
- Cloudflare account (free tier OK)
- Wrangler CLI installed

```bash
# On your local machine:
cd cloudflare-workers
npm install
npx wrangler login

# Create D1 database
npx wrangler d1 create arbitragex-db
# Create KV namespaces
npx wrangler kv:namespace create cache
npx wrangler kv:namespace rate_limits

# Update wrangler.toml with IDs from above commands

# Deploy
npm run deploy
```

#### Step 3: Connect Dashboard to Infrastructure

Update `.env.local` in root:
```env
NEXT_PUBLIC_API_URL=https://your-workers.domain.workers.dev
NEXT_PUBLIC_CF_URL=https://your-workers.domain.workers.dev
NEXT_PUBLIC_WS_URL=wss://your-workers.domain.workers.dev
```

Redeploy on Replit or your hosting platform.

### Option 2: Windows Local Installation

**For development/testing only:**

```powershell
# Run PowerShell as Administrator
cd deployment/windows
Set-ExecutionPolicy Bypass -Scope Process
.\install.ps1

# This will:
# - Install all prerequisites via Chocolatey
# - Setup PostgreSQL locally
# - Create Windows services
# - Add firewall rules
# - Create desktop shortcuts
```

### Option 3: Docker Compose (Recommended for Testing)

```bash
cd deployment/vps
docker-compose up -d

# Access:
# - Dashboard: http://localhost:5000
# - Rust API: http://localhost:8080
# - Grafana: http://localhost:3000
# - Prometheus: http://localhost:9090
```

## 🔧 Configuration

### Rust MEV Engine Configuration

Edit `rust-mev-engine/config/config.toml`:

```toml
[rpc]
ethereum = ["https://eth.llamarpc.com", "..."]  # Add your RPCs

[strategies]
sandwich = true
backrun = true
liquidation = true
# ... configure 13 strategies

[execution]
min_profit_usd = 10.0
max_gas_price_gwei = 100
```

### Cloudflare Workers Configuration

Edit `cloudflare-workers/wrangler.toml`:

```toml
[vars]
RUST_API_URL = "https://your-vps.com:8080"
JWT_SECRET = "your-secret-here"
```

### Monitoring Setup

Access Grafana at `http://your-vps:3000`
- Default user: admin/admin
- Dashboard: MEV Performance
- Alerts: Configured via Telegram/Discord

## 📊 Architecture Components

### 1. Dashboard (This Replit)
- **Purpose:** User interface
- **Stack:** Next.js, PostgreSQL, TailwindCSS
- **Location:** Replit or any Node.js host

### 2. Rust MEV Engine (VPS Required)
- **Purpose:** Core MEV logic
- **Stack:** Rust, Tokio, Ethers-rs
- **Requirements:** High-performance VPS, 100+ RPC endpoints
- **Features:**
  - 13 MEV strategies
  - Multicall batching
  - Flashbots integration
  - Real-time opportunity detection

### 3. Cloudflare Workers (Edge)
- **Purpose:** API proxy, caching, auth
- **Stack:** TypeScript, Hono.js, D1, KV
- **Features:**
  - Global edge network
  - Rate limiting
  - JWT authentication
  - WebSocket support

### 4. Monitoring Stack
- **Prometheus:** Metrics collection
- **Grafana:** Visualization
- **Alertmanager:** Notifications
- **40+ alerts configured**

## ⚠️ Important Notes

### What Runs on Replit
- ✅ Dashboard UI (Next.js)
- ✅ Local API endpoints
- ✅ PostgreSQL database
- ❌ Rust MEV Engine (needs VPS)
- ❌ Cloudflare Workers (needs deployment)

### Production Requirements
- **VPS:** $40-100/month for MEV engine
- **Cloudflare:** Free tier sufficient
- **RPCs:** $200-500/month for premium endpoints
- **Domain:** Required for SSL

### Security Checklist
- [ ] Change all default passwords
- [ ] Enable firewall on VPS
- [ ] Setup SSL certificates
- [ ] Configure JWT secrets
- [ ] Enable rate limiting
- [ ] Setup monitoring alerts
- [ ] Regular backups

## 🛠️ Troubleshooting

### Dashboard Not Showing Data
```bash
npm run db:push
npm run db:seed
npm run dev
```

### Rust Engine Not Starting
```bash
cd rust-mev-engine
cargo build --release
./target/release/mev-engine
```

### Cloudflare Workers Errors
```bash
npx wrangler tail  # View live logs
npx wrangler d1 execute arbitragex-db --command "SELECT * FROM opportunities"
```

## 📝 Support

For issues or questions:
1. Check logs in `deployment/logs/`
2. View Grafana dashboards
3. Check Prometheus alerts
4. Review systemd status: `systemctl status rust-mev-engine`

## 🎯 Quick Start Commands

```bash
# Replit Dashboard
npm run dev

# Rust MEV Engine (on VPS)
cd rust-mev-engine && cargo run --release

# Cloudflare Workers
cd cloudflare-workers && npm run deploy

# Windows Local
.\deployment\windows\install.ps1

# Docker Compose
docker-compose up -d
```

---

**Note:** This system is production-ready but requires external infrastructure (VPS, Cloudflare) for full functionality. The Replit instance only runs the dashboard UI.