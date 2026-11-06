/** Fetch an image URL (HTTPS or same-origin path) as a data URL for jsPDF. */
export async function loadImageDataUrl(src: string): Promise<string | null> {
  const trimmed = src.trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(trimmed);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" {
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) {
    return "JPEG";
  }
  return "PNG";
}
