# Framehouse

პროექტი შედგება ორი დამოუკიდებელი Node.js აპისგან: NestJS API (`server/`) და Next.js + TypeScript UI (`client/`). თითოეულს საკუთარი `package.json`, lockfile და `node_modules/` აქვს. Root-ში package ან dependencies საჭირო არ არის.

## ლოკალურად გაშვება

ორ ტერმინალში გაუშვით:

```powershell
cd server
npm install
npm run start:dev
```

```powershell
cd client
npm install
npm run dev
```

UI: `http://localhost:3000`  
API: `http://localhost:3030`  
Swagger: `http://localhost:3030/api/docs`

`server/.env` ფაილში შეავსეთ MongoDB და AWS S3-ის პარამეტრები. `client/.env.example` დააკოპირეთ `client/.env.local` ფაილად და საჭიროებისამებრ შეცვალეთ `NEXT_PUBLIC_API_URL`.

## Render Dashboard-იდან გაშვება

`render.yaml` საჭირო არ არის. Render Dashboard-ში Git repository-დან შექმენით ორი ცალკე **Web Service**.

**API service**

- Root Directory: `server`
- Runtime: Node
- Build Command: `npm ci && npm run build`
- Start Command: `npm run start:prod`
- Environment: `NODE_ENV=production`, `CLIENT_URL=https://<client-service>.onrender.com`, `MONGO_URI`, `JWT_SECRET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_BUCKET_NAME`

**Client service**

- Root Directory: `client`
- Runtime: Node
- Build Command: `npm ci && npm run build`
- Start Command: `npm run start`
- Environment: `NEXT_PUBLIC_API_URL=https://<api-service>.onrender.com`

`NEXT_PUBLIC_API_URL` build-ის დაწყებამდე დააყენეთ. თუ service URL შეიცვლება, განაახლეთ API-ის `CLIENT_URL` და client-ის `NEXT_PUBLIC_API_URL`, შემდეგ თავიდან deploy გააკეთეთ. Render `PORT` environment variable-ს თავად ადგენს.

## Build-ის შემოწმება

შედით შესაბამის `server/` ან `client/` საქაღალდეში და გაუშვით `npm run build`.
