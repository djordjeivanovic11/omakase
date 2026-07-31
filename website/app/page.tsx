const GITHUB = 'https://github.com/djordjeivanovic11/omakase';
const DOWNLOAD = `${GITHUB}/releases/latest`;

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2v8m0 0L5 7.5M8 10l3-2.5M3 12.5h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className="page">
      <div className="glow" aria-hidden="true" />

      <div className="layout">
        <section className="hero">
          <div className="badges">
            <span>MIT License</span>
            <span>Local-first</span>
            <span>Open Source</span>
          </div>

          <h1>Omakase</h1>
          <p className="headline">Learn AI properly.</p>
          <p className="lede">
            A personal learning studio for papers, articles, and notes. It teaches from your
            sources, probes what you understand, and gives you the next step — all on your machine.
          </p>

          <div className="actions">
            <a className="btn primary" href={DOWNLOAD}>
              <DownloadIcon />
              Download
            </a>
            <a className="btn secondary" href={GITHUB}>
              <GitHubIcon />
              Star on GitHub
            </a>
          </div>

          <p className="privacy">
            <LockIcon />
            100% local. Your data never leaves your machine.
          </p>
        </section>

        <aside className="terminal">
          <div className="chrome">
            <div className="dots">
              <span />
              <span />
              <span />
            </div>
            <em>get started</em>
          </div>

          <ol className="steps">
            <li>
              <code>1</code>
              <span>
                Download the latest <a href={DOWNLOAD}>release</a>
              </span>
            </li>
            <li>
              <code>2</code>
              <span>Install — drag to Applications on Mac</span>
            </li>
            <li>
              <code>3</code>
              <span>Open and connect your API key</span>
            </li>
            <li>
              <code>4</code>
              <span>Create a Studio — add a source → learn</span>
            </li>
          </ol>

          <pre>
            <span className="prompt">$</span> git clone {GITHUB.replace('https://', '')}.git
            {'\n'}
            <span className="prompt">$</span> pnpm install && pnpm dev
          </pre>
        </aside>
      </div>
    </main>
  );
}
