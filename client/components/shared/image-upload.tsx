"use client";

import { useEffect, useRef, useState } from "react";

import { Button, Input } from "@/components/dashboard/ui";
import { ApiError } from "@/lib/api";
import { uploadLogoToCloudinary } from "@/lib/media";
import { Logo } from "@/components/shared/logo";

function toErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Upload failed.";
}

type ImageUploadProps = {
  token: string | null;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  alt: string;
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export function ImageUpload({
  token,
  value,
  onChange,
  disabled = false,
  alt,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState(value ?? "");

  useEffect(() => {
    setUrlDraft(value ?? "");
  }, [value]);

  async function handleFileSelect(file: File) {
    if (!token) {
      setError("Session is missing. Sign in again.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Select an image file.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("Logo must be 5MB or smaller.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const nextUrl = await uploadLogoToCloudinary({
        file,
        token,
      });
      setUrlDraft(nextUrl);
      onChange(nextUrl);
    } catch (uploadError) {
      setError(toErrorMessage(uploadError));
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function applyUrl() {
    const nextValue = urlDraft.trim();

    if (!nextValue) {
      setError(null);
      onChange(null);
      return;
    }

    try {
      const normalized = new URL(nextValue).toString();
      setError(null);
      setUrlDraft(normalized);
      onChange(normalized);
    } catch {
      setError("Enter a valid image URL.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex h-24 items-center justify-center rounded-[1.5rem] border border-[color:var(--line)] bg-[#f5f4ef] px-4">
        {value ? (
          <img src={value} alt={alt} className="max-h-12 w-auto object-contain" />
        ) : (
          <Logo />
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (file) {
            void handleFileSelect(file);
          }
        }}
      />

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={disabled || isUploading || !token}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? "Uploading..." : value ? "Replace image" : "Upload image"}
        </Button>
        <Button
          type="button"
          tone="neutral"
          disabled={disabled || isUploading}
          onClick={applyUrl}
        >
          Use URL
        </Button>
        {(value || urlDraft.trim()) ? (
          <Button
            type="button"
            tone="neutral"
            disabled={disabled || isUploading}
            onClick={() => {
              setError(null);
              setUrlDraft("");
              onChange(null);
            }}
          >
            Remove
          </Button>
        ) : null}
      </div>

      <Input
        type="url"
        value={urlDraft}
        onChange={(event) => {
          setError(null);
          setUrlDraft(event.target.value);
        }}
        placeholder="https://..."
        disabled={disabled || isUploading}
      />

      <p className="text-xs leading-6 text-[color:var(--muted)]">
        Upload a file or paste an image URL. PNG, JPG, WEBP, or SVG. Max 5MB.
      </p>

      {error ? (
        <p className="text-sm text-[#a8382b]">{error}</p>
      ) : null}
    </div>
  );
}
