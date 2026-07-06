import { useRef, useState } from "react";
import { Upload, Link2, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { supabaseDb } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface ImageFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  bucket?: string;
  pathPrefix?: string;
  aspectClass?: string;
  /** Show as small square avatar rather than wide banner */
  variant?: "banner" | "square" | "card";
}

export function ImageField({
  label,
  value,
  onChange,
  bucket = "vehicle-images",
  pathPrefix = "food",
  aspectClass,
  variant = "banner",
}: ImageFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const containerClass =
    aspectClass ??
    (variant === "square"
      ? "h-20 w-20"
      : variant === "card"
      ? "h-36 w-full"
      : "h-28 w-full");

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${pathPrefix}/${Date.now()}.${ext}`;
      const { error } = await supabaseDb.storage.from(bucket).upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabaseDb.storage.from(bucket).getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <Label className="text-sm">{label}</Label>
      {value && (
        <div className={`relative mt-1 mb-2 overflow-hidden rounded-xl bg-muted ${containerClass}`}>
          <img src={value} alt="" className="h-full w-full object-cover" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="absolute right-1.5 top-1.5 h-7 w-7 p-0 bg-background/80 hover:bg-background"
            onClick={() => onChange("")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <div className="mt-1 flex gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={upload} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={uploading}
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
          onClick={() => setShowUrl((v) => !v)}
        >
          <Link2 className="h-3.5 w-3.5" />
          URL
        </Button>
      </div>
      {showUrl && (
        <div className="mt-2 flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://..."
            className="text-sm"
          />
          <Button
            size="sm"
            onClick={() => {
              onChange(urlInput.trim());
              setUrlInput("");
              setShowUrl(false);
            }}
          >
            Set
          </Button>
        </div>
      )}
    </div>
  );
}
