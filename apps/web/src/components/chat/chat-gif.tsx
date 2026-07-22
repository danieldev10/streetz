import Image from "next/image";

export function ChatGif({ url, alt = "Shared GIF" }: { url: string; alt?: string }) {
  return (
    <div className="relative aspect-[4/3] w-56 max-w-full overflow-hidden rounded-2xl bg-black/5">
      <Image src={url} alt={alt} fill sizes="224px" className="object-cover" unoptimized />
    </div>
  );
}
