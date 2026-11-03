import { jnuAttachmentUrl, JNU_ORIGIN } from "./jnu-urls.js";
import type { Attachment } from "../core/model.js";

/** JNU serves assignment instructions through Moodle's mod_assign file areas. */
export function assignmentAttachments(
  links: Array<{ href: string; name: string }>,
  origin: string,
): Attachment[] {
  const found = new Map<string, Attachment>();
  for (const link of links) {
    try {
      const url = new URL(link.href, origin);
      if (origin !== JNU_ORIGIN || !jnuAttachmentUrl(url.href)) continue;
      const filePath = url.searchParams.get("file") || "";
      if (!/^\/\d+\/mod_assign\/(introattachment|intro)\//.test(filePath))
        continue;
      const name = link.name.trim() || filePath.split("/").pop() || "첨부파일";
      found.set(url.href, { name, url: url.href });
    } catch {
      /* Ignore malformed LMS links. */
    }
  }
  return [...found.values()];
}
