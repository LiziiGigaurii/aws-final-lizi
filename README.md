# Framehouse

The app has a Next.js + TypeScript frontend in `client/` and a NestJS API in `server/`. Next exports static assets to `client/out`; Nest serves those assets and the API from one origin and one port.

## Local run

Build the frontend once:

```powershell
cd client
npm install
npm run build
```

Then run the backend (it also serves the frontend):

```powershell
cd ..\server
npm install
npm run start:dev
```

Open the complete app at `http://localhost:5050`. Swagger is at `http://localhost:5050/api/docs`.

Configure MongoDB and AWS S3 in `server/.env`. The server listens on `PORT` if set, otherwise `5050`.

## Deploy on Render

Create **one Web Service** from the Git repository. Leave Root Directory empty (repository root).

- Runtime: Node
- Build Command: `cd client && npm ci && npm run build && cd ../server && npm ci && npm run build`
- Start Command: `cd server && npm run start:prod`

Set these environment variables in Render:

- `MONGO_URI`
- `JWT_SECRET`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_BUCKET_NAME`

Render sets `PORT` automatically. The UI, API, and Swagger will use the same Render service URL. No `NEXT_PUBLIC_API_URL`, CORS origin, or `render.yaml` is needed.
