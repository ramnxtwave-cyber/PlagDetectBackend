# Railway Deployment Guide

## Problem: Database Connection Refused

If you're seeing `ECONNREFUSED ::1:5432` or `127.0.0.1:5432` errors, it means your app is trying to connect to localhost instead of Railway's PostgreSQL database.

## Solution: Step-by-Step

### Step 1: Add PostgreSQL Database to Railway

1. Go to your Railway project dashboard: https://railway.app/dashboard
2. Select your project
3. Click **"+ New"** button
4. Select **"Database"** → **"Add PostgreSQL"**
5. Railway will automatically:
   - Create a PostgreSQL database
   - Add a `DATABASE_URL` environment variable to your project
   - Link it to your backend service

### Step 2: Verify DATABASE_URL Exists

1. In Railway, click on your **backend service** (not the database)
2. Go to the **"Variables"** tab
3. Look for `DATABASE_URL` - it should look like:
   ```
   postgresql://postgres:password@containers-us-west-xxx.railway.app:7432/railway
   ```
4. If you DON'T see `DATABASE_URL`:
   - Make sure the database and backend service are in the same project
   - Railway should auto-link them
   - You may need to manually add it by clicking "+ New Variable" and selecting the PostgreSQL database reference

### Step 3: Deploy Updated Code

**Commit and push the fixed `db.js` file:**

```bash
git add db.js RAILWAY-SETUP.md
git commit -m "Fix database connection for Railway deployment"
git push origin main
```

Railway will automatically detect the push and redeploy.

### Step 4: Initialize Database Schema

You need to run the `schema.sql` to create tables. You have two options:

#### Option A: Use Railway CLI (Recommended)

1. Install Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```

2. Login to Railway:
   ```bash
   railway login
   ```

3. Link to your project:
   ```bash
   railway link
   ```

4. Run the schema:
   ```bash
   railway run psql $DATABASE_URL -f schema.sql
   ```

#### Option B: Use Railway Dashboard (PostgreSQL Query)

1. In Railway dashboard, click on your **PostgreSQL database**
2. Go to **"Query"** tab
3. Copy the contents of `schema.sql`
4. Paste and execute in the query window

OR use the **"Connect"** tab to get connection details and connect using a local PostgreSQL client.

### Step 5: Verify Deployment

1. In Railway, go to your **backend service**
2. Click on **"Deployments"** tab
3. Click on the latest deployment
4. Check the **"Logs"** - you should see:
   ```
   [DB] Using DATABASE_URL connection string
   [DB] DATABASE_URL exists: true
   [DB] ✅ Database connection successful
   [DB] Server time: ...
   [DB] ✅ pgvector extension is installed
   ```

### Step 6: Test Your API

Once deployed, test the health endpoint:

```bash
curl https://your-app.railway.app/api/health
```

You should get:
```json
{
  "status": "ok",
  "service": "semantic-plagiarism-detector",
  ...
}
```

## Environment Variables Needed on Railway

Make sure these are set in Railway (Variables tab):

- ✅ `DATABASE_URL` - Automatically added by Railway when you add PostgreSQL
- ✅ `OPENAI_API_KEY` - Your OpenAI API key (add manually)
- ✅ `PORT` - Railway sets this automatically
- ⚠️  `EXTERNAL_PLAGIARISM_API_URL` - (Optional) If using external plagiarism API

## Common Issues

### Issue 1: "DATABASE_URL exists: false" in logs

**Solution:** 
- Make sure PostgreSQL database is in the same project
- Check Variables tab - manually add DATABASE_URL reference if needed

### Issue 2: "pgvector extension NOT found"

**Solution:**
Connect to Railway PostgreSQL and run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Issue 3: "relation 'submissions' does not exist"

**Solution:**
You need to run `schema.sql` to create the tables (see Step 4 above)

## Architecture on Railway

```
┌─────────────────────────┐
│   Backend Service       │
│   (Node.js/Express)     │
│   - Uses DATABASE_URL   │
│   - Auto-deployed       │
└───────────┬─────────────┘
            │
            │ DATABASE_URL (auto-linked)
            ↓
┌─────────────────────────┐
│   PostgreSQL Database   │
│   - pgvector enabled    │
│   - Managed by Railway  │
└─────────────────────────┘
```

## Need Help?

Check Railway logs for detailed error messages:
1. Go to your backend service
2. Click "Deployments"
3. Select latest deployment
4. View "Logs" tab

Look for `[DB]` prefixed messages to see connection details.

