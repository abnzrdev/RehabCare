# Deployment

## Vercel Frontend + External Backend

Vercel should host the frontend only. The external FastAPI server remains the source of truth for IMU data, patient sessions, and analysis endpoints.

Set this frontend environment variable in Vercel:

```bash
VITE_API_BASE_URL=http://89.218.178.215:18190
```

This keeps the browser pointed at your own server API for:

- `POST /api/imu`
- `GET /api/imu/latest`
- `GET /api/imu/data?limit=100`

For Raspberry Pi left-leg sensors, install the boot-time sender described in [raspberry-pi-imu-service.md](raspberry-pi-imu-service.md). It keeps the server as the source of truth and sends Pi data directly to `/api/imu` every 5 seconds by default.

Do not create a Vercel database for IMU data, and do not move IMU storage off the backend server.

## Docker Compose

Run the app with:

```bash
docker compose up --build
```

Services:

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

The backend stores patient sessions in a SQLite database at `/data/rehab.db` inside the container. The compose file mounts a persistent `rehab_data` volume there, so patient history survives restarts and refreshes.

The frontend nginx container proxies `/api/*` to the backend service, so the app can keep using a same-origin `/api` base path.

## Model Files

Model weights are not copied into the image.

- Mount local models at `./rehab_platform/models:/app/rehab_platform/models:ro`
- Leave the mount empty if you want demo mode

The main KL endpoint uses `rehab_platform/models/knee_oa/kl_grade_model.pt` when it is present.
The legacy `/predict` endpoint can still fall back to the older binary checkpoint if that file exists.

## Cloudflare Tunnel

For `cloudflared` or `try.cloudflare.com`, point the tunnel at the frontend container, not the backend.

Example:

```bash
cloudflared tunnel --url http://localhost:5173
```

The browser should reach the frontend origin, and the frontend nginx proxy will forward `/api` requests to the backend service.

If you expose frontend and backend on different domains, set `VITE_API_BASE_URL` so the frontend sends API calls to the correct backend origin.

## Database Path

Set `REHAB_DB_PATH` if you want the SQLite file somewhere else. The default remains `rehab_platform/data/rehab.db`.
