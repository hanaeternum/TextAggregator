# TextAggregator - VS Code Extension

![Extension Banner](images/icon.png)

A powerful tool that collects and aggregates text content from multiple files into a single document. Perfect for code documentation, content compilation, and project analysis.

## Features

- **Multi-file collection**: Gather content from files matching specified extensions
- **Custom filtering**: 
  - File extension filters (e.g., `.js`, `.ts`, `.md`)
  - Exclusion patterns (e.g., `node_modules`, `.git`)
  - Size limits (configurable max file size)
- **Flexible output**:
  - Multiple formats: Plain text, Markdown, JSON
  - Customizable file headers
  - Configurable output path
- **Workspace awareness**:
  - Works with single or multi-root workspaces
  - Folder selection for targeted collection
- **Visual interface**:
  - Tree view showing collected files
  - Quick access to common actions

## Requirements

- VS Code version 1.75.0 or higher
- Node.js (only for development)

## Installation

1. Open VS Code
2. Go to Extensions view (`Ctrl+Shift+X`)
3. Search for "TextAggregator"
4. Click Install

Alternatively, install from VSIX:
```bash
code --install-extension text-aggregator-0.1.0.vsix
