# Raspberry Pi IMU Modes

The Raspberry Pi MPU6050 path now has two modes:

1. Stable recommended mode:
   `Pi IMU -> Pi daemon/service -> POST /api/imu -> server -> Step 4`
2. Experimental browser BLE mode:
   `Pi IMU -> Pi BLE peripheral -> Chrome Web Bluetooth -> browser POST /api/imu -> server -> Step 4`

Use the stable daemon mode for normal demos. The browser BLE mode is optional and experimental.

## Default target

- API: `http://89.218.178.215:18190/api/imu`
- Send interval: `5` seconds

## Config variables

- `ORTHO_DEVICE_ID`
- `ORTHO_LEG`
- `ORTHO_BODY_PART`
- `ORTHO_API_URL`
- `ORTHO_SEND_INTERVAL_SECONDS`

Default mappings:

- `pi1` = `left` / `hip`
- `pi2` = `left` / `thigh/knee`
- `pi3` = `left` / `shin/ankle`

## Stable recommended mode: Pi daemon -> POST /api/imu

This keeps the server as the source of truth. It is the recommended setup.

### Install on the Pi

From the repo on the Raspberry Pi:

```bash
chmod +x raspberry/install_imu_service.sh
sudo ORTHO_DEVICE_ID=pi1 ORTHO_LEG=left ORTHO_BODY_PART=hip ./raspberry/install_imu_service.sh
```

Examples for the other sensors:

```bash
sudo ORTHO_DEVICE_ID=pi2 ORTHO_LEG=left ORTHO_BODY_PART=thigh/knee ./raspberry/install_imu_service.sh
sudo ORTHO_DEVICE_ID=pi3 ORTHO_LEG=left ORTHO_BODY_PART=shin/ankle ./raspberry/install_imu_service.sh
```

The installer:

- copies `raspberry/orthosend.py` to `/opt/orthoscan-imu/orthosend.py`
- writes `/etc/orthoscan-imu.env`
- installs and enables `orthoscan-imu.service`
- starts the service immediately

### Check service status

```bash
sudo systemctl status orthoscan-imu.service
```

### Restart the service

```bash
sudo systemctl restart orthoscan-imu.service
```

### View live logs

```bash
sudo journalctl -u orthoscan-imu.service -f
```

### Verify POST OK

```bash
sudo journalctl -u orthoscan-imu.service -n 20 --no-pager | grep "POST OK"
```

You should see lines showing the current `device_id`, interval, and successful POSTs to `/api/imu`.

### Edit configuration later

Edit `/etc/orthoscan-imu.env`, then restart:

```bash
sudo nano /etc/orthoscan-imu.env
sudo systemctl restart orthoscan-imu.service
```

## Experimental browser BLE mode: Pi BLE peripheral -> Chrome -> POST /api/imu

This mode is optional. It exists for experiments where Chrome reads the Pi directly over Web Bluetooth, then the browser posts the same normalized row format to the server.

### Install the experimental Pi BLE service

```bash
chmod +x raspberry/install_pi_ble_service.sh
sudo ORTHO_DEVICE_ID=pi1 ORTHO_LEG=left ORTHO_BODY_PART=hip ORTHO_BLE_NAME=ORTHO_PI1 ./raspberry/install_pi_ble_service.sh
sudo ORTHO_DEVICE_ID=pi2 ORTHO_LEG=left ORTHO_BODY_PART=thigh/knee ORTHO_BLE_NAME=ORTHO_PI2 ./raspberry/install_pi_ble_service.sh
sudo ORTHO_DEVICE_ID=pi3 ORTHO_LEG=left ORTHO_BODY_PART=shin/ankle ORTHO_BLE_NAME=ORTHO_PI3 ./raspberry/install_pi_ble_service.sh
```

The installer:

- copies `raspberry/pi_ble_peripheral.py` to `/opt/orthoscan-pi-ble/pi_ble_peripheral.py`
- writes `/etc/orthoscan-pi-ble.env`
- installs and enables `orthoscan-pi-ble.service`
- starts the service immediately

### Experimental BLE service status

```bash
sudo systemctl status orthoscan-pi-ble.service
```

### Experimental BLE logs

```bash
sudo journalctl -u orthoscan-pi-ble.service -f
```

### Browser connection flow

In Step 4 real-time mode:

1. Keep the stable Pi status cards visible as usual.
2. Use the `Experimental: connect Raspberry Pi via browser Bluetooth` section.
3. Connect `ORTHO_PI1`, then `ORTHO_PI2`, then `ORTHO_PI3`.
4. The browser posts normalized Pi rows back to `/api/imu`.

## Important mode rule

Do not run both modes at the same time unless you explicitly need that for debugging. The stable service and the experimental BLE peripheral should not read the same MPU6050 by default.

## Status commands

```bash
sudo systemctl status orthoscan-imu.service
sudo systemctl status orthoscan-pi-ble.service
```

## Log commands

```bash
sudo journalctl -u orthoscan-imu.service -f
sudo journalctl -u orthoscan-pi-ble.service -f
```

## Notes

- The stable Pi sender is still server-first. Step 4 reads the backend `/api/imu/latest` and `/api/imu/data` endpoints.
- The experimental BLE mode uses browser Bluetooth only for the Pi path. WitMotion browser BLE stays separate.
- This does not replace `tools/ble_witmotion_sender.py`; that remains the developer fallback for WitMotion BLE.
- If `python3-smbus` is missing, install it on the Pi before starting either service.
- The experimental BLE characteristic sends newline-delimited JSON notifications. Some Bluetooth adapters may be sensitive to MTU size and notification timing.
