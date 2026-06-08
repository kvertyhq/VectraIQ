import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Search, FolderOpen, ZoomIn, ZoomOut, Loader2 } from 'lucide-react'
import { processPdfForSemanticSearch } from './pdfHelper'
import { searchDocument, setDocumentChunks, type ChunkInfo } from './semanticSearch'

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface SelectedPdf {
  filePath: string
  data: Uint8Array
}

declare global {
  interface Window {
    electron: {
      openFile: () => Promise<SelectedPdf | null>
    }
  }
}

export default function App() {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [scale, setScale] = useState<number>(1.0)
  const [showSearch, setShowSearch] = useState<boolean>(false)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [indexingStatus, setIndexingStatus] = useState<string | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<ChunkInfo[]>([])
  const [isSearching, setIsSearching] = useState<boolean>(false)

  const searchInputRef = useRef<HTMLInputElement>(null)

  // A4 at 96dpi = 794px width, 1123px height
  const A4_WIDTH = 794

  const pdfDocumentFile = useMemo(() => {
    if (!pdfBytes) return null
    return { data: pdfBytes.slice(0) }
  }, [pdfBytes])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') {
        setShowSearch(false)
        setSearchQuery('')
        setSearchResults([])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleOpenFile = async () => {
    if (window.electron) {
      try {
        const selectedPdf = await window.electron.openFile()
        if (selectedPdf && selectedPdf.data) {
          const rawData = Object.values(selectedPdf.data) as number[]
          const masterBytes = Uint8Array.from(rawData)
          setNumPages(0)
          setSearchResults([])
          setPdfError(null)
          setPdfBytes(masterBytes)
          const indexingCopy = masterBytes.slice(0)
          setTimeout(() => startIndexing(indexingCopy), 400)
        }
      } catch (err) {
        console.error('File selection error:', err)
        setPdfError('File allocation error.')
      }
    } else {
      alert('Electron API not found.')
    }
  }

  const zoomOut = () => {
    setScale((curr) => Math.max(0.5, Number((curr - 0.1).toFixed(1))))
  }

  const zoomIn = () => {
    setScale((curr) => Math.min(3.0, Number((curr + 0.1).toFixed(1))))
  }

  const startIndexing = async (pdfData: Uint8Array) => {
    try {
      setIndexingStatus('Initializing model...')
      const chunks = await processPdfForSemanticSearch(pdfData, (msg) => {
        setIndexingStatus(msg)
      })
      setDocumentChunks(chunks)
      setIndexingStatus(null)
    } catch (error) {
      console.error(error)
      setIndexingStatus('Indexing failed.')
    }
  }

  const performSearch = async () => {
    if (!searchQuery.trim()) return
    setIsSearching(true)
    const results = await searchDocument(searchQuery, 10)
    setSearchResults(results)
    setIsSearching(false)
  }

  const scrollToPage = (pageNumber: number) => {
    const el = document.getElementById(`page_${pageNumber}`)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  const textRenderer = useCallback((textItem: { str: string }) => {
    return textItem.str
  }, [])

  function onDocumentLoadSuccess({ numPages: totalPages }: { numPages: number }) {
    setNumPages(totalPages)
    setPdfError(null)
  }

  return (
    <>
      <div className="mac-toolbar">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="mac-button" onClick={handleOpenFile} title="Open PDF">
            <FolderOpen size={18} />
          </button>
          <div style={{ width: '1px', height: '20px', background: 'var(--mac-border)', margin: '0 5px' }} />
          <button className="mac-button" onClick={zoomOut} title="Zoom Out">
            <ZoomOut size={18} />
          </button>
          <button className="mac-button" onClick={zoomIn} title="Zoom In">
            <ZoomIn size={18} />
          </button>
          <span className="zoom-label">{Math.round(scale * 100)}%</span>
        </div>

        {showSearch && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginRight: '20px' }}>
            <Search size={16} color="var(--mac-text)" />
            <input
              ref={searchInputRef}
              className="mac-search-input"
              type="text"
              placeholder="Semantic Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') performSearch() }}
            />
            <button className="mac-button" onClick={performSearch} title="Search">
              <Search size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="main-content">
        <div className="mac-sidebar">
          {indexingStatus && (
            <div style={{ padding: '15px', fontSize: '12px', color: '#666', borderBottom: '1px solid var(--mac-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Loader2 size={14} className="spin" />
              {indexingStatus}
            </div>
          )}

          {isSearching && (
            <div style={{ padding: '15px', fontSize: '12px', color: '#666' }}>Searching...</div>
          )}

          {searchResults.length > 0 && (
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, padding: '10px', color: '#999', textTransform: 'uppercase' }}>
                Search Results
              </p>
              {searchResults.map((result, idx) => (
                <div
                  key={idx}
                  style={{ padding: '10px', borderBottom: '1px solid var(--mac-border)', cursor: 'pointer', fontSize: '12px', lineHeight: '1.4' }}
                  onClick={() => scrollToPage(result.pageNumber)}
                  className="search-result-item"
                >
                  <div style={{ fontWeight: 600, color: 'var(--mac-accent)', marginBottom: '4px' }}>
                    Page {result.pageNumber}
                  </div>
                  <div style={{ color: 'var(--mac-text)', opacity: 0.8 }}>
                    ...{result.text.substring(0, 80)}...
                  </div>
                </div>
              ))}
            </div>
          )}

          {!searchResults.length && pdfBytes && !indexingStatus && (
            <p style={{ fontSize: '12px', padding: '10px', color: '#666' }}>
              Press Ctrl+F to semantically search this document.
            </p>
          )}
        </div>

        {/* ✅ Outer viewer — scroll container */}
        <div
          className="mac-viewer"
          style={{
            overflowY: 'auto',
            overflowX: 'auto',
            background: '#525659',
            padding: '20px',
          }}
        >
          {/* ✅ Inner wrapper — minWidth se horizontal scroll enable hoga */}
          <div style={{ minWidth: `${A4_WIDTH * scale}px`, margin: '0 auto', width: 'fit-content' }}>
            {pdfDocumentFile ? (
              <Document
                file={pdfDocumentFile}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={(error) => {
                  console.error('Document layout error detail:', error)
                  setPdfError('Error loading layout.')
                }}
                loading={<p style={{ marginTop: '100px', color: '#fff', textAlign: 'center' }}>Loading PDF...</p>}
                error={<p style={{ marginTop: '100px', color: '#ff6961', textAlign: 'center' }}>{pdfError}</p>}
              >
                {Array.from(new Array(numPages), (_, index) => (
                  <div
                    id={`page_${index + 1}`}
                    key={`page_${index + 1}`}
                    style={{
                      marginBottom: '20px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      backgroundColor: '#fff',
                      width: 'fit-content',
                    }}
                  >
                    {/* ✅ A4 fixed = 794px, scale se zoom hoga */}
                    <Page
                      pageNumber={index + 1}
                      width={A4_WIDTH}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      customTextRenderer={textRenderer}
                    />
                  </div>
                ))}
              </Document>
            ) : (
              <div style={{ marginTop: '100px', color: '#888', textAlign: 'center' }}>
                <FolderOpen size={48} style={{ margin: '0 auto', display: 'block', opacity: 0.5 }} />
                <p style={{ marginTop: '20px', fontSize: '14px' }}>No document opened.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}