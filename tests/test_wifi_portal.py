import unittest

from raspberry import wifi_portal


class WifiPortalTests(unittest.TestCase):
    def test_parse_wifi_scan_lines_extracts_network_metadata(self):
        scan_output = (
            "yes:HomeNet:70:WPA2:Infra:wlan0\n"
            "no:Cafe Wifi:35::Infra:wlan0\n"
            "no:\\:Hidden\\:Lab:55:WPA1 WPA2 802.1X:Infra:wlan0\n"
        )

        networks = wifi_portal.parse_wifi_scan(scan_output)

        self.assertEqual(
            networks,
            [
                {
                    "active": True,
                    "ssid": "HomeNet",
                    "signal": "70%",
                    "security": "WPA2",
                    "mode": "Infra",
                    "device": "wlan0",
                },
                {
                    "active": False,
                    "ssid": ":Hidden:Lab",
                    "signal": "55%",
                    "security": "WPA1 WPA2 802.1X",
                    "mode": "Infra",
                    "device": "wlan0",
                },
                {
                    "active": False,
                    "ssid": "Cafe Wifi",
                    "signal": "35%",
                    "security": "Open",
                    "mode": "Infra",
                    "device": "wlan0",
                },
            ],
        )

    def test_build_connect_command_for_open_network_omits_security_args(self):
        command = wifi_portal.build_connect_command(
            ssid="Guest",
            mode="open",
            password="",
            identity="",
            wifi_device="wlan0",
        )

        self.assertEqual(command, ["nmcli", "device", "wifi", "connect", "Guest", "ifname", "wlan0"])

    def test_build_connect_command_for_wpa_network_includes_password(self):
        command = wifi_portal.build_connect_command(
            ssid="Clinic",
            mode="wpa",
            password="secret123",
            identity="",
            wifi_device="wlan0",
        )

        self.assertEqual(
            command,
            [
                "nmcli",
                "device",
                "wifi",
                "connect",
                "Clinic",
                "password",
                "secret123",
                "ifname",
                "wlan0",
            ],
        )

    def test_build_connect_command_for_enterprise_network_uses_8021x_profile(self):
        command = wifi_portal.build_connect_command(
            ssid="Campus",
            mode="enterprise",
            password="peap-pass",
            identity="student",
            wifi_device="wlan0",
        )

        self.assertEqual(
            command,
            [
                "nmcli",
                "connection",
                "add",
                "type",
                "wifi",
                "ifname",
                "wlan0",
                "con-name",
                "Campus-enterprise",
                "ssid",
                "Campus",
                "802-11-wireless-security.key-mgmt",
                "wpa-eap",
                "802-1x.eap",
                "peap",
                "802-1x.phase2-auth",
                "mschapv2",
                "802-1x.identity",
                "student",
                "802-1x.password",
                "peap-pass",
            ],
        )

    def test_build_connect_command_rejects_missing_enterprise_identity(self):
        with self.assertRaisesRegex(ValueError, "Username or identity is required"):
            wifi_portal.build_connect_command(
                ssid="Campus",
                mode="enterprise",
                password="peap-pass",
                identity="",
                wifi_device="wlan0",
            )


if __name__ == "__main__":
    unittest.main()
