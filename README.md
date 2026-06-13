# PDF Viewer

A desktop PDF viewer application with AI-powered semantic search built with Electron, React, and TypeScript.

## Features

-  PDF viewing with smooth scrolling
-  AI-powered semantic search (HuggingFace embeddings)
-  Zoom in/out support
-  A4 size rendering
-  WebGPU acceleration
-  Windows installer EXE

## Tech Stack

| Technology | Purpose |
|---|---|
| Electron | Desktop app framework |
| React + TypeScript | Frontend UI |
| react-pdf | PDF rendering |
| @huggingface/transformers | AI semantic search |
| Vite | Build tool |
| electron-builder | Windows installer |

## Prerequisites

Make sure you have these installed before starting:

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Git](https://git-scm.com/)

## Project Setup

### 1. Clone the repository

```bash
git clone https://github.com/kvertyhq/PDF-Search.git
cd PDF-Search
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run in development mode

```bash
npm run dev
```

This will start the app in development mode with hot reload.

## Build

### Run production build

```bash
npm run build
```

### Generate Windows installer EXE

```bash
npm run build:win
```

EXE file will be generated in `dist-app/` folder:

dist-app/PDF Viewer Setup 2026.0.0.exe

Double click the EXE to install the app on any Windows machine.

## Project Structure
```
PDF-Search/
├── electron/
│   ├── main.ts           # Electron main process — file dialog, app window
│   └── preload.ts        # Preload script — bridges main and renderer
├── src/
│   ├── App.tsx           # Main React component — UI and state management
│   ├── pdfHelper.ts      # PDF text extraction and chunking
│   ├── semanticSearch.ts # AI embeddings and cosine similarity search
│   └── main.tsx          # React entry point
├── public/
│   └── icon.png          # App icon (512x512)
├── package.json
└── vite.config.ts

```
## Usage

1. Open the app
2. Click the **folder icon** (top left) to open a PDF file
3. Wait for AI indexing to complete — progress shown in sidebar
4. Press **Ctrl+F** to open semantic search bar
5. Type your query and press **Enter** or click the search button
6. Click on any result in sidebar to jump to that page

## How it Works

### 1. PDF Loading

- User clicks folder icon → Electron opens native file dialog
- Selected PDF is read as binary data using Node.js `fs.readFile`
- Data is sent to renderer process as `Uint8Array` via Electron IPC
- A fresh copy of the buffer is created using `Uint8Array.from()` to prevent `ArrayBuffer detach` errors
- `react-pdf` renders the PDF page by page at A4 size (794px width)
- Zoom in/out works by multiplying the base width with a `scale` state value

### 2. AI Indexing (runs in background)

- As soon as PDF loads, indexing starts automatically
- `pdfHelper.ts` extracts text from every page using `pdfjs`
- Text is split into overlapping chunks (600 chars with 150 char overlap) for better search context
- `@huggingface/transformers` loads `all-MiniLM-L6-v2` model (384-dimension embeddings)
- If WebGPU is available → model runs on GPU (faster)
- If WebGPU unavailable → falls back to CPU WASM mode
- All chunks and their embeddings are stored in memory

### 3. Semantic Search

- User presses `Ctrl+F` → search bar opens in toolbar
- User types a query and presses Enter
- Query is converted to a 384-dimension embedding vector
- Cosine similarity is calculated between query embedding and all chunk embeddings
- Top 10 most similar chunks are returned as results
- Results are displayed in sidebar with page number and text preview
- Clicking a result smoothly scrolls to that page in the viewer

## License

MIT