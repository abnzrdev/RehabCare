# OrthoScan AI

Clinical knee rehabilitation workflow with a FastAPI backend, React frontend, KL grading, IMU ROM analysis, and a final rehab report wizard.

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
