# SOCO Website Deployment Guide

This guide will help you deploy the SOCO website with the frontend on **Vercel** and the backend/database on **Railway**.

## Architecture Overview

- **Frontend (Client)**: Deployed on Vercel
- **Backend (Server + API)**: Deployed on Railway
- **Database**: PostgreSQL/MySQL on Railway

---

## Prerequisites

1. GitHub account with repository access
2. Vercel account (https://vercel.com)
3. Railway account (https://railway.app)
4. Domain name (optional, for custom domain)

---

## Part 1: Database Setup on Railway

### Step 1: Create Railway Project

1. Go to https://railway.app
2. Click "New Project"
3. Select "Provision MySQL" (or PostgreSQL if preferred)
4. Wait for database to be provisioned

### Step 2: Get Database Credentials

1. Click on your database service
2. Go to "Variables" tab
3. Copy the `DATABASE_URL` connection string
4. Format: `mysql://user:password@host:port/database`

---

## Part 2: Backend Deployment on Railway

### Step 1: Deploy Backend

1. In Railway, click "New" → "GitHub Repo"
2. Select your `soco-website` repository
3. Railway will auto-detect the configuration

### Step 2: Configure Environment Variables

Go to your backend service → Variables tab and add:

```env
# Database
DATABASE_URL=<your-database-url-from-step-1>

# JWT & Auth
JWT_SECRET=<generate-random-32-char-string>
OAUTH_SERVER_URL=https://api.manus.im

# App Config
NODE_ENV=production
PORT=3000

# Owner Info (for admin access)
OWNER_NAME=SOCO Admin
OWNER_OPEN_ID=<your-admin-id>

# S3 Storage (if using file uploads)
AWS_ACCESS_KEY_ID=<your-aws-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret>
AWS_REGION=us-east-1
AWS_S3_BUCKET=<your-bucket-name>

# Analytics Dashboard Password
ANALYTICS_PASSWORD=soco2024analytics
```

### Step 3: Run Database Migrations

1. In Railway, go to your backend service
2. Click "Settings" → "Deploy"
3. Add build command: `pnpm install && pnpm db:push`
4. Redeploy the service

### Step 4: Get Backend URL

1. Go to your backend service → "Settings"
2. Click "Generate Domain"
3. Copy the generated URL (e.g., `https://your-app.up.railway.app`)

---

## Part 3: Frontend Deployment on Vercel

### Step 1: Import Project

1. Go to https://vercel.com
2. Click "Add New" → "Project"
3. Import your `soco-website` repository
4. Vercel will auto-detect Vite configuration

### Step 2: Configure Build Settings

**Framework Preset**: Vite
**Build Command**: `cd client && pnpm install && pnpm build`
**Output Directory**: `client/dist`
**Install Command**: `pnpm install`

### Step 3: Configure Environment Variables

Add these environment variables in Vercel:

```env
# Backend API URL (from Railway)
VITE_API_URL=<your-railway-backend-url>

# App Info
VITE_APP_TITLE=SOCO - Digital Innovation Agency
VITE_APP_LOGO=/logo-white.png

# Analytics (if using built-in analytics)
VITE_ANALYTICS_ENDPOINT=<your-railway-backend-url>/api/analytics
VITE_ANALYTICS_WEBSITE_ID=soco-website
```

### Step 4: Deploy

1. Click "Deploy"
2. Wait for build to complete
3. Vercel will provide a URL (e.g., `https://soco-website.vercel.app`)

---

## Part 4: Connect Frontend to Backend

### Update CORS Settings

In your backend code (`server/_core/index.ts`), update CORS to allow your Vercel domain:

```typescript
app.use(cors({
  origin: [
    'https://soco-website.vercel.app',
    'https://soco.com.mx', // your custom domain
    'http://localhost:3000' // for local development
  ],
  credentials: true
}));
```

Redeploy backend on Railway after this change.

---

## Part 5: Custom Domain Setup (Optional)

### For Vercel (Frontend)

1. Go to your project → "Settings" → "Domains"
2. Add your domain (e.g., `soco.com.mx`)
3. Follow DNS configuration instructions
4. Add CNAME record pointing to `cname.vercel-dns.com`

### For Railway (Backend)

1. Go to your backend service → "Settings" → "Domains"
2. Add custom domain (e.g., `api.soco.com.mx`)
3. Add CNAME record pointing to your Railway domain

---

## Part 6: Post-Deployment Checklist

### ✅ Frontend Checks

- [ ] Website loads at Vercel URL
- [ ] All pages navigate correctly
- [ ] 3D visualizations render properly
- [ ] Language switcher (ES/EN) works
- [ ] Theme toggle (Dark/Light) works
- [ ] Logo displays correctly
- [ ] Mobile responsive design works

### ✅ Backend Checks

- [ ] API responds at Railway URL
- [ ] Database connection successful
- [ ] Analytics tracking works
- [ ] Contact form submissions save to database
- [ ] Analytics dashboard accessible at `/analytics`
- [ ] Password protection works for analytics

### ✅ Integration Checks

- [ ] Frontend can communicate with backend API
- [ ] Analytics data flows from frontend to backend
- [ ] No CORS errors in browser console
- [ ] All environment variables configured correctly

---

## Monitoring & Maintenance

### Railway Monitoring

1. Check logs: Railway Dashboard → Your Service → "Logs"
2. Monitor resource usage: "Metrics" tab
3. Set up alerts for downtime

### Vercel Monitoring

1. Check deployment logs: Vercel Dashboard → Your Project → "Deployments"
2. Monitor analytics: "Analytics" tab
3. Check for build errors: "Logs" in each deployment

### Database Backups

1. Railway → Database Service → "Backups"
2. Enable automatic backups
3. Set retention period (recommended: 7-30 days)

---

## Troubleshooting

### Frontend Issues

**Issue**: White screen / blank page
- Check browser console for errors
- Verify `VITE_API_URL` is set correctly
- Check Vercel build logs

**Issue**: API calls failing
- Verify backend URL is correct
- Check CORS configuration
- Ensure backend is running on Railway

### Backend Issues

**Issue**: Database connection errors
- Verify `DATABASE_URL` is correct
- Check database is running on Railway
- Run migrations: `pnpm db:push`

**Issue**: 500 errors
- Check Railway logs for error details
- Verify all environment variables are set
- Check for missing dependencies

### Analytics Issues

**Issue**: No data in analytics dashboard
- Verify analytics tracking is initialized
- Check browser console for tracking errors
- Ensure backend `/api/analytics` endpoints work

---

## Scaling Considerations

### Vercel

- Free tier: 100 GB bandwidth/month
- Upgrade to Pro for unlimited bandwidth
- Enable Edge Functions for better performance

### Railway

- Free tier: $5 credit/month
- Upgrade to Developer plan for production
- Monitor resource usage and scale as needed

### Database

- Start with Railway's smallest database instance
- Monitor query performance
- Add indexes for frequently queried fields
- Consider read replicas for high traffic

---

## Security Best Practices

1. **Environment Variables**: Never commit `.env` files
2. **API Keys**: Rotate regularly, use separate keys for prod/dev
3. **Database**: Enable SSL connections
4. **CORS**: Only allow specific domains in production
5. **Analytics Password**: Change default password immediately
6. **HTTPS**: Ensure all traffic uses HTTPS (automatic on Vercel/Railway)

---

## Support & Resources

- **Vercel Docs**: https://vercel.com/docs
- **Railway Docs**: https://docs.railway.app
- **Project Repository**: https://github.com/your-org/soco-website

---

## Quick Deploy Commands

### Local Development
```bash
# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Run database migrations
pnpm db:push
```

### Production Build Test
```bash
# Build frontend
pnpm build:client

# Build backend
pnpm build:server

# Test production build locally
pnpm start
```

---

**Deployment Date**: _To be filled_
**Deployed By**: _To be filled_
**Production URLs**:
- Frontend: https://soco.com.mx
- Backend: https://api.soco.com.mx
- Analytics: https://soco.com.mx/analytics

---

## Next Steps After Deployment

1. Test all functionality in production
2. Set up monitoring and alerts
3. Configure automatic backups
4. Add SSL certificates for custom domains
5. Set up CI/CD for automatic deployments
6. Monitor analytics and user behavior
7. Optimize performance based on real usage data

**Good luck with your deployment! 🚀**

