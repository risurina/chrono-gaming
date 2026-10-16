# Chrono Mobile Application

The **Chrono Mobile Application** is the customer-facing interface for the Chrono platform, built with Expo and React Native. It provides a premium, "Elegant Gold" experience for users to manage their time credits, discover branches, and track their sessions.

## 📱 Features

- **Auth & Onboarding**: Secure login and registration flows.
- **Branch Discovery**: Find and view details of available branches.
- **Session Management**: Start sessions via QR codes and track active time with real-time countdowns.
- **Digital Wallet**: Manage balance, view transaction history, and top-up time credits.
- **Session History**: Detailed logs of past usage and activity.
- **Premium UI**: Consistent "Elegant Gold" theme with support for both light and dark modes.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [pnpm](https://pnpm.io/) (Workspaces enabled)
- [Expo Go](https://expo.dev/go) app on your mobile device OR Android/iOS Emulator

### Installation

1. Install dependencies from the project root:
   ```bash
   pnpm install
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   ```

### Development

Start the development server:

```bash
pnpm dev
```

- Press `a` for Android Emulator
- Press `i` for iOS Simulator
- Press `w` for Web
- Scan the QR code with Expo Go to run on a physical device

## 📁 Project Structure

- `app/`: File-based routing and screen definitions.
- `assets/`: Images, icons, and fonts.
- `components/`: 
  - `ui/`: Core design system primitives (Buttons, Cards, Inputs).
  - `layout/`: Shared layout components (Headers, Tab Bars).
  - `customer/`: Feature-specific UI components.
- `constants/`: Theme tokens, color palettes, and schemas.
- `hooks/`: Custom React hooks for business logic and data.
- `lib/`: Core services (API Client, Wallet logic, Storage, Logger).
- `.maestro/`: E2E test suites for mobile automation.

## 🧪 Testing

### Unit Tests
```bash
pnpm test
```

### E2E Testing (Maestro)
Ensure you have [Maestro](https://maestro.mobile.dev/) installed.

```bash
# Run login flow test
maestro test .maestro/login_flow.yaml
```

## 🛠 Tech Stack

- **Framework**: [Expo](https://expo.dev/) (SDK 54)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Animation**: [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/)
- **Storage**: [Expo Secure Store](https://docs.expo.dev/versions/latest/sdk/secure-store/)
- **Styling**: Native components with theme-aware tokens.

## 📄 License

Part of the Oikos Ecosystem.
