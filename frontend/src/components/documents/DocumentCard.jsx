import React, { useState } from "react";
import { FileText, Image, ChevronDown, ChevronUp } from "lucide-react";
import Badge from "../ui/Badge";

function isPdf(filename) {
  return (filename || "").toLowerCase().endsWith(".pdf");
}

export default function DocumentCard({ type, filename, confidence, data, status }) {
  const [expanded, setExpanded] = useState(false);
  const isPdfFile = isPdf(filename);
  const confNum = typeof confidence === "number" ? confidence : parseFloat(confidence) || 0;
  const confPct = Math.round(confNum * (confNum <= 1 ? 100 : 1));

  const confVariant = confPct >= 90 ? "success" : "warning";

  const dataEntries = data
    ? Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "")
    : [];

  return (
    <div className="bg-white rounded-xl border border-surface-border shadow-card p-4 transition-all duration-200 hover:shadow-card-hover">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isPdfFile ? "bg-red-50" : "bg-blue-50"}`}>
          {isPdfFile
            ? <FileText size={20} className="text-red-500" />
            : <Image size={20} className="text-blue-500" />
          }
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {type && (
                <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wide mb-0.5">{type}</p>
              )}
              <p className="text-sm font-medium text-ink truncate" title={filename}>
                {filename || "Document"}
              </p>
            </div>
            {confPct > 0 && (
              <Badge variant={confVariant} className="flex-shrink-0">
                Confiance IA {confPct}%
              </Badge>
            )}
          </div>

          {status && (
            <Badge variant={status === "ok" ? "success" : status === "invalid" ? "danger" : "warning"} className="mt-1.5">
              {status}
            </Badge>
          )}
        </div>
      </div>

      {dataEntries.length > 0 && (
        <div className="mt-3 pt-3 border-t border-surface-border">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Données extraites ({dataEntries.length})
          </button>

          {expanded && (
            <div className="mt-2 space-y-1.5">
              {dataEntries.map(([key, val]) => (
                <div key={key} className="flex gap-2">
                  <span className="text-xs text-ink-tertiary capitalize w-28 flex-shrink-0">{key.replace(/_/g, " ")}</span>
                  <span className="text-xs text-ink font-medium">{String(val)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
