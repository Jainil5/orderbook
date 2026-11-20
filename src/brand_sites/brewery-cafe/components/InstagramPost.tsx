'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

/**
 * A live Instagram embed in the cafe's frame. Instagram's public embeds
 * report their height over postMessage (a JSON string mentioning the short
 * code), so we listen for ours and stretch the iframe to fit. If Instagram
 * refuses to render, the card falls back to a clean "Open on Instagram"
 * plate instead of a dead grey box.
 */
export function InstagramPost({ url, caption }: { url: string; caption: string }) {
  const match = url.match(/instagram\.com\/(?:[\w.-]+\/)?(p|reel)\/([\w-]+)/);
  const kind = match?.[1];
  const code = match?.[2];
  const src = kind && code ? `https://www.instagram.com/${kind}/${code}/embed/captioned/` : null;
  const [height, setHeight] = useState(560);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!code) return;
    const onMessage = (e: MessageEvent) => {
      if (typeof e.data !== 'string' || !e.data.includes(code)) return;
      try {
        const payload = JSON.parse(e.data);
        if (typeof payload.height === 'number' && payload.height > 200) {
          setHeight(Math.min(payload.height + 40, 940));
        }
      } catch {
        /* not a resize message for this post */
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [code]);

  return (
    <figure className="bc-post">
      <div className="bc-post-frame">
        {src && !failed ? (
          <iframe
            src={src}
            title={caption}
            loading="lazy"
            scrolling="no"
            onError={() => setFailed(true)}
            style={{ height, width: '100%', border: 0 }}
          />
        ) : (
          <div className="bc-post-fallback">
            <span aria-hidden className="bc-post-fallback-mark" />
            <p className="bc-serif bc-post-fallback-caption">{caption}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring bc-btn bc-btn-solid bc-post-fallback-btn"
            >
              <ExternalLink aria-hidden className="h-4 w-4" /> Open on Instagram
            </a>
          </div>
        )}
      </div>
    </figure>
  );
}
