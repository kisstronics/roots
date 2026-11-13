import { useEffect, useRef, useState } from "react";
import { loadPhotoFile, loadPhotoUrl } from "../lib/photo";
import { PhotoCropper } from "./PhotoCropper";

interface PhotoSource {
  image: HTMLImageElement;
  release: () => void;
}

interface PhotoFieldProps {
  photo: string | null;
  onChange: (photo: string | null) => void;
}

export function PhotoField({ photo, onChange }: PhotoFieldProps) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<PhotoSource | null>(null);
  const sourceRef = useRef<PhotoSource | null>(null);

  useEffect(() => {
    return () => sourceRef.current?.release();
  }, []);

  function openSource(next: PhotoSource) {
    sourceRef.current?.release();
    sourceRef.current = next;
    setSource(next);
  }

  function closeSource() {
    sourceRef.current?.release();
    sourceRef.current = null;
    setSource(null);
  }

  return (
    <div className="photo-field">
      <label>
        Photo
        <input
          type="file"
          accept="image/*"
          data-testid="photo-input"
          disabled={reading}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setReading(true);
            setError(null);
            try {
              const loaded = await loadPhotoFile(file);
              openSource(loaded);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not read that image.");
            } finally {
              setReading(false);
            }
          }}
        />
      </label>
      {reading && <p className="hint">Reading the photo…</p>}
      {source && (
        <PhotoCropper
          image={source.image}
          onCancel={closeSource}
          onUse={(next) => {
            onChange(next);
            closeSource();
          }}
        />
      )}
      {photo && !source && (
        <div className="photo-chosen">
          <img className="photo-preview" src={photo} alt="" />
          <button
            type="button"
            className="button ghost"
            onClick={async () => {
              setReading(true);
              setError(null);
              try {
                const image = await loadPhotoUrl(photo);
                openSource({ image, release: () => undefined });
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Could not open that photo.");
              } finally {
                setReading(false);
              }
            }}
          >
            Adjust
          </button>
          <button type="button" className="button ghost" onClick={() => onChange(null)}>
            Remove photo
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
