"use client";

import { useState } from "react";

export function ExpandableText({ text, maxLines = 3 }: { text: string; maxLines?: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <p
        className={`text-[15px] leading-relaxed text-white/70 whitespace-pre-line ${
          !expanded ? `line-clamp-${maxLines}` : ""
        }`}
        style={!expanded ? { WebkitLineClamp: maxLines, display: "-webkit-box", WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}
      >
        {text}
      </p>
      {text.length > 150 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-sm font-medium text-white/50 hover:text-white/80 transition-colors"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
