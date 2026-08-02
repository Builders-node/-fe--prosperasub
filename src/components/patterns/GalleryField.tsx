import { useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Link2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";

/**
 * N-photo gallery editor for a provider — used inside ProviderEditDialog and
 * anywhere a business owner needs to attach multiple images to a record.
 *
 *  - Uploads to Supabase Storage bucket (defaults to `vehicle-images` for
 *    parity with `ImageField` — swap once we mint a dedicated bucket).
 *  - Falls back to "paste URL" for anyone who already has hosted images.
 *  - Left/right nudges reorder in place; trash removes.
 *  - The parent owns the array; this component is pure input.
 */
interface GalleryFieldProps {
  label?: string;
  /** Full list of image URLs. Never null — parent normalises. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Storage bucket. Must be public-readable. */
  bucket?: string;
  /** Path segment prefix inside the bucket — e.g. "providers/gallery". */
  pathPrefix?: string;
  /** Cap the gallery so admins don't accidentally upload 500 shots. */
  max?: number;
}

export function GalleryField({
  label = "Gallery",
  value,
  onChange,
  bucket = "vehicle-images",
  pathPrefix = "providers/gallery",
  max = 12,
}: GalleryFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const urls = Array.isArray(value) ? value.filter(Boolean) : [];
  const atCap = urls.length >= max;

  // Multi-file: sequential upload (parallel upload against the same bucket
  // occasionally trips the shared 6-connection cap in some browsers).
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const room = Math.max(0, max - urls.length);
      const toUpload = files.slice(0, room);
      if (files.length > room) {
        toast.warning(`Gallery capped at ${max}. Only ${room} of ${files.length} files uploaded.`);
      }
      const added: string[] = [];
      for (const [i, file] of toUpload.entries()) {
        const ext = file.name.split(".").pop();
        const path = `${pathPrefix}/${Date.now()}-${i}.${ext}`;
        const { error } = await supabaseDb.storage
          .from(bucket).upload(path, file, { upsert: true, contentType: file.type });
        if (error) throw error;
        const { data } = supabaseDb.storage.from(bucket).getPublicUrl(path);
        added.push(data.publicUrl);
      }
      if (added.length) {
        onChange([...urls, ...added]);
        toast.success(added.length === 1 ? "Image added" : `${added.length} images added`);
      }
    } catch (err) {
      toast.error((err as Error).message || String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAt = (idx: number) => onChange(urls.filter((_, i) => i !== idx));

  const move = (idx: number, delta: number) => {
    const next = [...urls];
    const target = idx + delta;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };

  const addUrl = () => {
    const clean = urlInput.trim();
    if (!clean) return;
    if (atCap) { toast.warning(`Gallery capped at ${max}.`); return; }
    onChange([...urls, clean]);
    setUrlInput("");
    setShowUrl(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-caption text-muted-foreground">{urls.length} / {max}</span>
      </div>

      {urls.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {urls.map((url, idx) => (
            <div key={url + idx} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
              <img src={url} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-background/85 px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="rounded p-1 text-foreground hover:bg-muted disabled:opacity-30"
                    aria-label="Move left"
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, +1)}
                    disabled={idx === urls.length - 1}
                    className="rounded p-1 text-foreground hover:bg-muted disabled:opacity-30"
                    aria-label="Move right"
                  >
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="rounded p-1 text-destructive hover:bg-destructive/10"
                  aria-label="Remove image"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={upload}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={uploading || atCap}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Spinner size="xs" /> : <Upload className="h-3.5 w-3.5" />}
          Upload
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={atCap}
          onClick={() => setShowUrl((v) => !v)}
        >
          <Link2 className="h-3.5 w-3.5" />
          URL
        </Button>
      </div>

      {showUrl && !atCap && (
        <div className="mt-2 flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://…"
            className="text-sm"
          />
          <Button size="sm" onClick={addUrl}>Add</Button>
        </div>
      )}

      {atCap && (
        <p className="mt-1.5 text-caption text-muted-foreground">
          Cap reached. Remove an image to add more.
        </p>
      )}
    </div>
  );
}
