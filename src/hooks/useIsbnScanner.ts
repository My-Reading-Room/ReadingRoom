"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue?: string }[]> };
type DetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

/**
 * Scan an ISBN-13 barcode with the camera using the browser's BarcodeDetector.
 * The camera stops as soon as a code is found, on stop(), and on unmount.
 */
export function useIsbnScanner(onIsbn: (isbn: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);
    const BarcodeDetector = (window as unknown as { BarcodeDetector?: DetectorClass })
      .BarcodeDetector;
    if (!BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setError(
        "Camera barcode scanning is not supported in this browser. Type the ISBN in the search field.",
      );
      return;
    }
    try {
      const supported = await BarcodeDetector.getSupportedFormats();
      const formats = ["ean_13", "upc_a", "ean_8"].filter((f) => supported.includes(f));
      if (!formats.length) {
        setError("This browser cannot scan ISBN barcodes. Type the ISBN instead.");
        return;
      }
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      setActive(true);
      const video = videoRef.current;
      if (!video) return stop();
      video.srcObject = stream.current;
      await video.play();
      const detector = new BarcodeDetector({ formats });
      const tick = async () => {
        if (!stream.current) return;
        try {
          const found = await detector.detect(video);
          const code = found
            .map((x) => String(x.rawValue || "").replace(/\D/g, ""))
            .find((x) => x.length === 13 && (x.startsWith("978") || x.startsWith("979")));
          if (code) {
            stop();
            onIsbn(code);
            return;
          }
        } catch {
          // The camera can be briefly unavailable while focusing.
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch (e) {
      stop();
      setError(`Camera unavailable: ${(e as Error).message || "Permission denied"}`);
    }
  }, [onIsbn, stop]);

  return { videoRef, active, error, start, stop };
}
