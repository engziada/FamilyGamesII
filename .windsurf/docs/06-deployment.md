# Deployment Guide

## Overview

Family Games II uses a split architecture:
- **Flask (Python)**: HTTP server for templates and static assets
- **Convex**: Real-time backend for all game logic, state management, and multiplayer sync

Both components must be deployed and configured correctly for the application to work.

---

## Prerequisites

1. **Convex Account**: Sign up at [convex.dev](https://convex.dev)
2. **Hosting Platform**: Render, Vercel, Railway, or similar
3. **Node.js**: v18+ for running seeding scripts locally

---

## Deployment Steps

### 1. Deploy Convex Backend

#### Create Production Deployment

```bash
# Install Convex CLI
npm install -g convex

# Login to Convex
npx convex login

# Create production deployment
npx convex deploy --prod
```

This creates a production Convex deployment and outputs a URL like:
```
https://savory-lobster-861.eu-west-1.convex.cloud
```

**Save this URL** — you'll need it for both Flask configuration and content seeding.

#### Deploy Convex Functions

```bash
# Deploy all mutations, queries, and scheduled functions
npx convex deploy
```

This pushes all files from `convex/` to your production deployment.

---

### 2. Seed Game Content (CRITICAL)

**⚠️ REQUIRED STEP**: Without seeding, games will end after the first turn because the `gameItems` table will be empty.

```bash
# Seed production Convex with all game content
$env:CONVEX_URL="https://your-production.convex.cloud"; node scripts/seedContent.mjs
```

Replace `https://your-production.convex.cloud` with your actual production URL from Step 1.

**Expected Output:**
```
Seeding content into Convex...

[charades] Added: 213, Skipped: 0, Total: 213
[riddles] Added: 189, Skipped: 0, Total: 189
[who_am_i] Added: 118, Skipped: 0, Total: 118
[twenty_questions] Added: 96, Skipped: 0, Total: 96
[trivia] Added: 100, Skipped: 0, Total: 100
[rapid_fire] Added: 100, Skipped: 0, Total: 100
[meen_yazood] Added: 196, Skipped: 0, Total: 196

Done! All content seeded.
```

**Note**: The seeding script is idempotent — running it multiple times is safe. It uses content hashing to skip duplicates.

---

### 3. Deploy Flask Application

#### Option A: Render.com

1. **Create New Web Service**
   - Connect your GitHub repository
   - Select Python environment
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app`

2. **Configure Environment Variables**
   - `CONVEX_URL`: Your production Convex URL from Step 1
   - `PYTHON_VERSION`: `3.11` (or your version)

3. **Deploy**
   - Render will automatically build and deploy
   - Note your Render URL (e.g., `https://family-games.onrender.com`)

#### Option B: Vercel

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy**
   ```bash
   vercel --prod
   ```

3. **Set Environment Variables**
   ```bash
   vercel env add CONVEX_URL production
   # Paste your production Convex URL when prompted
   ```

---

### 4. Configure Frontend

Update your frontend to use the production Convex URL:

**For Static Deployment:**

Create `.env.production`:
```bash
VITE_CONVEX_URL=https://your-production.convex.cloud
```

**For Server-Rendered (Flask):**

The Flask app reads `CONVEX_URL` from environment variables and injects it into templates. Ensure your hosting platform has this variable set.

---

## Verification Checklist

After deployment, verify everything works:

### ✅ Convex Backend
- [ ] Production deployment created
- [ ] All functions deployed (check Convex dashboard)
- [ ] Game content seeded (1012 total items across all games)

### ✅ Flask Application
- [ ] Application accessible at production URL
- [ ] Home page loads with all 8 games visible
- [ ] Static assets (CSS, JS, images) load correctly

### ✅ Game Functionality
- [ ] Can create a room
- [ ] Can join a room with code
- [ ] Lobby shows all players in real-time
- [ ] Game starts and progresses beyond first turn
- [ ] Scoring updates correctly
- [ ] Game ends and shows winner screen

### ✅ Meen Yazood Specific
- [ ] Host can create teams (2-4 teams)
- [ ] Players can select teams
- [ ] Team-based scoring works
- [ ] End screen shows team leaderboard

---

## Troubleshooting

### Problem: Games end after first turn

**Cause**: Production Convex not seeded with game content

**Solution**: Run the seeding script with production `CONVEX_URL`:
```bash
$env:CONVEX_URL="https://your-production.convex.cloud"; node scripts/seedContent.mjs
```

### Problem: "CONVEX_URL not found" error

**Cause**: Environment variable not set in hosting platform

**Solution**: 
1. Go to hosting platform dashboard (Render/Vercel)
2. Navigate to Environment Variables
3. Add `CONVEX_URL` with your production Convex URL
4. Redeploy the application

### Problem: Real-time updates not working

**Cause**: Frontend using wrong Convex URL or CORS issues

**Solution**:
1. Check browser console for Convex connection errors
2. Verify `CONVEX_URL` in environment variables
3. Check Convex dashboard → Settings → Allowed Origins
4. Add your production domain to allowed origins

### Problem: Static assets 404

**Cause**: Incorrect static file paths or missing build step

**Solution**:
1. Verify `static/` folder is included in deployment
2. Check Flask `static_folder` configuration
3. Ensure hosting platform serves static files correctly

---

## Rollback Procedure

If deployment fails or introduces bugs:

### Rollback Convex
```bash
# List recent deployments
npx convex deployments list

# Rollback to specific deployment
npx convex deployments rollback <deployment-id>
```

### Rollback Flask
- **Render**: Redeploy previous commit from dashboard
- **Vercel**: `vercel rollback` or redeploy previous deployment

---

## Monitoring

### Convex Logs
- Dashboard → Logs
- Real-time function execution logs
- Error tracking and debugging

### Flask Logs
- **Render**: Dashboard → Logs tab
- **Vercel**: Dashboard → Deployments → Function logs

### Key Metrics to Monitor
- Active rooms count
- Player connections
- Game completion rate
- Error rates in Convex functions
- Response times

---

## Security Checklist

- [ ] `CONVEX_URL` stored as environment variable (not hardcoded)
- [ ] No sensitive data in client-side code
- [ ] CORS properly configured in Convex
- [ ] Rate limiting enabled for mutations
- [ ] Input validation on all user inputs
- [ ] Proper error handling (no stack traces to users)

---

## Performance Optimization

### Convex
- Use indexes for frequently queried fields
- Batch mutations when possible
- Implement pagination for large result sets
- Monitor function execution times

### Flask
- Enable gzip compression
- Use CDN for static assets
- Implement caching headers
- Optimize image sizes

---

## Continuous Deployment

### GitHub Actions Example

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy-convex:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx convex deploy --prod
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}

  deploy-flask:
    runs-on: ubuntu-latest
    needs: deploy-convex
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Render
        run: curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
```

---

## Post-Deployment

1. **Test all game types** with real users
2. **Monitor error rates** for first 24 hours
3. **Verify seeding** by checking item counts in Convex dashboard
4. **Update documentation** if any issues discovered
5. **Announce deployment** to users

---

## Related Documentation

- [Architecture Overview](./01-architecture.md)
- [Data Content Pipeline](./05-data-content-pipeline.md)
- [Seeding Script README](../scripts/README.md)
