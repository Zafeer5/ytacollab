# YTA - colabapp

**YTA - colabapp** is a collaborative content pipeline application built for YouTube production teams. It manages channels, videos, role-based submissions (Scripts, Voiceovers, Thumbnails, and SEO/Meta Info), and automated workflow tracking from a single live database.

Unified multi-platform backend powered by **Supabase** for both the Web application (Vercel) and the Android application.

---

## Key Features

- **Role-Based Access Control (RBAC)**:
  - **Admin Dashboard**: YouTube channel creation, line-by-line title batching, custom role and task definitions, prompt guidelines editor, team member management, and complete ledger inspection.
  - **Master Production Table**: Real-time status overview of every video, copyable scripts & titles, downloadable voiceover audio & thumbnail files, completion checkboxes, and one-click notification alerts.
  - **Team Member Interface**: Contextual task workspace scoped strictly to assigned roles (Script, Voiceover, Thumbnail, Meta Info, custom), with compact scrollable prompts, on-page submission status, and atomic overwrite protection.
- **Real-Time Supabase Database**:
  - Live synchronization across sessions using Supabase Realtime WebSocket publications (`supabase_realtime`).
  - Storage bucket integration for media assets (`thumbnails` and `voiceovers`).
  - Append-only immutable shared audit ledger.
  - Strict Row Level Security (RLS) policies on all tables.

---

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 Modules), HTML5, CSS3 Custom Properties Design System.
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Backend**: [Supabase](https://supabase.com/) (PostgreSQL, Supabase Auth, Supabase Storage, Supabase Realtime).

---

## Database Architecture

All database tables, RLS policies, storage bucket configurations, and realtime publications are located in [`supabase/schema.sql`](supabase/schema.sql):

1. `profiles`: Extends `auth.users` with usernames and admin privileges.
2. `channels`: YouTube channel production spaces.
3. `videos`: Sequential videos linked to channels.
4. `roles`: Standard and custom pipeline roles.
5. `role_prompts`: Reference prompts and AI guidelines provided by admin for each role.
6. `member_roles`: Many-to-many role assignments for team members.
7. `submissions`: Content submissions and file storage references with atomic overwrite per `(video_id, role_id)`.
8. `ledger`: Append-only immutable chronological audit log.
9. `notifications`: Real-time pending task alerts for team members.

---

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/Zafeer5/ytacollab.git
cd ytacollab
npm install
```

### 2. Environment Variables

Create or configure `.env` (refer to `.env.example`):

```env
VITE_SUPABASE_URL=https://tandgmuuixassiflkcgb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Database Initialization

Execute the SQL script [`supabase/schema.sql`](supabase/schema.sql) in your **Supabase Dashboard → SQL Editor**.

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Build for Production

```bash
npm run build
```

The output bundle will be generated in `dist/`.

---

## Deployment

### Vercel (Web Application)
1. Import this repository into Vercel.
2. In Project Settings → **Environment Variables**, set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy!

### Android Application
Connect your Android/Kotlin/Flutter client to the identical Supabase Project URL and Anon Key. All database tables, storage buckets, and realtime channels are unified and shared directly.
