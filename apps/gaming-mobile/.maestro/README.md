# Maestro Testing for Chrono Mobile

This project uses [Maestro](https://maestro.mobile.dev/) for end-to-end testing.

## Prerequisites

1. Install Maestro CLI:
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```
2. Have an iOS Simulator or Android Emulator running.
3. Build your app (Development Build) and install it on the device.
   - For Expo: `npx expo run:ios` or `npx expo run:android`

## Running Tests

To run the login flow test:
```bash
maestro test .maestro/login_flow.yaml
```

To run the session persistence test:
```bash
maestro test .maestro/session_persistence.yaml
```

## Flow Definitions

- `login_flow.yaml`: Tests the basic email/password login process.
- `session_persistence.yaml`: Tests that the user remains logged in after the app is restarted.
