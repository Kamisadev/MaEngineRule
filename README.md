# MaEngine Rules

This repository hosts the rule definitions and utility functions for **MaEngine** (ZenCleaner).
Rules are written in **ZenScript** (`.ma`), a domain-specific language optimized for web automation and content filtering.

## 📂 Repository Structure

- **/rules**
  - **/global**: Universal rules applicable across multiple domains.
  - **/sites**: Domain-specific rules (e.g., `youtube.ma`).
- **/functions**
  - **/utils.ma**: Reusable helper functions and common selectors.

## 🚀 ZenScript Syntax

### Domain Block
Apply rules to specific domains.
```ma
@domain(example.com) {
    .ads-banner -> remove()
    .modal-overlay -> click()
}
```

### Global Block
Apply rules globally.
```ma
@global {
    [id^="google_ads"] -> remove()
}
```

### Common Actions
- `-> remove()`: Remove element from DOM.
- `-> hide()`: Hide element (display: none).
- `-> click()`: Simulate click event.
- `-> speed(2.0)`: Change video playback speed.

## 🤝 Contributing
1. Create a new `.ma` file in the appropriate directory.
2. Verify syntax using the ZenScript parser.
3. Submit a Pull Request.
