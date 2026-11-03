export const JNU_ORIGIN = "https://sel.jnu.ac.kr";
export type JnuPage = "course" | "index" | "assignment";
const paths: Record<JnuPage, string> = {
  course: "/course/view.php",
  index: "/mod/assign/index.php",
  assignment: "/mod/assign/view.php",
};

/** Only accept explicit JNU pages with a single numeric Moodle ID. */
export function jnuPageUrl(value: unknown, page: JnuPage): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, JNU_ORIGIN);
    const ids = url.searchParams.getAll("id");
    if (
      url.protocol !== "https:" ||
      url.origin !== JNU_ORIGIN ||
      url.username ||
      url.password ||
      url.pathname !== paths[page] ||
      ids.length !== 1 ||
      !/^[1-9]\d*$/.test(ids[0])
    )
      return null;
    return `${JNU_ORIGIN}${paths[page]}?id=${ids[0]}`;
  } catch {
    return null;
  }
}
export function jnuAttachmentUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, JNU_ORIGIN);
    const files = url.searchParams.getAll("file");
    if (
      url.protocol !== "https:" ||
      url.origin !== JNU_ORIGIN ||
      url.username ||
      url.password ||
      url.pathname !== "/pluginfile.php" ||
      files.length !== 1 ||
      !/^\/\d+\/mod_assign\/(introattachment|intro)\//.test(files[0])
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
export function validJnuAssignment(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const item = value as { id?: unknown; url?: unknown };
  const url = jnuPageUrl(item.url, "assignment");
  return !!url && item.id === `jnu:${new URL(url).searchParams.get("id")}`;
}
