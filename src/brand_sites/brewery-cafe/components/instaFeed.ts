/**
 * Slots for the cafe's own Instagram posts — add a URL (and its caption) here
 * and nowhere else. URLs must be `https://www.instagram.com/<p|reel>/<code>/`.
 *
 * The array ships empty on purpose. The app's content-security policy frames
 * only its own origin, and posting someone else's handle here would send
 * customers to a page this cafe does not own, so the whole shelf — and its
 * link in the nav — stays hidden until the owner supplies their own embeds.
 */
export interface InstaPost {
  url: string;
  caption: string;
}

export const instaFeed: InstaPost[] = [];
