import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * The model a CAD viewer's own address shows, or null for any other link. The CAD tools print a
 * model's page as `view: http://127.0.0.1:54360/<id>?token=…`, and an agent links to it in a chat or
 * a report. That page is for a browser with no Studio around it: in Studio the model opens by its
 * id in the CAD view (`openDocumentInPanel`), and the address's token stays out of the page.
 */
export function viewerLinkModel(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" || !LOOPBACK.has(url.hostname)) return null;
  const id = url.pathname.replace(/^\/|\/$/g, "");
  return isDocumentId(id) ? id : null;
}
