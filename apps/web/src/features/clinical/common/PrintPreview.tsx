'use client';

import { Button } from '@hos/ui';

export function PrintPreview({ html, onDownload, downloading }: { html: string; onDownload: () => void; downloading?: boolean }) {
  return (
    <div>
      <Button type="button" variant="secondary" onClick={onDownload} loading={downloading}>
        Download PDF
      </Button>
      <iframe title="Print preview" srcDoc={html} style={{ display: 'block', width: '100%', minHeight: 480, marginTop: 8, border: '1px solid var(--hos-border, #d5dde5)', background: '#fff' }} />
    </div>
  );
}
