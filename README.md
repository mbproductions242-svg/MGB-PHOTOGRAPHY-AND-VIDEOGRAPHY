# Client Photo Gallery

A private photo gallery web app for a photography business. You (the studio) get an admin
dashboard to create clients, build password-protected galleries, and upload photos. Your
clients get a private, mobile-friendly proofing gallery where they can view their photos,
favorite/select their picks, leave notes on individual photos, approve their final
selections, and download images.

It's a single responsive website — it works on phones, tablets, and desktops, so there's no
separate "mobile app" to install or maintain.

## Features

**Studio admin**
- Login-protected dashboard
- Add clients, create a gallery per shoot
- Drag-and-drop photo upload (auto-generates thumbnails + watermarked previews)
- Per-gallery settings: password, expiration date, watermark on/off, downloads on/off,
  selection limit, draft/published status
- See client favorites and comments
- Download all client-selected photos as a zip
- Delete photos or whole galleries

**Client gallery**
- Private link, optional password
- Responsive photo grid + full-screen lightbox viewer
- Favorite/select photos (with an optional cap, e.g. "pick your best 20")
- Leave a note/comment on any photo
- Approve final selections with one tap
- Download individual photos, just their favorites, or the whole gallery (if you've
  enabled downloads)
- Automatically shows "expired" or "not found" pages when appropriate

## Requirements

- Node.js 18 or newer
- No external database needed — it uses a local SQLite file (created automatically)

## Setup

```bash
cd photo-gallery-app
npm install
```

## Running locally

```bash
npm start
```

The app runs at **http://localhost:3000**.

On first run, a default admin account is created automatically and printed to the
console, e.g.:

```
Email:    admin@example.com
Password: changeme123
```

Log in at `/admin/login` and you're ready to add your first client and gallery.

### Setting your own admin login

Instead of using the auto-generated default, set these environment variables before the
very first run:

```bash
ADMIN_EMAIL="you@yourstudio.com" ADMIN_PASSWORD="a-strong-password" npm start
```

(This only matters the first time — once the admin account exists in the database,
changing these variables won't do anything. There's no in-app "change password" screen
yet, so to change credentials later, stop the server, delete `data/gallery.db`, and
restart with new env vars — note this also wipes all clients/galleries, so back up first
if you have real data.)

### Other environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `SESSION_SECRET` | (insecure default) | Secret used to sign session cookies — **set a real random value in production** |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | see above | Only used to seed the first admin account |

## How galleries work

1. Log in to `/admin`.
2. Add a client (name + optional email).
3. Create a gallery for that client — give it a title, optional shoot date, optional
   expiration date, optional password, and choose your watermark/download/selection-limit
   settings.
4. The gallery starts as a **draft** — clients can't see it yet. Upload your photos.
5. When ready, open the gallery's settings and change status to **Published**.
6. Copy the gallery link from the gallery page and send it (plus the password, if you set
   one) to your client.
7. Your client opens the link, enters the password if needed, and can browse, favorite,
   comment, and approve their photos.
8. Once they've picked favorites, use **Download Selects** on the gallery page to grab a
   zip of just their chosen photos for editing/delivery.

### About watermarking

When "Watermark preview images" is on, the gallery grid and lightbox view show a
lower-resolution preview with a tiled watermark overlay — good for proofing without
risking someone saving a usable copy. Turning on "Allow full-resolution downloads"
separately gives clients clean, unwatermarked, full-resolution files when they use the
Download buttons — typically something you'd enable once a deposit/payment has been made.
These two settings are independent, so you're always in control of what's protected and
what's downloadable.

## Deploying to Render

Running on `localhost` only works on your own machine. To share real gallery links with
clients, deploy to Render so the app has a public URL.

**Important — persistent disk:** photos live in an `uploads/` folder and the database is
a local SQLite file. Render's **free** web service plan has no persistent disk, so
uploaded photos and galleries would be wiped every time the service restarts or
redeploys. You need a **paid instance plan (Starter or higher, currently ~$7/mo)** with a
disk attached — the `render.yaml` included in this project sets that up for you
automatically. Skipping the disk is fine only for testing, never for real client photos.

### Option A — one-click Blueprint deploy (recommended)

This project includes a `render.yaml` file that tells Render exactly how to set
everything up — web service, persistent disk, and environment variables — in one step.

1. Push this project to a GitHub (or GitLab) repository. If you're not sure how:
   ```bash
   cd photo-gallery-app
   git init
   git add .
   git commit -m "Initial commit"
   ```
   then create an empty repo on GitHub and follow its "push an existing repository"
   instructions.
2. In the Render dashboard, click **New +** → **Blueprint**.
3. Connect the repository you just pushed. Render will detect `render.yaml`
   automatically and show you the resources it's about to create (a web service named
   `photo-gallery-app` plus a 5GB disk).
4. Before deploying, Render will prompt you for the environment variables marked
   `sync: false` in the blueprint — enter your real studio email as `ADMIN_EMAIL` and a
   strong password as `ADMIN_PASSWORD`. `SESSION_SECRET` is generated for you
   automatically.
5. Click **Apply** / **Deploy**. Render will build and start the app — this takes a
   couple of minutes the first time (installing `sharp` in particular takes a moment).
6. Once it's live, Render gives you a URL like `https://photo-gallery-app-xxxx.onrender.com`.
   Open `/admin/login` there and log in with the email/password you set.

### Option B — manual setup (no Blueprint)

If you'd rather click through the UI yourself instead of using the Blueprint:

1. Push the project to GitHub as in step 1 above (or use Render's "deploy without Git"
   option if offered, uploading the project as a zip/tarball).
2. In Render: **New +** → **Web Service**, connect the repo.
3. Runtime: **Node**. Build command: `npm install`. Start command: `npm start`.
4. Choose the **Starter** plan or higher (needed for the disk in the next step).
5. Under **Disks**, add a disk — name it anything (e.g. `gallery-storage`), mount path
   `/var/data`, size 5GB is plenty to start.
6. Under **Environment**, add:
   - `STORAGE_ROOT` = `/var/data` (must match the disk's mount path exactly)
   - `SESSION_SECRET` = a long random string (Render can generate one for you)
   - `ADMIN_EMAIL` = your real studio login email
   - `ADMIN_PASSWORD` = a strong password
7. Click **Create Web Service**. Render builds and deploys automatically.

### After it's live

- Log in at `https://<your-render-url>/admin/login` with the `ADMIN_EMAIL` /
  `ADMIN_PASSWORD` you set — that's your real studio login going forward.
- Every future `git push` to the connected branch triggers an automatic redeploy; your
  photos and galleries persist across deploys because they live on the attached disk, not
  in the deployed code.
- Render's free-tier equivalent (if you downgrade later) does **not** keep a disk, so
  don't drop below the Starter plan once you have real client galleries on it.
- If you outgrow local-disk storage (very large photo volumes) or want faster global
  delivery, moving image storage to S3-compatible object storage is a reasonable next
  step — ask any time and it can be wired in.

Always keep `SESSION_SECRET` and your admin password private — don't commit real
credentials into the GitHub repo.

## Project structure

```
photo-gallery-app/
  server.js            # app entry point
  db/db.js              # SQLite schema + connection
  routes/admin.js        # studio admin routes
  routes/client.js       # client-facing gallery routes
  utils/images.js        # thumbnail + watermark generation (sharp)
  utils/auth.js          # login guards
  views/                # EJS templates (admin/* and client/*)
  public/css/style.css   # all styling
  public/js/admin.js     # admin dashboard interactions
  public/js/client.js    # client gallery interactions (favorite, lightbox, comments)
  uploads/               # uploaded photos land here (full/thumbs/watermarked per gallery)
  data/                  # gallery.db (SQLite) — created on first run
```

## Notes & limitations (things to know before relying on this for real clients)

- There's currently one shared password per gallery (not individual client accounts), which
  matches how most photography proofing tools work, but means anyone with the link + password
  can access it.
- There's no email notification system yet — you'll need to manually send clients their
  gallery link (e.g. via your usual email).
- Comments are simple notes tied to a photo; there's no admin reply-in-app yet (you'd
  reply to your client directly).
- No built-in payment/e-commerce — if you want to gate downloads behind a payment, do that
  through your existing invoicing/payment tool and just flip "Allow downloads" on once paid.

This is a solid, working foundation — happy to extend it (email notifications, print
ordering, multi-photographer accounts, S3 storage, etc.) whenever you're ready for the
next round.
