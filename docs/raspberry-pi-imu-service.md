# Raspberry Pi IMU Auto-Start

Use this for the left-leg Raspberry Pi MPU6050 sender. It keeps browser BLE for the right leg unchanged and posts Pi samples directly to the backend server.

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

## Install on the Pi

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

## Check service status

```bash
sudo systemctl status orthoscan-imu.service
```

## Restart the service

```bash
sudo systemctl restart orthoscan-imu.service
```

## View live logs

```bash
sudo journalctl -u orthoscan-imu.service -f
```

## Verify POST OK

```bash
sudo journalctl -u orthoscan-imu.service -n 20 --no-pager | grep "POST OK"
```

You should see lines showing the current `device_id`, interval, and successful POSTs to `/api/imu`.

## Edit configuration later

Edit `/etc/orthoscan-imu.env`, then restart:

```bash
sudo nano /etc/orthoscan-imu.env
sudo systemctl restart orthoscan-imu.service
```

## Notes

- The Pi sender is still server-first. Step 4 reads the backend `/api/imu/latest` and `/api/imu/data` endpoints.
- This does not replace `tools/ble_witmotion_sender.py`; that remains the developer fallback for WitMotion BLE.
- If `python3-smbus` is missing, install it on the Pi before starting the service.
