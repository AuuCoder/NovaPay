"use client";

import type { ChangeEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";

export function ChannelQrImageField(props: {
  name: string;
  uploadName: string;
  removeName: string;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  inputClassName: string;
  textareaClassName: string;
}) {
  const inputId = useId();
  const removeId = useId();
  const [value, setValue] = useState(props.defaultValue ?? "");
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removeChecked, setRemoveChecked] = useState(false);

  const previewUrl = useMemo(() => {
    if (selectedFilePreviewUrl) {
      return selectedFilePreviewUrl;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("data:image/") || /^https?:\/\//i.test(trimmed) || trimmed.startsWith("/")) {
      return trimmed;
    }
    return null;
  }, [selectedFilePreviewUrl, value]);

  useEffect(() => {
    return () => {
      if (selectedFilePreviewUrl) {
        URL.revokeObjectURL(selectedFilePreviewUrl);
      }
    };
  }, [selectedFilePreviewUrl]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFilePreviewUrl(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件。");
      return;
    }

    if (selectedFilePreviewUrl) {
      URL.revokeObjectURL(selectedFilePreviewUrl);
    }

    setSelectedFilePreviewUrl(URL.createObjectURL(file));
    setError(null);
  }

  const field = props.multiline ? (
    <textarea
      name={props.name}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder={props.placeholder}
      className={`${props.textareaClassName} min-h-[110px] font-sans text-sm`}
    />
  ) : (
    <input
      name={props.name}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder={props.placeholder}
      className={props.inputClassName}
    />
  );

  return (
    <div className="space-y-3">
      {field}
      <div className="rounded-[1rem] border border-line bg-white/70 p-3">
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-foreground"
        >
          选择收款码图片
        </label>
        <input
          id={inputId}
          type="file"
          name={props.uploadName}
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <p className="mt-2 text-xs leading-6 text-muted">
          可直接粘贴图片 URL / Data URL，或上传 PNG / JPG / WEBP / GIF 图片。单文件大小上限 2MB。
        </p>
        <label htmlFor={removeId} className="mt-2 flex items-center gap-2 text-xs text-muted">
          <input
            id={removeId}
            type="checkbox"
            name={props.removeName}
            checked={removeChecked}
            onChange={(event) => setRemoveChecked(event.target.checked)}
            className="h-4 w-4 rounded border-line"
          />
          删除当前已保存的收款码图片
        </label>
        {error ? <p className="mt-2 text-xs leading-6 text-[#9b3d18]">{error}</p> : null}
        {previewUrl ? (
          <div className="mt-3 rounded-[1rem] border border-line bg-[#faf7f1] p-3">
            <p className="text-xs font-medium text-muted">当前预览</p>
            <img
              src={previewUrl}
              alt="收款码预览"
              className="mt-3 max-h-64 rounded-lg border border-line bg-white object-contain"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
