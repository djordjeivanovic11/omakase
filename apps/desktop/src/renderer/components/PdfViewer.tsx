import type { PdfQuad } from '@omakase/contracts';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';

GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfViewerProps {
  sourceVersionId: string;
  initialPage?: number | null;
  highlights?: PdfHighlight[];
}

export interface PdfHighlight {
  id: string;
  pageNumber: number;
  quads: PdfQuad[];
  active?: boolean;
}

export function PdfViewer({ sourceVersionId, initialPage, highlights = [] }: PdfViewerProps) {
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.15);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const viewerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadingTask = getDocument({
      url: `omakase-pdf://source-version/${sourceVersionId}`,
      isEvalSupported: false,
    });
    setLoading(true);
    setError(null);
    setDocumentProxy(null);
    setPageCount(0);

    void loadingTask.promise
      .then((loaded) => {
        if (cancelled) {
          void loaded.destroy();
          return;
        }
        setDocumentProxy(loaded);
        setPageCount(loaded.numPages);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setError(reason instanceof Error ? reason.message : 'Could not render this PDF.');
      });

    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [sourceVersionId]);

  useEffect(() => {
    if (!initialPage || !documentProxy) return;
    const page = Math.min(Math.max(initialPage, 1), pageCount);
    document.querySelector(`[data-pdf-page="${page}"]`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [documentProxy, initialPage, pageCount]);

  if (loading) return <p className="muted">Rendering the original PDF…</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!documentProxy) return null;

  return (
    <div className="pdf-viewer" ref={viewerRef}>
      <div className="pdf-viewer-toolbar" role="toolbar" aria-label="PDF controls">
        <span className="muted">
          {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </span>
        <span className="pdf-viewer-toolbar-spacer" />
        <button type="button" onClick={() => setScale((value) => Math.max(0.7, value - 0.1))}>
          −
        </button>
        <span className="muted">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => setScale((value) => Math.min(2.4, value + 0.1))}>
          +
        </button>
      </div>
      <div className="pdf-page-stack">
        {Array.from({ length: pageCount }, (_, index) => (
          <PdfPage
            key={`${sourceVersionId}-${index + 1}`}
            documentProxy={documentProxy}
            pageNumber={index + 1}
            scale={scale}
            active={initialPage === index + 1}
            highlights={highlights.filter((highlight) => highlight.pageNumber === index + 1)}
          />
        ))}
      </div>
    </div>
  );
}

function PdfPage({
  documentProxy,
  pageNumber,
  scale,
  active,
  highlights,
}: {
  documentProxy: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  active: boolean;
  highlights: PdfHighlight[];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    void documentProxy
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return;
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) throw new Error('Canvas rendering is unavailable.');

        const viewport = page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;
        const width = Math.floor(viewport.width);
        const height = Math.floor(viewport.height);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        setRenderedSize({ width, height });
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        return renderTask.promise;
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Page render failed.');
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [documentProxy, pageNumber, scale]);

  return (
    <article className={`pdf-page${active ? ' pdf-page-active' : ''}`} data-pdf-page={pageNumber}>
      <p className="pdf-page-label">Page {pageNumber}</p>
      {error ? <p className="error-text">{error}</p> : null}
      <div
        className="pdf-page-canvas-wrap"
        style={{
          width: renderedSize?.width,
          height: renderedSize?.height,
        }}
      >
        <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} />
        <div className="pdf-highlight-layer" aria-hidden="true">
          {highlights.flatMap((highlight) =>
            highlight.quads.map((quad, index) => {
              const xs = [quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x];
              const ys = [quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y];
              const left = Math.min(...xs);
              const top = Math.min(...ys);
              const right = Math.max(...xs);
              const bottom = Math.max(...ys);
              return (
                <span
                  key={`${highlight.id}-${index}`}
                  className={`pdf-evidence-highlight${highlight.active ? ' active' : ''}`}
                  style={{
                    left: `${left * 100}%`,
                    top: `${top * 100}%`,
                    width: `${(right - left) * 100}%`,
                    height: `${(bottom - top) * 100}%`,
                  }}
                />
              );
            }),
          )}
        </div>
      </div>
    </article>
  );
}
