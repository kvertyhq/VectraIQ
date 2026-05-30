import { useState, useEffect, useRef, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { Search, FolderOpen, ZoomIn, ZoomOut, Loader2 } from 'lucide-react'
import { processPdfForSemanticSearch } from './pdfHelper'
import { searchDocument, setDocumentChunks, type ChunkInfo } from './semanticSearch'

// Set up worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

// For TypeScript
declare global {
  interface Window {
    electron: {
      openFile: () => Promise<string | null>
    }
  }
}

export default function App() {
  const [pdfFile, setPdfFile] = useState<string | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [scale, setScale] = useState<number>(1.2)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [indexingStatus, setIndexingStatus] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<ChunkInfo[]>([])
  const [isSearching, setIsSearching] = useState(false)
  
  const searchInputRef = useRef<HTMLInputElement>(null)

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
      const filePath = await window.electron.openFile()
      if (filePath) {
        const fileUrl = `file://${filePath}`;
        setPdfFile(fileUrl)
        setSearchResults([])
        startIndexing(fileUrl)
      }
    } else {
      alert("Electron API not found. Are you running in browser?")
    }
  }

  const startIndexing = async (fileUrl: string) => {
    try {
      setIndexingStatus('Initializing model...')
      const chunks = await processPdfForSemanticSearch(fileUrl, (msg) => {
        setIndexingStatus(msg)
      })
      setDocumentChunks(chunks)
      setIndexingStatus(null) // Done indexing
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
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const textRenderer = useCallback(
    (textItem: any) => {
      const { str } = textItem;
      if (!str.trim()) return str;

      const normalizedStr = str.replace(/\s+/g, '').toLowerCase();
      
      const isHighlighted = searchResults.some(result => {
         const normalizedResult = result.text.replace(/\s+/g, '').toLowerCase();
         // Highlight if the text string is a substring of the semantic chunk
         return normalizedStr.length > 4 && normalizedResult.includes(normalizedStr);
      });

      if (isHighlighted) {
         return <mark className="semantic-highlight">{str}</mark>;
      }
      return str;
    },
    [searchResults]
  );

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
  }

  return (
    <>
      <div className="mac-toolbar">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="mac-button" onClick={handleOpenFile} title="Open PDF">
            <FolderOpen size={18} />
          </button>
          <div style={{ width: '1px', height: '20px', background: 'var(--mac-border)', margin: '0 5px' }}></div>
          <button className="mac-button" onClick={() => setScale(s => Math.max(0.5, s - 0.1))} title="Zoom Out">
            <ZoomOut size={18} />
          </button>
          <button className="mac-button" onClick={() => setScale(s => Math.min(3, s + 0.1))} title="Zoom In">
            <ZoomIn size={18} />
          </button>
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
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  performSearch()
                }
              }}
            />
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
              <p style={{ fontSize: '11px', fontWeight: 600, padding: '10px', color: '#999', textTransform: 'uppercase' }}>Search Results</p>
              {searchResults.map((result, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    padding: '10px', 
                    borderBottom: '1px solid var(--mac-border)', 
                    cursor: 'pointer',
                    fontSize: '12px',
                    lineHeight: '1.4'
                  }}
                  onClick={() => scrollToPage(result.pageNumber)}
                  className="search-result-item"
                >
                  <div style={{ fontWeight: 600, color: 'var(--mac-accent)', marginBottom: '4px' }}>Page {result.pageNumber}</div>
                  <div style={{ color: 'var(--mac-text)', opacity: 0.8 }}>...{result.text.substring(0, 80)}...</div>
                </div>
              ))}
            </div>
          )}

          {!searchResults.length && pdfFile && !indexingStatus && (
            <p style={{ fontSize: '12px', padding: '10px', color: '#666' }}>Press Cmd+F to semantically search this document.</p>
          )}
        </div>
        
        <div className="mac-viewer">
          {pdfFile ? (
            <Document file={pdfFile} onLoadSuccess={onDocumentLoadSuccess}>
              {Array.from(new Array(numPages), (_, index) => (
                <div id={`page_${index + 1}`} key={`page_${index + 1}`} className="pdf-page">
                  <Page
                    pageNumber={index + 1}
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
    </>
  )
}
