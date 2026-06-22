# RehabCare

RehabCare is a clinical knee rehabilitation workflow with a FastAPI backend, React frontend, KL grading, IMU ROM analysis, and a final rehab report wizard.

## Frontend / Backend Architecture

- Vercel should host the frontend only.
- The FastAPI server remains the source of truth for IMU data and session APIs.
- Do not move IMU storage to Vercel. Raspberry Pi devices should keep sending to your own backend API.
- Set the frontend env var `VITE_API_BASE_URL=http://89.218.178.215:18190` when deploying the UI outside the backend host.

### IMU Data Flow

- Raspberry Pi sender posts JSON samples to `http://89.218.178.215:18190/api/imu`
- The frontend reads live IMU data from:
  - `http://89.218.178.215:18190/api/imu/latest`
  - `http://89.218.178.215:18190/api/imu/data?limit=100`

### Raspberry Pi Hotspot Setup

- Start hotspot mode with `sudo bash raspberry/wifi.sh --hotspot`
- Connect to hotspot `pi1`
- Open `http://10.42.0.1:8080` to enter Wi-Fi credentials

### Raspberry Pi IMU Auto-Start

- Use [`raspberry/install_imu_service.sh`](raspberry/install_imu_service.sh) to install a boot-time sender service on the Pi.
- Default config posts to `http://89.218.178.215:18190/api/imu` every `5` seconds.
- Full setup, status, restart, logs, and verification commands are in [docs/raspberry-pi-imu-service.md](docs/raspberry-pi-imu-service.md).

## Local Deploy And Preview

Run the local container deployment:

```bash
./scripts/local_deploy.sh
```

Start a temporary public frontend preview with TryCloudflare:

```bash
./scripts/start_trycloudflare.sh
```

Notes:

- `./scripts/local_deploy.sh` stops old containers, rebuilds, starts the stack in detached mode, checks `http://localhost:8000/health`, and prints the frontend URL `http://localhost:5173`.
- `./scripts/start_trycloudflare.sh` opens a temporary random public URL that forwards to the local frontend on port `5173`.
- GitHub Actions CI now runs on every push and pull request to `main` and verifies frontend build, backend compilation, and Docker image builds without deploying to production.
