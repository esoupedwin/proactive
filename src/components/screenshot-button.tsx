"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import { Spinner } from "./ui";

type State = "idle" | "capturing" | "shared" | "saved" | "error";

/**
 * Saves the report region as a PNG. Uses the native share sheet when the
 * browser supports sharing files (iOS Safari can't download canvas blobs
 * reliably), otherwise falls back to a download link.
 *
 * Elements marked data-no-capture are excluded from the image.
 */
export function ScreenshotButton({
  targetId,
  filename,
}: {
  targetId: string;
  filename: string;
}) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function capture() {
    const node = document.getElementById(targetId);
    if (!node) {
      setState("error");
      setMessage("Could not find the report on the page.");
      return;
    }

    setState("capturing");
    setMessage(null);

    try {
      // Loaded on demand — this library is large and most sessions never
      // take a screenshot.
      const { default: html2canvas } = await import("html2canvas-pro");

      const canvas = await html2canvas(node, {
        backgroundColor: "#fdfdfc",
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
        logging: false,
        ignoreElements: (element) => element.hasAttribute("data-no-capture"),
      });

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Could not encode the image.");

      const file = new File([blob], filename, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        setState("shared");
        setMessage("Shared.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setState("saved");
      setMessage(`Saved as ${filename}`);
    } catch (err) {
      // A cancelled share sheet is a user action, not a failure.
      if (err instanceof DOMException && err.name === "AbortError") {
        setState("idle");
        return;
      }
      console.error("screenshot failed", err);
      setState("error");
      setMessage("Could not create the image. Try again.");
    }
  }

  return (
    <div data-no-capture className="contents">
      <button
        type="button"
        onClick={capture}
        disabled={state === "capturing"}
        aria-label="Save this report as an image"
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rule px-4 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
      >
        {state === "capturing" ? (
          <>
            <Spinner /> Capturing…
          </>
        ) : (
          <>
            <Camera className="size-4" aria-hidden /> Screenshot
          </>
        )}
      </button>
      {message && state !== "capturing" && (
        <p
          role="status"
          className={
            state === "error"
              ? "w-full text-xs font-medium text-red-700"
              : "w-full text-xs font-medium text-emerald-700"
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
