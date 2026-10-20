# Deploying the CWS Kiosk Prototype to Vercel

The prototype is a single page (`index.html`) plus one small server function (`api/comments.js`) that stores comments in an Upstash Redis database. The presenter panel needs nothing extra. Comments need the database.

## What's in this folder

| File | What it does |
|---|---|
| `index.html` | The prototype, with the presenter panel and comments |
| `api/comments.js` | Saves and returns comments for everyone who opens the link |
| `package.json` | Tells Vercel to install the Redis client |
| `.gitignore` | Keeps local files out of Git |

## Option A: Vercel website (no command line)

1. Put this `prototype` folder in a GitHub repository (the folder itself is the project root).
2. Go to vercel.com → **Add New… → Project** → import that repository.
   - Framework preset: **Other**. Leave the build and output settings empty.
   - Click **Deploy**. The prototype works now, with comments still stored per browser.
3. Add the comments database: in the project, open **Storage → Create Database → Upstash for Redis** (from the Marketplace), choose the free plan, and **connect it to this project**. Vercel adds the database keys to the project's environment variables automatically.
4. Open **Deployments**, click **⋯** on the latest one and choose **Redeploy**, so the function picks up the new keys.

## Option B: command line

From this `prototype` folder:

```bash
npx vercel
```

Answer the prompts (new project, keep the defaults). Then add **Upstash for Redis** under the project's **Storage** tab on vercel.com as in step 3 above, and deploy to production:

```bash
npx vercel --prod
```

## Check that comments are shared

1. Open the production URL, click **Comments** (top left) → **Add a comment**, click a spot on the screen and post.
2. Open the same URL in another browser or a private window. The comment shows up within a few seconds.
3. `https://<your-project>.vercel.app/api/comments` returns the comments as JSON.

If the panel at the bottom of the Comments drawer still says "Download copy with comments", the page couldn't reach the database: check that Upstash is connected to the project, then redeploy.

## Good to know

- **Who can comment:** anyone with the link can view the prototype and add, resolve or delete comments. To limit access, turn on **Settings → Deployment Protection** (password protection is a Vercel Pro feature; Vercel Authentication works for your team).
- **Names:** commenters type their own name in the Comments drawer; nothing checks it.
- **Updating:** push changes to GitHub (Option A) or run `npx vercel --prod` again (Option B). Comments stay in the database between deployments.
- **Offline use:** opening `index.html` directly from disk still works, with comments saved in that browser and the download/import buttons for sharing them.
