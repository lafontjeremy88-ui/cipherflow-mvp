import React, { useRef, useState } from "react";
import { Upload } from "lucide-react";

export default function UploadZone({ onFiles, accept = "*", multiple = true, disabled = false }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length && onFiles) onFiles(files);
  }

  function handleChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length && onFiles) onFiles(files);
    e.target.value = "";
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={[
        "flex flex-col items-center justify-center gap-3 p-10",
        "border-2 border-dashed rounded-xl cursor-pointer",
        "transition-all duration-200 ease-in-out",
        dragging
          ? "bg-blue-50 border-blue-300"
          : "bg-surface-bg border-surface-border hover:bg-blue-50/50 hover:border-blue-200",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <div className={`p-3 rounded-full transition-colors duration-200 ${dragging ? "bg-blue-100" : "bg-surface-muted"}`}>
        <Upload size={28} className={dragging ? "text-blue-500" : "text-ink-tertiary"} />
      </div>

      <div className="text-center">
        <p className="text-sm font-medium text-ink">
          {dragging ? "Relâchez pour déposer" : "Glissez vos documents ici"}
        </p>
        <p className="text-sm text-ink-tertiary mt-0.5">ou cliquez pour parcourir</p>
      </div>

      <p className="text-xs text-ink-tertiary">PDF, JPEG, PNG — max 10 MB</p>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}
