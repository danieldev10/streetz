"use client";

import Image from "next/image";
import { useState } from "react";
import { Laugh, LoaderCircle, Search, X } from "lucide-react";

const EMOJIS = ["😀", "😂", "🥰", "😍", "😘", "😊", "😎", "🥳", "😭", "😅", "🙃", "😉", "🤔", "😳", "😡", "❤️", "🔥", "✨", "🎉", "👏", "🙌", "👍", "👀", "💯"];

type GifResult = { id: string; title: string; url: string; previewUrl: string; width: number; height: number };

export function ChatMediaPicker({ onEmoji, onGif, disabled }: {
  onEmoji: (emoji: string) => void;
  onGif: (url: string) => void;
  disabled?: boolean;
}) {
  const [panel, setPanel] = useState<"emoji" | "gif" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function searchGifs() {
    const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY?.trim();
    if (!apiKey) {
      setError("GIF search is not configured yet.");
      return;
    }

    setIsSearching(true);
    setError(null);
    try {
      const endpoint = query.trim() ? "search" : "trending";
      const params = new URLSearchParams({ api_key: apiKey, limit: "18", rating: "pg", bundle: "messaging_non_clips" });
      if (query.trim()) params.set("q", query.trim().slice(0, 50));
      const response = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params.toString()}`);
      if (!response.ok) throw new Error("GIF search failed");
      const payload = await response.json() as { data?: Array<{ id: string; title?: string; images?: { fixed_width?: { url?: string; width?: string; height?: string }; fixed_width_small?: { url?: string } } }> };
      setResults((payload.data ?? []).flatMap((gif) => {
        const rendition = gif.images?.fixed_width;
        if (!rendition?.url) return [];
        return [{
          id: gif.id,
          title: gif.title || "GIF",
          url: rendition.url,
          previewUrl: gif.images?.fixed_width_small?.url || rendition.url,
          width: Number(rendition.width) || 200,
          height: Number(rendition.height) || 150
        }];
      }));
    } catch {
      setError("Could not load GIFs right now.");
    } finally {
      setIsSearching(false);
    }
  }

  function openPanel(nextPanel: "emoji" | "gif") {
    const opening = panel !== nextPanel;
    setPanel(opening ? nextPanel : null);
    if (opening && nextPanel === "gif" && results.length === 0) void searchGifs();
  }

  return (
    <div className="relative flex shrink-0 items-center gap-1">
      <button type="button" className="inline-flex size-10 items-center justify-center rounded-full text-[#666] hover:bg-[#fafafa] disabled:opacity-50" onClick={() => openPanel("emoji")} disabled={disabled} aria-label="Add emoji">
        <Laugh className="size-5" aria-hidden="true" />
      </button>
      <button type="button" className="inline-flex h-10 items-center justify-center rounded-full px-2 text-xs font-bold text-[#7c1f7d] hover:bg-[#fafafa] disabled:opacity-50" onClick={() => openPanel("gif")} disabled={disabled} aria-label="Add GIF">
        GIF
      </button>

      {panel ? (
        <div className="absolute bottom-full left-0 z-40 mb-3 w-[min(22rem,calc(100vw-2rem))] rounded-[24px] border border-black/8 bg-white p-3 shadow-[0_18px_55px_rgba(0,0,0,0.18)]">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">{panel === "emoji" ? "Emoji" : "Choose a GIF"}</p>
            <button type="button" className="inline-flex size-8 items-center justify-center rounded-full hover:bg-[#fafafa]" onClick={() => setPanel(null)} aria-label="Close picker"><X className="size-4" /></button>
          </div>
          {panel === "emoji" ? (
            <div className="grid grid-cols-6 gap-1">
              {EMOJIS.map((emoji) => <button key={emoji} type="button" className="rounded-xl p-2 text-2xl hover:bg-[#f6e0f6]" onClick={() => onEmoji(emoji)}>{emoji}</button>)}
            </div>
          ) : (
            <>
              <div className="mb-3 flex gap-2" role="search">
                <input
                  className="h-10 min-w-0 flex-1 rounded-full border border-black/8 px-3 text-sm outline-none focus:border-[#bd40be]"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchGifs();
                    }
                  }}
                  placeholder="Search GIPHY"
                  maxLength={50}
                />
                <button type="button" className="inline-flex size-10 items-center justify-center rounded-full bg-[#0d0d0d] text-white" onClick={() => void searchGifs()} aria-label="Search GIFs">{isSearching ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}</button>
              </div>
              {error ? <p className="rounded-xl bg-[#fdecec] p-3 text-xs text-[#b3261e]">{error}</p> : null}
              <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
                {results.map((gif) => (
                  <button key={gif.id} type="button" className="relative min-h-24 overflow-hidden rounded-xl bg-[#f2f2f2]" onClick={() => { onGif(gif.url); setPanel(null); }} aria-label={`Send ${gif.title}`}>
                    <Image src={gif.previewUrl} alt={gif.title} fill sizes="160px" className="object-cover" unoptimized />
                  </button>
                ))}
              </div>
              <p className="mt-2 text-right text-[10px] font-semibold text-[#888]">Powered by GIPHY</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
