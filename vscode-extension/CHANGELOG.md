# Changelog

All notable changes to the Context Engine extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2024-12-24

### Fixed

#### CodeLens Action Execution
- **Request Timeouts**: Added proper timeouts to HTTP requests (30s for search, 120s for AI operations) to prevent indefinite hangs
- **Cancellation Support**: CodeLens actions now show cancellable progress dialogs - users can click cancel to abort long-running operations
- **Error Messages**: CodeLens actions now display clear error messages instead of silently failing
- **Progress Feedback**: Added descriptive progress messages during CodeLens operations ("Querying codebase...", "Analyzing codebase...")

#### HTTP Client Improvements
- Added `AbortController` support for request cancellation
- Better error messages for network failures and timeouts
- Automatic timeout detection with user-friendly error messages

### Added

#### Testing
- Added comprehensive unit tests for HTTP client timeout and cancellation functionality
- Added tests for AbortSignal edge cases
- Added tests for connection state change events

---

## [0.1.0] - 2024-12-24

### Added

#### Core Features
- **Semantic Search**: Search codebase using natural language queries
- **Prompt Enhancement**: Transform simple prompts into detailed, context-aware instructions
- **Index Management**: Index and reindex workspace for optimal search performance

#### User Interface
- **Activity Bar**: New sidebar with Context Engine icon
- **Status View**: Real-time connection and index status display
- **Search Results View**: Clickable results with file icons and preview tooltips
- **Recent Searches View**: Quick access to previous search queries
- **Status Bar**: Connection indicator with click-to-action
- **Output Channel**: Detailed logging for debugging and monitoring

#### CodeLens Integration
- Inline "Find Related Code" action on function/class definitions
- Inline "Get Context" action for AI-enhanced explanations
- Support for 11 languages: TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, C#, Dart

#### Server Management
- Auto-connect on extension startup (configurable)
- Health monitoring with automatic reconnection
- Server auto-start capability
- Start/Stop server commands

#### Commands
- `Context Engine: Connect to Server`
- `Context Engine: Disconnect from Server`
- `Context Engine: Show Index Status`
- `Context Engine: Index Workspace`
- `Context Engine: Semantic Search`
- `Context Engine: Enhance Prompt`
- `Context Engine: Start Server`
- `Context Engine: Stop Server`
- `Context Engine: Show Output`
- `Context Engine: Refresh Status`
- `Context Engine: Clear Search Results`

#### Configuration
- `contextEngine.serverUrl` - Server URL configuration
- `contextEngine.autoConnect` - Auto-connect on startup
- `contextEngine.showStatusBar` - Status bar visibility
- `contextEngine.maxSearchResults` - Maximum search results
- `contextEngine.maxRecentSearches` - Recent searches limit
- `contextEngine.enableCodeLens` - CodeLens toggle
- `contextEngine.enableHealthMonitoring` - Health monitoring toggle
- `contextEngine.healthCheckInterval` - Health check interval
- `contextEngine.serverPath` - Server script path
- `contextEngine.autoStartServer` - Auto-start server
