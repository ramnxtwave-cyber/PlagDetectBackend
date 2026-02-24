# Switch from Railway PostgreSQL to Supabase

## Why Supabase?

- ✅ **pgvector is built-in** (no setup needed)
- ✅ **Free tier** is generous (500MB database, 2GB bandwidth)
- ✅ **Easy to use** with web-based SQL editor
- ✅ **Better for vector workloads** than Railway PostgreSQL

## Step-by-Step Migration

### Step 1: Create Supabase Account

1. Go to https://supabase.com
2. Click "Start your project"
3. Sign up with GitHub or email

### Step 2: Create New Project

1. Click "New Project"
2. Choose a name (e.g., "plagiarism-detector")
3. Enter a strong **Database Password** (SAVE THIS!)
4. Select a region (closest to your users)
5. Click "Create new project"
6. Wait 2-3 minutes for setup

### Step 3: Get Connection String

1. In your Supabase project, click **"Database"** in the left sidebar
2. Click **"Connection String"** → **"URI"**
3. Copy the connection string - it looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
4. Replace `[YOUR-PASSWORD]` with the password you set in Step 2

### Step 4: Enable pgvector (Already Done!)

Supabase has pgvector pre-installed. You can verify by running this in the SQL Editor:

```sql
SELECT * FROM pg_extension WHERE extname = 'vector';
```

### Step 5: Run Your Schema

1. In Supabase, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Copy and paste the contents of `schema.sql`
4. Click **"Run"** (or press Ctrl+Enter)
5. You should see success messages!

### Step 6: Update Railway Environment Variable

1. Go to your **Railway dashboard**
2. Click on your **backend service** (Node.js app)
3. Go to **"Variables"** tab
4. Find `DATABASE_PUBLIC_URL` or `DATABASE_URL`
5. **Update it** to your Supabase connection string:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```
6. Railway will automatically redeploy

### Step 7: Remove Railway PostgreSQL (Optional)

Since you're not using it anymore:

1. Go to Railway dashboard
2. Click on the **Postgres** service
3. Go to **"Settings"** → **"Danger"** → **"Delete Service"**

This saves you from hitting Railway's free tier limits.

---

## ✅ Verify It Works

After Railway redeploys with the new connection string:

1. Check your backend logs in Railway
2. You should see:
   ```
   [DB] ✅ Database connection successful
   [DB] ✅ pgvector extension is installed
   ```

3. Test the API:
   ```bash
   curl https://your-backend.railway.app/api/health
   ```

---

## Connection String Format

Supabase URL format:
```
postgresql://postgres:PASSWORD@db.PROJECT-ID.supabase.co:5432/postgres
```

Make sure to:
- Replace `PASSWORD` with your actual password
- Include the full string with `5432/postgres` at the end
- Use SSL (Supabase requires it, but our code already handles this)

---

## Troubleshooting

### "password authentication failed"
- Double-check you replaced `[YOUR-PASSWORD]` with your actual password
- Password is case-sensitive

### "could not translate host name"
- Make sure you copied the full connection string
- Verify the URL starts with `postgresql://`

### "pgvector extension not found"
- Supabase has it by default, but you can manually enable:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

---

## Cost Comparison

| Provider | Free Tier | pgvector Support |
|----------|-----------|------------------|
| **Supabase** | 500MB DB, 2GB bandwidth | ✅ Built-in |
| Railway | $5 minimum/month | ❌ Not available |
| Neon | 512MB DB | ✅ Supported |

**Recommendation:** Use Supabase for development and small-scale production.

---

## Next Steps After Migration

1. ✅ Switch to Supabase (5 minutes)
2. ✅ Run `schema.sql` in Supabase SQL Editor
3. ✅ Update `DATABASE_PUBLIC_URL` in Railway
4. ✅ Wait for Railway to redeploy
5. ✅ Test your API endpoints
6. 🎉 Your plagiarism detector is now fully functional!


