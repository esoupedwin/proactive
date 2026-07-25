"use client";

import { useState } from "react";

/**
 * Report cover image. Plain <img> because sources can be any domain; hides
 * itself entirely if the image fails to load (dead link, hotlink block).
 */
export function HeroImage({
  url,
  alt,
  credit,
  creditUrl,
}: {
  url: string;
  alt: string;
  credit: string | null;
  creditUrl: string | null;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <figure className="mb-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="aspect-video w-full rounded-md border border-rule bg-neutral-100 object-cover"
      />
      {credit && (
        <figcaption className="mt-1.5 text-xs text-ink-faint">
          Image:{" "}
          {creditUrl ? (
            <a
              href={creditUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink hover:underline"
            >
              {credit}
            </a>
          ) : (
            credit
          )}
        </figcaption>
      )}
    </figure>
  );
}
